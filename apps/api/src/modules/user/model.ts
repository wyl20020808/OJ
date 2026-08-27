export type UserStatus = 'active' | 'disabled' | 'deactivated';
export type User = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};
