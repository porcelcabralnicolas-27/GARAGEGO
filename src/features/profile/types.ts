// UserRole vive en shared/domain.ts (lo comparte con admin-panel/src/domain.ts): ver ese
// archivo para el porqué.
export type { UserRole } from '../../../shared/domain';

import type { UserRole } from '../../../shared/domain';

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
