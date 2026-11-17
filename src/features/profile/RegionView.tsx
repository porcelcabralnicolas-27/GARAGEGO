import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Flag } from '@/components/ui/Flag';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { updateRegion } from '@/features/profile/api';
import { t } from '@/lib/i18n';
import { REGIONS, type RegionCode } from '@/lib/region';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

/** Idioma y moneda de cada región, para el subtítulo de la opción. */
const REGION_DETAILS: Record<RegionCode, string> = {
  AR: 'Español · Pesos (ARS)',
  US: 'English · Dólares (USD)',
};

// País/región (demo de presentación regional, 0086-0087). Se elige el país y se confirma con
// "Listo": cambia idioma, moneda, hora y ubicación, y cada país ve solo sus reservas, mensajes y
// notificaciones. Después de cambiarla, la app vuelve al Inicio con todo armado de nuevo.
export function RegionView({ backHref, homeHref }: { backHref: Href; homeHref: Href }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const current = profile?.region ?? 'AR';

  const [selected, setSelected] = useState<RegionCode>(current);
  // Reservas activas o próximas en el país actual: siguen vigentes, pero dejan de verse al cambiar.
  const { data: activeBookings = 0 } = useQuery({
    queryKey: ['regionActiveBookings', profile?.id, current],
    enabled: Boolean(profile),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile!.id)
        .eq('region', current)
        .in('status', ['pending', 'confirmed']);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDone = async () => {
    if (!profile || selected === current) {
      router.replace(backHref);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await updateRegion(profile.id, selected);
      // La pestaña Perfil recuerda las pantallas abiertas (Perfil → Ajustes → País/región): se
      // cierran para que, al volver a Perfil, se vea el perfil y no esta pantalla.
      if (router.canDismiss()) router.dismissAll();
      // Primero al Inicio y después la región: al cambiar el perfil, las pestañas se arman de
      // nuevo (key del layout) y arrancan ya en el Inicio.
      router.replace(homeHref);
      // Los datos en cache son del país anterior (reservas, mensajes, notificaciones, saldo en
      // otra moneda): se descartan para que todo se vuelva a pedir con la región nueva.
      queryClient.clear();
      setProfile(updated);
    } catch {
      setErrorMessage(t('No pudimos cambiar la región. Intenta nuevamente.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title={t('País/región')} backHref={backHref} />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <Text style={[typography.titleMedium, styles.question, { color: colors.onSurface }]}>
          {t('¿En qué país querés usar GarageGo?')}
        </Text>
        <Text style={[typography.bodyMedium, styles.description, { color: colors.onSurfaceVariant }]}>
          {t('Cambia el idioma, la moneda, la hora y la ubicación. Las reservas, los mensajes y las notificaciones de cada país se ven por separado.')}
        </Text>

        {selected !== current && activeBookings > 0 ? (
          <Banner
            variant="info"
            message={t('Tenés {count} reservas activas o próximas en {country}. Siguen vigentes: las vas a ver al volver a ese país.', {
              count: activeBookings,
              country: t(REGIONS[current].label),
            })}
          />
        ) : null}

        {(Object.keys(REGIONS) as RegionCode[]).map((code) => {
          const isSelected = selected === code;
          return (
            <Pressable
              key={code}
              onPress={() => setSelected(code)}
              disabled={isSaving}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t(REGIONS[code].label)}
              style={[
                styles.option,
                { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.outline },
              ]}
            >
              <Flag region={code} size={34} />
              <View style={styles.optionBody}>
                <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{t(REGIONS[code].label)}</Text>
                <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
                  {t(REGION_DETAILS[code])}
                </Text>
              </View>
              <Ionicons
                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                size={24}
                color={isSelected ? colors.accent : colors.onSurfaceVariant}
              />
            </Pressable>
          );
        })}

        <View style={styles.spacer} />

        <Button label={t('Listo')} onPress={handleDone} loading={isSaving} disabled={isSaving} fullWidth />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: {
    marginBottom: spacing.sm,
  },
  description: {
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    marginBottom: spacing.md,
  },
  optionBody: {
    flex: 1,
  },
  spacer: {
    height: spacing.lg,
  },
});
