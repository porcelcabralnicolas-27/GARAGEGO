import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Profile } from '@/features/profile/types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  walletBalance: number | null;
  isInitializing: boolean;
  profileRefreshKey: number;
  /** Mientras es true, la sesión es solo la de recuperación de contraseña: el guard de
   *  navegación no debe sacar al usuario de la pantalla antes de que guarde la clave nueva. */
  passwordRecoveryInProgress: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setProfileError: (error: string | null) => void;
  setWalletBalance: (balance: number | null) => void;
  setInitializing: (value: boolean) => void;
  reloadProfile: () => void;
  setPasswordRecoveryInProgress: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  profileError: null,
  walletBalance: null,
  isInitializing: true,
  profileRefreshKey: 0,
  passwordRecoveryInProgress: false,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setProfileError: (error) => set({ profileError: error }),
  setWalletBalance: (balance) => set({ walletBalance: balance }),
  setInitializing: (value) => set({ isInitializing: value }),
  reloadProfile: () => set((state) => ({ profileRefreshKey: state.profileRefreshKey + 1 })),
  setPasswordRecoveryInProgress: (value) => set({ passwordRecoveryInProgress: value }),
}));
