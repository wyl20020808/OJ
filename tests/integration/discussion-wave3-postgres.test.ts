import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../packages/database/src/index.js';
import { PostgresDiscussionRepository } from '../../apps/api/src/modules/discussion/repository.js';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)(
  'Discussion Wave 3 PostgreSQL qualification',
  () => {
    it('qualifies reply parent integrity, tombstones, and durable comment likes', async () => {
      const database = createDatabase({ url: databaseUrl! });
      const client = await database.pool.connect();
      await client.query('BEGIN');
      try {
        const users = [randomUUID(), randomUUID(), randomUUID()] as const;
        for (const [n, id] of users.entries()) {
          await client.query(
            "INSERT INTO users(id,username,email,display_name,status) VALUES($1,$2,$3,$2,'active')",
            [
              id,
              `wave3-${n}-${id.slice(0, 8)}`,
              `wave3-${n}-${id}@example.test`,
            ],
          );
        }
        const repo = new PostgresDiscussionRepository(client);
        const postA = await repo.create({
          authorId: users[0],
          type: 'ARTICLE',
          title: 'A',
          contentMarkdown: 'A',
          status: 'PUBLISHED',
        });
        const postB = await repo.create({
          authorId: users[0],
          type: 'ARTICLE',
          title: 'B',
          contentMarkdown: 'B',
          status: 'PUBLISHED',
        });
        const parent = await repo.createComment({
          postId: postA.id,
          authorId: users[0],
          contentMarkdown: 'parent',
        });
        const reply = await repo.createComment({
          postId: postA.id,
          authorId: users[1],
          contentMarkdown: 'reply',
          parentCommentId: parent.id,
        });
        const nested = await repo.createComment({
          postId: postA.id,
          authorId: users[2],
          contentMarkdown: 'nested',
          parentCommentId: reply.id,
        });
        expect(reply.parentCommentId).toBe(parent.id);
        expect(nested.parentCommentId).toBe(reply.id);
        const other = await repo.createComment({
          postId: postB.id,
          authorId: users[0],
          contentMarkdown: 'other',
        });
        await expect(
          repo.createComment({
            postId: postA.id,
            authorId: users[1],
            contentMarkdown: 'cross',
            parentCommentId: other.id,
          }),
        ).rejects.toThrow('Parent comment not found');
        await repo.tombstoneComment(parent.id);
        const visible = await repo.listComments(
          postA.id,
          undefined,
          20,
          users[1],
        );
        const tombstone = visible.items.find((item) => item.id === parent.id);
        expect(tombstone?.status).toBe('DELETED');
        expect(tombstone?.contentMarkdown).toBe('');
        expect(visible.items.some((item) => item.id === reply.id)).toBe(true);
        expect(await repo.likeComment(reply.id, users[0])).toBe(true);
        expect(await repo.likeComment(reply.id, users[0])).toBe(false);
        expect((await repo.getComment(reply.id, users[0]))?.likeCount).toBe(1);
        expect((await repo.getComment(reply.id, users[0]))?.viewerLiked).toBe(
          true,
        );
        expect(await repo.unlikeComment(reply.id, users[0])).toBe(true);
        expect(await repo.unlikeComment(reply.id, users[0])).toBe(false);
        await repo.likeComment(reply.id, users[0]);
        await repo.likeComment(reply.id, users[1]);
        const reloaded = await repo.getComment(reply.id, users[1]);
        expect(reloaded?.likeCount).toBe(2);
        expect(reloaded?.viewerLiked).toBe(true);
      } finally {
        await client.query('ROLLBACK');
        client.release();
        await database.pool.end();
      }
    });
  },
);
