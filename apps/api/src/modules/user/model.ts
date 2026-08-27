export type UserStatus = 'active' | 'disabled';
export type User = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};
