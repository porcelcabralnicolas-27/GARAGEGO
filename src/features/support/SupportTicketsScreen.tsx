import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getSupportErrorMessage, listMyTickets } from '@/features/support/api';
import { TICKET_CATEGORY_LABELS, type ReporterRole } from '@/features/support/types';
import { queryKeys } from '@/lib/queryKeys';
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
  const userId = profile?.id;

  const {
    data: tickets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tickets.list(userId ?? ''),
    queryFn: () => listMyTickets(userId as string),
    enabled: Boolean(userId),
  });

  // Un ticket nuevo se crea en otra pantalla, y "Nueva consulta" no vuelve acá (va directo al
  // hilo). Este refetch al enfocar es lo que trae ese ticket a la lista cuando el usuario
  // vuelve, sin depender de que la pantalla de creación sepa invalidar esta query.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  const errorMessage = isError ? getSupportErrorMessage(error) : null;

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
        onRefresh={refetch}
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
