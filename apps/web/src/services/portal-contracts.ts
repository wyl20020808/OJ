export type CapabilityState<T> =
  | { state: 'LOADING' }
  | { state: 'AVAILABLE'; data: T }
  | { state: 'EMPTY'; data: T }
  | { state: 'NOT_AVAILABLE'; reason: string }
  | { state: 'ERROR'; message: string };

export type HomeworkSummary = {
  id: string;
  title: string;
  source: string;
  dueAt: string;
  progress: number;
  uncompletedCount: number;
  status: 'OPEN' | 'COMPLETED' | 'OVERDUE';
};

export type WrongBookItem = {
  problemId: string;
  title: string;
  difficulty?: string;
  tags: string[];
  lastAttemptAt: string;
  lastVerdict: string;
  failedAttemptCount: number;
  solvedAfterwards: boolean;
};

export type ContestLifecycle =
  'DRAFT' | 'UPCOMING' | 'RUNNING' | 'ENDED' | 'CANCELLED';
export type ContestVisibility = 'PUBLIC' | 'PRIVATE';
export type ContestRegistration = 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED';
export type ContestFormat = 'ICPC' | 'IOI' | 'OI' | 'CUSTOM';

export type ContestSummary = {
  id: string;
  title: string;
  lifecycle: ContestLifecycle;
  visibility: ContestVisibility;
  registration: ContestRegistration;
  format: ContestFormat;
  startsAt: string;
  endsAt: string;
  description?: string;
  organizer?: { id: string; username: string; displayName: string };
  participantCount?: number;
  problemCount?: number;
  registrationState?: 'NOT_AUTHENTICATED' | 'NOT_REGISTERED' | 'REGISTERED';
  relationship?: 'CREATED' | 'MANAGED' | 'REGISTERED';
};

export type ContestListItem = Omit<ContestSummary, 'format' | 'registration'> &
  Partial<Pick<ContestSummary, 'format' | 'registration'>>;

export type ContestDetail = ContestSummary & {
  description: string;
  canRegister: boolean;
  canManage: boolean;
};

export type ContestProblem = {
  problemId: string;
  label: string;
  title: string;
  score?: number;
};

export type ContestSubmission = {
  id: string;
  problemId: string;
  status: string;
  createdAt: string;
};

export type ContestStanding = {
  rank: number;
  userId: string;
  displayName: string;
  solvedCount?: number;
  score?: number;
  penalty?: number;
  problemResults: Array<string | number | null>;
  lastSubmissionAt?: string;
  currentUser: boolean;
};

export type ContestRegistrationContract = {
  contestId: string;
  userId: string;
  status: 'REGISTERED' | 'CANCELLED';
  registeredAt: string;
};

export type ContestCreateRequest = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  format: ContestFormat;
  visibility: ContestVisibility;
  registrationOpen: boolean;
  privatePassword?: string;
  problems: Array<{ problemId: string; score?: number }>;
  freezeMinutes?: number;
};

export type UserActivityDay = {
  date: string;
  metric?: 'SOLVED_PROBLEMS' | 'SUBMISSIONS';
  count?: number;
  submissionCount?: number;
  acceptedCount?: number;
};

export type ConversationSummary = {
  id: string;
  kind: 'DIRECT' | 'GROUP';
  peer: { id: string; username: string; displayName: string };
  avatar?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'TEXT';
  content: string;
  sentAt: string;
  readState?: 'SENT' | 'DELIVERED' | 'READ';
  clientCorrelationId: string;
};

export type FriendSummary = {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
};

export type FriendRequest = {
  id: string;
  direction: 'RECEIVED' | 'SENT';
  user: FriendSummary;
  note?: string;
  state: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
};

export type NotificationSummary = {
  id: string;
  category:
    | 'SYSTEM'
    | 'CONTEST'
    | 'HOMEWORK'
    | 'SOCIAL'
    | 'FRIEND_REQUEST'
    | 'FRIEND_ACCEPTED'
    | 'DIRECT_MESSAGE';
  title: string;
  body: string;
  createdAt: string;
  targetRoute?: string;
  read: boolean;
};

export const portalIntegrationRequests = {
  homework: 'HOMEWORK-BACKEND-INTEGRATION-REQUEST',
  wrongBook: 'WRONG-BOOK-BACKEND-INTEGRATION-REQUEST',
  contest: 'CONTEST-BACKEND-INTEGRATION-REQUEST',
  profileActivity: 'PROFILE-ACTIVITY-BACKEND-INTEGRATION-REQUEST',
  favorites: 'FAVORITES-BACKEND-INTEGRATION-REQUEST',
  team: 'TEAM-BACKEND-INTEGRATION-REQUEST',
  notifications: 'NOTIFICATIONS-BACKEND-INTEGRATION-REQUEST',
  socialGraph: 'SOCIAL-GRAPH-BACKEND-INTEGRATION-REQUEST',
  messaging: 'MESSAGING-BACKEND-INTEGRATION-REQUEST',
} as const;
