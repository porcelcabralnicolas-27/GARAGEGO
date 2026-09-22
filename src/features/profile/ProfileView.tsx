import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { signOut } from '@/features/auth/api';
import { getTopupErrorMessage, topupWallet, updateProfile, switchActiveRole } from '@/features/profile/api';
import { editProfileSchema, type EditProfileFormValues } from '@/features/profile/schemas';
import { formatMoney } from '@/lib/money';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, shadows, spacing, useTheme } from '@/theme';

function getInitials(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}

/** Dato de solo lectura: etiqueta en mayúsculas, valor debajo y una línea fina, como el Figma. */
function InfoField({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.infoField}>
      <Text style={[typography.label, styles.infoLabel, { color: colors.onSurfaceVariant }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[typography.bodyLarge, { color: colors.onSurface }]}>{value}</Text>
      <View style={[styles.underline, { backgroundColor: colors.outline }]} />
    </View>
  );
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

  // El switch es binario, así que el destino se deduce del valor: encendido = propietario.
  // Queda controlado por `profile.activeRole`, de modo que si la llamada falla vuelve solo
  // a su posición anterior en vez de quedar mostrando un rol que no se aplicó.
  const handleRoleToggle = async (isOwner: boolean) => {
    const role = isOwner ? 'owner' : 'client';
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
    } catch (error) {
      setErrorMessage(getTopupErrorMessage(error));
    } finally {
      setToppingUpAmount(null);
    }
  };

  const isOwnerActive = profile.activeRole === 'owner';

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Perfil"
          action={
            <Pressable
              onPress={() =>
                router.push(isOwnerActive ? '/(owner)/profile/settings' : '/(client)/profile/settings')
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Ajustes"
            >
              <Ionicons name="settings-outline" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
          }
        />

        <View style={styles.avatarBlock}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[typography.titleLarge, { color: colors.onPrimaryContainer }]}>
                {getInitials(profile.firstName, profile.lastName)}
              </Text>
            </View>
          )}

          {!isEditing ? (
            <Pressable
              onPress={startEditing}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Editar perfil"
              style={styles.avatarEdit}
            >
              <Ionicons name="create-outline" size={26} color={colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>

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

            <Button label="Guardar" onPress={handleSubmit(onSubmit)} loading={isSubmitting} disabled={isSubmitting} />
            <View style={styles.spacer} />
            <LinkText label="Cancelar" onPress={() => setIsEditing(false)} />
          </>
        ) : (
          <>
            <InfoField label="Nombre completo" value={`${profile.firstName} ${profile.lastName}`} />
            <InfoField label="Correo electrónico" value={session.user.email ?? '—'} />
            <InfoField label="Teléfono" value={profile.phone || 'No registrado'} />

            {/* El saldo y la recarga son del conductor. En modo propietario el perfil es solo
                identidad + cambio de rol; el saldo y el retiro viven en su panel. Vehículos,
                centro de ayuda y cierre de sesión están en Ajustes (la tuerca). */}
            {!isOwnerActive ? (
              <>
                <Text style={[typography.titleLarge, styles.balanceHeading, { color: colors.onSurface }]}>Saldo:</Text>

                <View style={[styles.balanceCard, shadows.card, { backgroundColor: colors.surface }]}>
                  <Text style={[typography.displayLarge, { color: colors.accent }]}>
                    {walletBalance !== null ? formatMoney(walletBalance) : '—'}
                  </Text>
                </View>

                <Text style={[typography.label, styles.topUpNote, { color: colors.onSurfaceVariant }]}>
                  Recarga de prueba (todavía no hay pasarela de pago real)
                </Text>

                <View style={styles.topUpRow}>
                  {[1000, 3000, 5000].map((amount) => (
                    <Button
                      key={amount}
                      label={`+ ${formatMoney(amount)}`}
                      size="compact"
                      variant="outlined"
                      onPress={() => handleTopUp(amount)}
                      loading={toppingUpAmount === amount}
                      disabled={toppingUpAmount !== null}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.roleBlock}>
              <View style={styles.roleLabels}>
                <Text
                  style={[
                    typography.titleMedium,
                    { color: isOwnerActive ? colors.onSurfaceVariant : colors.onSurface },
                  ]}
                >
                  CONDUCTOR
                </Text>
                <Text
                  style={[
                    typography.titleMedium,
                    { color: isOwnerActive ? colors.onSurface : colors.onSurfaceVariant },
                  ]}
                >
                  PROPIETARIO
                </Text>
              </View>

              <Switch
                value={isOwnerActive}
                onValueChange={handleRoleToggle}
                disabled={isSwitchingRole}
                accessibilityLabel="Cambiar entre modo conductor y modo propietario"
                trackColor={{ false: colors.track, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    marginLeft: spacing.lg,
  },
  infoField: {
    marginBottom: spacing.xl,
  },
  infoLabel: {
    marginBottom: spacing.xs,
    letterSpacing: 1,
  },
  underline: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
  },
  balanceHeading: {
    marginBottom: spacing.md,
  },
  balanceCard: {
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  topUpNote: {
    marginTop: spacing.md,
  },
  topUpRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  roleBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  roleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  spacer: {
    height: spacing.md,
  },
  spacerLarge: {
    height: spacing.xl,
  },
});
