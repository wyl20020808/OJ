import type {
  FavoriteProblem,
  ProfileOverview,
  ProfileProblem,
  ProfileSubmission,
  PublicProfile,
  SolvedProblem,
} from '../../services/api.js';
import type { UserActivityDay } from '../../services/portal-contracts.js';

const avatar = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="#1b6675"/><circle cx="80" cy="60" r="30" fill="#f4c38b"/><path d="M28 154c8-36 28-55 52-55s44 19 52 55" fill="#f0e4d0"/></svg>',
)}`;
const background = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 260"><rect width="1200" height="260" fill="#173c46"/><path d="M0 210 240 100l220 92 260-140 220 104 260-120v224H0Z" fill="#245968"/><circle cx="950" cy="68" r="35" fill="#e7bc6c"/></svg>',
)}`;

/** Development-only data for manual Profile UI review. Never send to production APIs. */
export const PROFILE_DEVELOPMENT_FIXTURE = {
  profile: {
    username: 'demo-runner',
    displayName: 'Demo Runner',
    headline: 'Algorithm learner · builds steadily',
    bio: 'Development fixture data for reviewing Profile layout, interactions, and data-density states.',
    location: 'Shanghai',
    organization: 'OJPlatform Lab',
    website: 'https://example.test/profile-demo',
    github: 'demo-runner',
    avatarUrl: avatar,
    backgroundUrl: background,
    createdAt: '2025-03-12T09:00:00.000Z',
    capabilities: {
      contractVersion: 'profile-capabilities-v1',
      favorites: { available: true },
      myContests: { available: true },
      myProblems: { available: true },
      activity: { available: true },
      heatmap: { available: true },
      teams: { available: true },
      homework: { available: false, reason: 'PRODUCT_DOMAIN_NOT_IMPLEMENTED' },
      wrongbook: {
        available: false,
        reason: 'UPSTREAM_BLOCKED_BY_AUTHORITATIVE_SUBMISSION_OUTCOME',
      },
    },
    isSelf: true,
    canCreateProblems: true,
    teams: [
      {
        name: 'Algorithm Study Group',
        slug: 'algorithm-study',
        role: 'MEMBER',
        visibility: 'PUBLIC',
        description: 'Weekly practice and solution review.',
      },
      {
        name: 'Problem Authors',
        slug: 'problem-authors',
        role: 'MANAGER',
        visibility: 'PRIVATE',
        description: 'Development-space authoring collaboration.',
      },
    ],
  } satisfies PublicProfile,
  overview: {
    createdProblemCount: 8,
    solvedProblemCount: 37,
    submissionCount: 126,
    acceptedSubmissionCount: 54,
    favoriteCount: 12,
    teamCount: 2,
  } satisfies ProfileOverview,
  activity: [
    {
      date: '2026-09-02',
      submissionCount: 4,
      acceptedCount: 2,
      metric: 'SUBMISSIONS',
    },
    {
      date: '2026-09-04',
      submissionCount: 3,
      acceptedCount: 1,
      metric: 'SUBMISSIONS',
    },
    {
      date: '2026-09-06',
      submissionCount: 6,
      acceptedCount: 3,
      metric: 'SUBMISSIONS',
    },
    {
      date: '2026-09-08',
      submissionCount: 2,
      acceptedCount: 1,
      metric: 'SUBMISSIONS',
    },
    {
      date: '2026-09-10',
      submissionCount: 5,
      acceptedCount: 2,
      metric: 'SUBMISSIONS',
    },
  ] satisfies UserActivityDay[],
  solved: [
    {
      problemId: 'p-graph',
      slug: 'shortest-path',
      title: 'Shortest Path Basics',
      lastAcceptedAt: '2026-09-10T09:20:00.000Z',
    },
    {
      problemId: 'p-dp',
      slug: 'knapsack',
      title: '0/1 Knapsack',
      lastAcceptedAt: '2026-09-08T14:35:00.000Z',
    },
    {
      problemId: 'p-string',
      slug: 'prefix-function',
      title: 'Prefix Function',
      lastAcceptedAt: '2026-09-06T12:10:00.000Z',
    },
  ] satisfies SolvedProblem[],
  favorites: [
    {
      problemId: 'p-tree',
      slug: 'tree-distance',
      title: 'Tree Distance Query',
      timeLimitMs: 1500,
      memoryLimitBytes: 268435456,
      favoritedAt: '2026-09-08T11:00:00.000Z',
    },
    {
      problemId: 'p-flow',
      slug: 'max-flow',
      title: 'Maximum Flow',
      timeLimitMs: 2000,
      memoryLimitBytes: 268435456,
      favoritedAt: '2026-09-04T08:30:00.000Z',
    },
  ] satisfies FavoriteProblem[],
  problems: [
    {
      id: 'author-1',
      publicNumber: 1024,
      publicId: 'P1024',
      slug: 'range-sum',
      title: 'Range Sum Query',
      status: 'published',
      visibility: 'public',
      createdAt: '2026-07-10T08:00:00.000Z',
      updatedAt: '2026-09-03T13:00:00.000Z',
    },
    {
      id: 'author-2',
      publicNumber: 1025,
      publicId: 'P1025',
      slug: 'binary-search',
      title: 'Binary Search Boundary',
      status: 'draft',
      visibility: 'private',
      createdAt: '2026-08-14T08:00:00.000Z',
      updatedAt: '2026-09-09T16:00:00.000Z',
    },
  ] satisfies ProfileProblem[],
  submissions: [
    {
      id: 'submission-demo-1',
      problemId: 'p-graph',
      slug: 'shortest-path',
      title: 'Shortest Path Basics',
      languageId: 'cpp20-gcc-13-v1',
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'AC',
      createdAt: '2026-09-10T09:20:00.000Z',
    },
    {
      id: 'submission-demo-2',
      problemId: 'p-dp',
      slug: 'knapsack',
      title: '0/1 Knapsack',
      languageId: 'cpp20-gcc-13-v1',
      status: 'COMPLETED_WITH_VERDICT',
      verdict: 'WA',
      createdAt: '2026-09-08T14:35:00.000Z',
    },
    {
      id: 'submission-demo-3',
      problemId: 'p-string',
      slug: 'prefix-function',
      title: 'Prefix Function',
      languageId: 'cpp20-gcc-13-v1',
      status: 'RUNNING',
      createdAt: '2026-09-06T12:10:00.000Z',
    },
  ] satisfies ProfileSubmission[],
};

export type ProfileDevelopmentFixture = typeof PROFILE_DEVELOPMENT_FIXTURE;
