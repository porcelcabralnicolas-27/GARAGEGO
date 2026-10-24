import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { sanitizeErrorMessage } from '@/lib/errorMessages';
import { supabase } from '@/lib/supabase/client';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  const { error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: { first_name: params.firstName, last_name: params.lastName },
      emailRedirectTo: Linking.createURL('/'),
    },
  });
  if (error) throw error;
}

export async function resendSignUpConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: Linking.createURL('/') },
  });
  if (error) throw error;
}

/**
 * Manda el mail de recuperación. La plantilla "Reset Password" de Supabase tiene que mostrar el
 * código ({{ .Token }}): se recupera con código y no con link porque el link solo funcionaba en
 * el mismo dispositivo donde se pidió (PKCE) y dependía de que el mail abriera la app.
 * Sirve también para cuentas creadas con Google: les crea una contraseña.
 */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

/** Valida el código del mail. Si es correcto, deja abierta una sesión para cambiar la clave. */
export async function verifyRecoveryCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('/');

  if (Platform.OS === 'web') {
    // En web, Supabase navega el propio browser al proveedor y de vuelta;
    // detectSessionInUrl (activado solo en web, ver client.ts) completa la sesión al volver.
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
    return;
  }

  // En nativo, redirectTo usa el scheme propio de la app (garagego://). Ojo: en Expo Go sería
  // exp://<IP-local>:8081, y Supabase rechaza cualquier redirect cuyo host sea una IP numérica,
  // así que el login con Google solo funciona desde un development build, no desde Expo Go.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No se pudo iniciar el flujo de Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    if (result.type === 'cancel' || result.type === 'dismiss') return;
    throw new Error('No se pudo completar el inicio de sesión con Google.');
  }

  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('El proveedor no devolvió un código válido.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (message.includes('Email not confirmed')) return 'Debes confirmar tu correo antes de iniciar sesión.';
    if (message.includes('User already registered')) return 'Ya existe una cuenta con ese correo.';
    if (message.includes('Token has expired or is invalid')) {
      return 'El código no es válido o ya venció. Revisalo o pedí uno nuevo.';
    }
    if (message.includes('only request this after') || message.toLowerCase().includes('rate limit')) {
      return 'Pediste varios correos seguidos. Esperá un minuto y volvé a intentar.';
    }
    if (message.includes('New password should be different')) {
      return 'La nueva contraseña tiene que ser distinta de la anterior.';
    }
    return sanitizeErrorMessage(message, 'Ocurrió un error inesperado. Intenta nuevamente.');
  }
  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
