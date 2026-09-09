import { describe, expect, it } from 'vitest';
import {
  AssignmentService,
  InMemoryAssignmentRepository,
} from '../apps/api/src/modules/assignment/index.js';
import { InMemoryProblemRepository } from '../apps/api/src/modules/problem/index.js';
import { InMemorySubmissionRepository } from '../apps/api/src/modules/submission/index.js';
import {
  InMemoryTeamRepository,
  TeamService,
} from '../apps/api/src/modules/team/index.js';

const problemInput = (slug: string) => ({
  slug,
  title: slug,
  background: '',
  statement: '',
  inputDescription: '',
  outputDescription: '',
  examples: [],
  samples: [],
  constraints: '',
  notes: '',
  timeLimitMs: 1000,
  memoryLimitBytes: 1024,
  visibility: 'public' as const,
  difficulty: null,
  status: 'published' as const,
  testdataVersion: 'v1',
  authorId: 'owner',
  tags: [],
});

describe('team assignments', () => {
  it('derives visibility and progress from team membership and accepted submissions', async () => {
    const teams = new TeamService(new InMemoryTeamRepository());
    await teams.create({
      name: 'Alpha',
      slug: 'alpha',
      description: '',
      visibility: 'PRIVATE',
      joinPolicy: 'OPEN',
      ownerId: 'owner',
    });
    await teams.join('alpha', 'member');
    const problems = new InMemoryProblemRepository();
    const problem = await problems.create(problemInput('sum-one'));
    const submissions = new InMemorySubmissionRepository();
    const submission = await submissions.create({
      ownerUserId: 'member',
      problemId: problem.id,
      problemRevisionId: problem.currentRevisionId!,
      testdataVersionRef: 'v1',
      languageId: 'cpp20',
      source: 'x',
    });
    await submissions.publishEvaluation({
      submissionId: submission.id,
      judgeJobId: 'job-1',
      evaluationGeneration: 1,
      attemptGeneration: 1,
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      evaluationRecordDigest: 'digest',
    });
    const service = new AssignmentService(
      new InMemoryAssignmentRepository(),
      teams,
      problems,
      submissions,
    );
    const draft = await service.create(
      'alpha',
      { userId: 'owner' },
      { title: 'Draft', problemIds: [problem.publicId] },
    );
    await expect(service.get(draft.publicId, 'member')).rejects.toMatchObject({
      code: 'ASSIGNMENT_NOT_FOUND',
    });
    await service.setStatus(draft.publicId, 'owner', 'PUBLISHED');
    const visible = await service.get(draft.publicId, 'member');
    expect(visible.completedCount).toBe(1);
    expect(visible.problems[0]).toMatchObject({
      publicId: problem.publicId,
      completed: true,
    });
    await teams.leave('alpha', 'member');
    await expect(service.get(draft.publicId, 'member')).rejects.toMatchObject({
      code: 'TEAM_FORBIDDEN',
    });
  });

  it('rejects member creation and duplicate problems', async () => {
    const teams = new TeamService(new InMemoryTeamRepository());
    await teams.create({
      name: 'Alpha',
      slug: 'alpha',
      description: '',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      ownerId: 'owner',
    });
    await teams.join('alpha', 'member');
    const problems = new InMemoryProblemRepository();
    const problem = await problems.create(problemInput('sum-two'));
    const service = new AssignmentService(
      new InMemoryAssignmentRepository(),
      teams,
      problems,
      new InMemorySubmissionRepository(),
    );
    await expect(
      service.create(
        'alpha',
        { userId: 'member' },
        { title: 'Nope', problemIds: [problem.publicId] },
      ),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_FORBIDDEN' });
    await expect(
      service.create(
        'alpha',
        { userId: 'owner' },
        { title: 'Dup', problemIds: [problem.publicId, problem.publicId] },
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ASSIGNMENT_PROBLEM' });
  });
});
