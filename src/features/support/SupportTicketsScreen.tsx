import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getSupportErrorMessage, listMyTickets } from '@/features/support/api';
import {
  TICKET_CATEGORY_LABELS,
  type ReporterRole,
  type SupportTicketListItem,
} from '@/features/support/types';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

// Se entra desde Ajustes, así que volver lleva ahí y no al perfil.
const SETTINGS_HREF = { client: '/(client)/profile/settings', owner: '/(owner)/profile/settings' } as const;
const NEW_HREF = { client: '/(client)/profile/support/new', owner: '/(owner)/profile/support/new' } as const;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function SupportTicketsScreen({ role }: { role: ReporterRole }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listMyTickets(profile.id)
      .then(setTickets)
      .catch((error) => setErrorMessage(getSupportErrorMessage(error)))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScreenHeader
        title="Centro de ayuda"
        backHref={SETTINGS_HREF[role]}
        action={
          tickets.length > 0 ? (
            <Button label="Nuevo" size="compact" onPress={() => router.push(NEW_HREF[role])} />
          ) : null
        }
      />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && tickets.length === 0 && !errorMessage ? (
        <EmptyState
          icon="help-buoy-outline"
          title="No tenés consultas abiertas"
          description={
            role === 'owner'
              ? 'Si tenés un problema con una de tus cocheras, escribinos.'
              : 'Si tuviste un problema con una reserva, escribinos.'
          }
          actionLabel="Abrir una consulta"
          onAction={() => router.push(NEW_HREF[role])}
        />
      ) : null}

      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname:
                  role === 'client'
                    ? '/(client)/profile/support/[id]'
                    : '/(owner)/profile/support/[id]',
                params: { id: item.id },
              })
            }
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outline }]}
          >
            <View style={styles.cardHeader}>
              <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{item.code}</Text>
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: item.status === 'open' ? colors.primaryContainer : colors.surfaceVariant,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.label,
                    { color: item.status === 'open' ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                  ]}
                >
                  {item.status === 'open' ? 'Abierto' : 'Resuelto'}
                </Text>
              </View>
            </View>

            <Text style={[typography.titleMedium, { color: colors.onSurface, marginTop: 2 }]} numberOfLines={1}>
              {item.subject}
            </Text>

            <Text
              style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginTop: 2 }]}
              numberOfLines={1}
            >
              {TICKET_CATEGORY_LABELS[item.category]}
              {item.contextLabel ? ` · ${item.contextLabel}` : ''}
            </Text>

            {item.lastMessagePreview ? (
              <Text style={[typography.label, { color: colors.onSurfaceVariant, marginTop: 6 }]} numberOfLines={1}>
                {item.lastMessagePreview}
              </Text>
            ) : null}

            <Text style={[typography.label, { color: colors.onSurfaceVariant, marginTop: 6 }]}>
              {formatWhen(item.lastMessageAt)}
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
});
