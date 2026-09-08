import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { PostgresDiscussionRepository } from '../../apps/api/src/modules/discussion/repository.js';
import { registerDiscussionModule } from '../../apps/api/src/modules/discussion/routes.js';
import { createDatabase } from '../../packages/database/src/index.js';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('Discussion PostgreSQL correctness', () => {
  it('publishes article and announcement with typed identifiers and rolls fixtures back', async () => {
    const database = createDatabase({ url: databaseUrl! });
    const client = await database.pool.connect();
    await client.query('BEGIN');
    const app = Fastify({ logger: false });
    try {
      const userId = randomUUID();
      const username = `discussion-${userId.slice(0, 8)}`;
      await client.query(
        "INSERT INTO users(id,username,email,display_name,status) VALUES($1,$2,$3,$4,'active')",
        [userId, username, `${username}@example.test`, username],
      );
      let canAnnounce = false;
      await registerDiscussionModule(app, {
        repository: new PostgresDiscussionRepository(client),
        getAuthContext: async () => ({
          userId,
          sessionId: 'postgres-correctness',
          strength: 'password',
        }),
        hasCapability: async (_actorId, capability) =>
          canAnnounce && capability === 'discussion:announcement:create',
        getAuthor: async () => ({
          id: userId,
          username,
          displayName: username,
        }),
      });
      const csrf = { cookie: 'oj_csrf=t', 'x-csrf-token': 't' };
      const draft = await app.inject({
        method: 'POST',
        url: '/api/discussion/posts',
        headers: csrf,
        payload: {
          title: 'PostgreSQL draft',
          contentMarkdown: 'body',
        },
      });
      expect(draft.statusCode).toBe(201);
      const published = await app.inject({
        method: 'POST',
        url: `/api/discussion/posts/${draft.json().publicId}/publish`,
        headers: csrf,
      });
      expect(published.statusCode).toBe(200);
      expect(published.json()).toMatchObject({ status: 'PUBLISHED' });
      expect(published.json().publishedAt).toEqual(expect.any(String));
      const stored = await client.query(
        'SELECT pg_typeof(id)::text id_type,status,published_at FROM discussion_posts WHERE id=$1',
        [draft.json().id],
      );
      expect(stored.rows[0]).toMatchObject({
        id_type: 'uuid',
        status: 'PUBLISHED',
      });
      expect(stored.rows[0]?.published_at).toBeTruthy();
      const list = await app.inject({
        method: 'GET',
        url: '/api/discussion/posts',
      });
      expect(
        list
          .json()
          .items.some((item: { id: string }) => item.id === draft.json().id),
      ).toBe(true);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/discussion/posts/${draft.json().publicId}`,
          })
        ).statusCode,
      ).toBe(200);
      const deniedAnnouncement = await app.inject({
        method: 'POST',
        url: '/api/discussion/posts',
        headers: csrf,
        payload: {
          title: 'Denied announcement',
          contentMarkdown: 'body',
          type: 'ANNOUNCEMENT',
          status: 'PUBLISHED',
        },
      });
      expect(deniedAnnouncement.statusCode).toBe(403);
      canAnnounce = true;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/discussion/posts',
            headers: csrf,
            payload: {
              title: 'Allowed announcement',
              contentMarkdown: 'body',
              type: 'ANNOUNCEMENT',
              status: 'PUBLISHED',
            },
          })
        ).statusCode,
      ).toBe(201);

      await client.query(
        "INSERT INTO auth_roles(name,permissions) VALUES('platform-root',ARRAY['judge.manage']) ON CONFLICT DO NOTHING",
      );
      const migration = await readFile(
        'packages/database/migrations/0026_submission_source_permission.sql',
        'utf8',
      );
      await client.query(migration);
      const permission = await client.query(
        "SELECT permissions @> ARRAY['submission:view:any']::text[] AS allowed FROM auth_roles WHERE name='platform-root'",
      );
      expect(permission.rows[0]?.allowed).toBe(true);
    } finally {
      await app.close();
      await client.query('ROLLBACK');
      client.release();
      await database.pool.end();
    }
  });
});
