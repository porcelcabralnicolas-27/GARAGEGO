export type UserRole = 'client' | 'owner';

export type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  activeRole: UserRole;
  isOwnerEnabled: boolean;
  createdAt: string;
};
