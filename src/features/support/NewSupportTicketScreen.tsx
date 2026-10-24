import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { createTicket, getSupportErrorMessage, listTicketTargets } from '@/features/support/api';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORIES_BY_ROLE,
  type ReporterRole,
  type TicketCategory,
  type TicketTargetOption,
} from '@/features/support/types';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

const LIST_HREF = {
  client: '/(client)/profile/support',
  owner: '/(owner)/profile/support',
} as const;

const NO_TARGETS: TicketTargetOption[] = [];

/** Cuántas reservas o cocheras se ven de entrada; el resto está detrás de "Ver más". */
const VISIBLE_TARGETS = 5;

/** Opción "no es sobre una reserva/cochera en particular": el ticket queda sin vínculo (0076). */
const GENERAL_KEY = 'general';

export function NewSupportTicketScreen({ role }: { role: ReporterRole }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const categories = TICKET_CATEGORIES_BY_ROLE[role];
  const [category, setCategory] = useState<TicketCategory>(categories[0]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [showAllTargets, setShowAllTargets] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    data: targets = NO_TARGETS,
    isPending: isLoadingTargets,
    error: targetsError,
  } = useQuery({
    queryKey: queryKeys.tickets.targets(profile?.id ?? '', role),
    queryFn: () => listTicketTargets(role, profile?.id as string),
    enabled: Boolean(profile),
  });
  const visibleError = errorMessage ?? (targetsError ? getSupportErrorMessage(targetsError) : null);

  const target = useMemo(() => targets.find((t) => t.key === targetKey) ?? null, [targets, targetKey]);
  // Las opciones llegan de la más reciente a la más vieja: de entrada se ven las últimas 5.
  const visibleTargets = showAllTargets ? targets : targets.slice(0, VISIBLE_TARGETS);
  const hiddenTargetsCount = targets.length - VISIBLE_TARGETS;
  const isGeneral = targetKey === GENERAL_KEY;
  // Hay que elegir algo: una reserva/cochera concreta o "Consulta general".
  const canSubmit = subject.trim().length > 0 && body.trim().length >= 10 && (isGeneral || target !== null);

  const handleSubmit = async () => {
    if (!profile || !canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const ticket = await createTicket({
        reporterId: profile.id,
        reporterRole: role,
        subject,
        category,
        body,
        relatedBookingId: target?.bookingId ?? null,
        relatedParkingLotId: target?.parkingLotId ?? null,
      });
      router.replace({
        pathname: role === 'client' ? '/(client)/profile/support/[id]' : '/(owner)/profile/support/[id]',
        params: { id: ticket.id },
      });
    } catch (error) {
      setErrorMessage(getSupportErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Nueva consulta" backHref={LIST_HREF[role]} />

        {visibleError ? <Banner message={visibleError} /> : null}

        <Text style={[typography.label, styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
          CATEGORÍA
        </Text>
        <View style={styles.chips}>
          <ChipSelect
            options={categories.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))}
            value={category}
            onChange={setCategory}
          />
        </View>

        <Text style={[typography.label, styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
          {role === 'owner' ? '¿SOBRE QUÉ COCHERA?' : '¿SOBRE QUÉ RESERVA?'}
        </Text>
        <View style={styles.targetList}>
          {/* Para reportes que no son de una reserva o publicación en particular. */}
          <Pressable
            onPress={() => setTargetKey(GENERAL_KEY)}
            accessibilityRole="button"
            style={[
              styles.targetRow,
              {
                borderColor: isGeneral ? colors.primary : colors.outline,
                backgroundColor: isGeneral ? colors.primaryContainer : colors.surface,
              },
            ]}
          >
            <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>Consulta general</Text>
            <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
              {role === 'owner'
                ? 'No es sobre una cochera en particular'
                : 'No es sobre una reserva en particular'}
            </Text>
          </Pressable>

          {isLoadingTargets ? (
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
          ) : (
            <>
              {visibleTargets.map((t) => {
                const selected = t.key === targetKey;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTargetKey(t.key)}
                    style={[
                      styles.targetRow,
                      {
                        borderColor: selected ? colors.primary : colors.outline,
                        backgroundColor: selected ? colors.primaryContainer : colors.surface,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyMedium, { color: colors.onSurface }]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      {t.sublabel ? (
                        <Text
                          style={[typography.label, { color: colors.onSurfaceVariant }]}
                          numberOfLines={1}
                        >
                          {t.sublabel}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {hiddenTargetsCount > 0 ? (
                <LinkText
                  label={showAllTargets ? 'Ver menos' : `Ver más (${hiddenTargetsCount})`}
                  onPress={() => setShowAllTargets((current) => !current)}
                />
              ) : null}
            </>
          )}
        </View>

        <TextField
          label="Asunto"
          placeholder="Resumí el problema en una línea"
          value={subject}
          onChangeText={setSubject}
          maxLength={140}
        />

        <TextField
          label="Contanos qué pasó"
          placeholder="Describí el problema con el mayor detalle posible (mínimo 10 caracteres)."
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={5}
          style={styles.bodyInput}
          maxLength={4000}
        />

        <Button
          label="Enviar consulta"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  chips: {
    marginBottom: spacing.lg,
  },
  targetList: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  targetRow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bodyInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
