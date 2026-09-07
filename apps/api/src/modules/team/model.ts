export type TeamVisibility = 'PUBLIC' | 'PRIVATE';
export type TeamJoinPolicy = 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
export type TeamRole = 'OWNER' | 'MANAGER' | 'MEMBER';
export type InvitationStatus =
  'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
export type JoinRequestStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type Team = {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  visibility: TeamVisibility;
  joinPolicy: TeamJoinPolicy;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};
export type TeamMember = {
  teamId: string;
  userId: string;
  username: string;
  displayName: string;
  role: TeamRole;
  joinedAt: string;
};
export type TeamInvitation = {
  id: string;
  teamId: string;
  invitedUserId: string;
  invitedBy: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
};
export type TeamJoinRequest = {
  id: string;
  teamId: string;
  userId: string;
  status: JoinRequestStatus;
  message: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};
export type TeamInviteCode = {
  id: string;
  teamId: string;
  createdBy: string;
  codeHash: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
};

export const roleRank = (role: TeamRole) =>
  role === 'OWNER' ? 3 : role === 'MANAGER' ? 2 : 1;
