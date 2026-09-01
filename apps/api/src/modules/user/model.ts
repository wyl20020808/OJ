export type UserStatus = 'active' | 'disabled' | 'deactivated';
export type User = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};
