import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

export type UserRole = 'client' | 'owner';

export type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  currentRole: UserRole;
  isOwnerEnabled: boolean;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  isInitializing: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setInitializing: (value: boolean) => void;
  switchRole: (role: UserRole) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  isInitializing: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setInitializing: (value) => set({ isInitializing: value }),
  switchRole: (role) =>
    set((state) => (state.profile ? { profile: { ...state.profile, currentRole: role } } : state)),
}));
