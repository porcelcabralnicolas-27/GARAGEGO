import type { Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChipSelect } from '@/components/ui/ChipSelect';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { spacing, useTheme } from '@/theme';

import { CONTENT_UPDATED_AT, LEGAL_CONTENT, LEGAL_TABS, type LegalTab } from './content';
import { InfoSections } from './InfoSections';

// Legal: términos y condiciones, política de privacidad y política de cancelaciones, en tres
// pestañas para no tener una sola pantalla interminable.
export function LegalScreen({ backHref }: { backHref: Href }) {
  const { colors, typography } = useTheme();
  const [tab, setTab] = useState<LegalTab>('terms');
  const content = LEGAL_CONTENT[tab];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Legal" backHref={backHref} />

        <View style={styles.tabs}>
          <ChipSelect options={LEGAL_TABS} value={tab} onChange={setTab} />
        </View>

        <Text style={[typography.titleLarge, { color: colors.onSurface }]}>{content.title}</Text>
        <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>{content.intro}</Text>

        <InfoSections sections={content.sections} />

        <Text style={[typography.label, styles.updated, { color: colors.onSurfaceVariant }]}>
          Última revisión: {CONTENT_UPDATED_AT}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    marginBottom: spacing.lg,
  },
  intro: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  updated: {
    marginBottom: spacing.xl,
  },
});
