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
import { StatsButton } from '@/components/ui/StatsButton';
import { TextField } from '@/components/ui/TextField';
import { signOut } from '@/features/auth/api';
import { updateProfile, switchActiveRole } from '@/features/profile/api';
import { editProfileSchema, type EditProfileFormValues } from '@/features/profile/schemas';
import { useRegion } from '@/hooks/useRegion';
import { formatMoney } from '@/lib/money';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, shadows, spacing, useTheme } from '@/theme';
import { t } from '@/lib/i18n';

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
  const region = useRegion();

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
        <Button label={t('Reintentar')} variant="outlined" onPress={reloadProfile} />
        <View style={styles.spacerLarge} />
        <Button label={t('Cerrar sesión')} variant="text" onPress={signOut} />
      </Screen>
    );
  }

  if (!profile || !session) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{t('Cargando perfil…')}</Text>
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
      setErrorMessage(t('No pudimos guardar los cambios. Intenta nuevamente.'));
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
      router.replace(role === 'owner' ? '/(owner)/parkings' : '/(client)');
    } catch {
      setErrorMessage(t('No pudimos cambiar de rol. Intenta nuevamente.'));
    } finally {
      setIsSwitchingRole(false);
    }
  };

  const isOwnerActive = profile.activeRole === 'owner';

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={t('Perfil')}
          action={
            <Pressable
              onPress={() =>
                router.push(isOwnerActive ? '/(owner)/profile/settings' : '/(client)/profile/settings')
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Ajustes')}
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
              accessibilityLabel={t('Editar perfil')}
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
                  label={t('Nombre')}
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
                  label={t('Apellido')}
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
                  label={t('Teléfono')}
                  keyboardType="phone-pad"
                  value={field.value}
                  onChangeText={field.onChange}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />

            <Button label={t('Guardar')} onPress={handleSubmit(onSubmit)} loading={isSubmitting} disabled={isSubmitting} />
            <View style={styles.spacer} />
            <LinkText label={t('Cancelar')} onPress={() => setIsEditing(false)} />
          </>
        ) : (
          <>
            <InfoField label={t('Nombre completo')} value={`${profile.firstName} ${profile.lastName}`} />
            <InfoField label={t('Correo electrónico')} value={session.user.email ?? '—'} />
            <InfoField label={t('Teléfono')} value={profile.phone || t('No registrado')} />

            {/* El saldo y la recarga son del conductor. En modo propietario el saldo y el retiro
                viven en su dashboard, que se abre desde acá. Vehículos, centro de ayuda y cierre
                de sesión están en Ajustes (la tuerca). */}
            {isOwnerActive ? (
              <View style={styles.dashboardButton}>
                <StatsButton label={t('Mis estadísticas')} onPress={() => router.push('/(owner)/dashboard')} />
              </View>
            ) : (
              <>
                <Text style={[typography.titleLarge, styles.balanceHeading, { color: colors.onSurface }]}>{t('Saldo:')}</Text>

                <View style={[styles.balanceCard, shadows.card, { backgroundColor: colors.surface }]}>
                  <Text style={[typography.displayLarge, { color: colors.accent }]}>
                    {walletBalance !== null ? formatMoney(walletBalance) : '—'}
                  </Text>
                </View>

                {/* La recarga (montos, topes y cómo funciona) tiene su propia pantalla. Es con
                    Mercado Pago, que en la demo de Estados Unidos no está. */}
                {region.mercadoPagoEnabled ? (
                  <View style={styles.topUpButton}>
                    <Button
                      label={t('Recargar saldo')}
                      icon="add-circle-outline"
                      onPress={() => router.push('/(client)/profile/topup')}
                    />
                  </View>
                ) : (
                  <View style={styles.topUpButton} />
                )}
              </>
            )}

            <View style={styles.roleBlock}>
              <View style={styles.roleLabels}>
                <Text
                  style={[
                    typography.titleMedium,
                    { color: isOwnerActive ? colors.onSurfaceVariant : colors.onSurface },
                  ]}
                >
                  {t('CONDUCTOR')}
                </Text>
                <Text
                  style={[
                    typography.titleMedium,
                    { color: isOwnerActive ? colors.onSurface : colors.onSurfaceVariant },
                  ]}
                >
                  {t('PROPIETARIO')}
                </Text>
              </View>

              <Switch
                value={isOwnerActive}
                onValueChange={handleRoleToggle}
                disabled={isSwitchingRole}
                accessibilityLabel={t('Cambiar entre modo conductor y modo propietario')}
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
  topUpButton: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  dashboardButton: {
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
