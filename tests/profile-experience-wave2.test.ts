import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerProfileModule } from '../apps/api/src/modules/profile/index.js';
import { InMemoryTeamRepository, TeamService } from '../apps/api/src/modules/team/index.js';

const profile = { id: 'u1', username: 'ada', display_name: 'Ada', created_at: '2026-01-01T00:00:00Z' };

function pool() {
  return {
    query: async (sql: string) => {
      if (sql.includes('FROM users WHERE username')) return { rows: [profile] };
      if (sql.includes('user_profiles')) return { rows: [{ display_name: 'Ada', headline: 'Coder', bio: '<script>x</script>' }] };
      return { rows: [] };
    },
  };
}

describe('Profile Experience Wave 2', () => {
  it('filters private teams for other viewers while keeping self access', async () => {
    const repository = new InMemoryTeamRepository();
    await repository.createTeam({ name: 'Public', slug: 'public-team', description: '', visibility: 'PUBLIC', joinPolicy: 'OPEN', ownerId: 'u1' });
    await repository.createTeam({ name: 'Private', slug: 'private-team', description: '', visibility: 'PRIVATE', joinPolicy: 'OPEN', ownerId: 'u1' });
    const service = new TeamService(repository);
    expect((await service.profileTeams('u1', 'u2')).map((team) => team.slug)).toEqual(['public-team']);
    expect((await service.profileTeams('u1', 'u1')).map((team) => team.slug)).toEqual(['private-team', 'public-team']);
  });

  it('rejects unsafe website and keeps public DTO free of private fields', async () => {
    const app = Fastify();
    await registerProfileModule(app, { pool: pool(), getAuth: async () => ({ userId: 'u1', strength: 'password' }) });
    const unsafe = await app.inject({ method: 'PATCH', url: '/api/profile/me', headers: { cookie: 'oj_csrf=t', 'x-csrf-token': 't' }, payload: { displayName: 'Ada', website: 'javascript:alert(1)' } });
    expect(unsafe.statusCode).toBe(400);
    const publicResponse = await app.inject('/api/profiles/ada');
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).not.toHaveProperty('email');
    expect(publicResponse.json()).not.toHaveProperty('id');
    expect(publicResponse.json().bio).toBe('<script>x</script>');
    await app.close();
  });
});
