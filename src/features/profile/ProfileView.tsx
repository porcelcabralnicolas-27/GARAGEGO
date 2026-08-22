import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { signOut } from '@/features/auth/api';
import { topupWallet, updateProfile, switchActiveRole } from '@/features/profile/api';
import { editProfileSchema, type EditProfileFormValues } from '@/features/profile/schemas';
import type { UserRole } from '@/features/profile/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(amount);
}

function getInitials(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}

export function ProfileView() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const profileError = useAuthStore((s) => s.profileError);
  const walletBalance = useAuthStore((s) => s.walletBalance);
  const setProfile = useAuthStore((s) => s.setProfile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [toppingUpAmount, setToppingUpAmount] = useState<number | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      phone: profile?.phone ?? '',
    },
  });

  if (profileError) {
    return (
      <Screen>
        <Banner message={profileError} />
        <Button label="Reintentar" variant="outlined" onPress={reloadProfile} />
        <View style={styles.spacerLarge} />
        <Button label="Cerrar sesión" variant="text" onPress={signOut} />
      </Screen>
    );
  }

  if (!profile || !session) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando perfil…</Text>
      </Screen>
    );
  }

  const startEditing = () => {
    reset({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone ?? '' });
    setErrorMessage(null);
    setIsEditing(true);
  };

  const onSubmit = async (values: EditProfileFormValues) => {
    setErrorMessage(null);
    try {
      const updated = await updateProfile(profile.id, {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone?.trim() ? values.phone.trim() : null,
      });
      setProfile(updated);
      setIsEditing(false);
    } catch {
      setErrorMessage('No pudimos guardar los cambios. Intenta nuevamente.');
    }
  };

  const handleRoleChange = async (role: UserRole) => {
    if (role === profile.activeRole || isSwitchingRole) return;
    setIsSwitchingRole(true);
    setErrorMessage(null);
    try {
      const updated = await switchActiveRole(profile.id, role);
      setProfile(updated);
      router.replace(role === 'owner' ? '/(owner)/dashboard' : '/(client)');
    } catch {
      setErrorMessage('No pudimos cambiar de rol. Intenta nuevamente.');
    } finally {
      setIsSwitchingRole(false);
    }
  };

  const handleTopUp = async (amount: number) => {
    setToppingUpAmount(amount);
    setErrorMessage(null);
    try {
      await topupWallet(amount);
      reloadProfile();
    } catch {
      setErrorMessage('No se pudo recargar el saldo.');
    } finally {
      setToppingUpAmount(null);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[typography.titleLarge, { color: colors.onPrimaryContainer }]}>
                {getInitials(profile.firstName, profile.lastName)}
              </Text>
            </View>
          )}
          <Text style={[typography.titleLarge, { color: colors.onBackground, marginTop: 12 }]}>
            {profile.firstName} {profile.lastName}
          </Text>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{session.user.email}</Text>
        </View>

        <View style={[styles.walletCard, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[typography.label, { color: colors.onPrimaryContainer }]}>Saldo disponible</Text>
          <Text style={[typography.displayLarge, { color: colors.onPrimaryContainer }]}>
            {walletBalance !== null ? formatCurrency(walletBalance) : '—'}
          </Text>
          <Text style={[typography.label, { color: colors.onPrimaryContainer, marginTop: 8, opacity: 0.8 }]}>
            Recarga de prueba (todavía no hay pasarela de pago real)
          </Text>
          <View style={styles.topUpRow}>
            {[20, 50, 100].map((amount) => (
              <Button
                key={amount}
                label={`+$${amount}`}
                size="compact"
                variant="outlined"
                onPress={() => handleTopUp(amount)}
                loading={toppingUpAmount === amount}
                disabled={toppingUpAmount !== null}
              />
            ))}
          </View>
        </View>

        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Modo activo</Text>
        <SegmentedControl<UserRole>
          value={profile.activeRole}
          disabled={isSwitchingRole}
          onChange={handleRoleChange}
          options={[
            { value: 'client', label: 'Cliente' },
            { value: 'owner', label: 'Propietario' },
          ]}
        />

        <View style={styles.spacerLarge} />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {isEditing ? (
          <>
            <Controller
              control={control}
              name="firstName"
              render={({ field, fieldState }) => (
                <TextField
                  label="Nombre"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="lastName"
              render={({ field, fieldState }) => (
                <TextField
                  label="Apellido"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field, fieldState }) => (
                <TextField
                  label="Teléfono"
                  keyboardType="phone-pad"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />

            <Button label="Guardar cambios" onPress={handleSubmit(onSubmit)} loading={isSubmitting} disabled={isSubmitting} />
            <View style={styles.spacer} />
            <LinkText label="Cancelar" onPress={() => setIsEditing(false)} />
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>Teléfono</Text>
              <Text style={[typography.bodyLarge, { color: colors.onSurface }]}>{profile.phone || 'No registrado'}</Text>
            </View>
            <Button label="Editar perfil" variant="outlined" onPress={startEditing} />
          </>
        )}

        <View style={styles.spacerLarge} />

        <Button label="Cerrar sesión" variant="text" onPress={handleSignOut} loading={isSigningOut} disabled={isSigningOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  topUpRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  infoRow: {
    marginBottom: 20,
  },
  spacer: {
    height: 12,
  },
  spacerLarge: {
    height: 24,
  },
});
