import Constants from 'expo-constants';
import type { Href } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { spacing, useTheme } from '@/theme';

import { CONTENT_UPDATED_AT, INFO_CONTENT, SECURITY_CONTENT } from './content';
import { InfoSections } from './InfoSections';

type InfoKind = 'info' | 'security';

const SCREENS = {
  info: { title: 'Información', content: INFO_CONTENT },
  security: { title: 'Seguridad', content: SECURITY_CONTENT },
} as const;

// Pantallas de texto "Información" y "Seguridad" de Ajustes.
export function InfoScreen({ kind, backHref }: { kind: InfoKind; backHref: Href }) {
  const { colors, typography } = useTheme();
  const { title, content } = SCREENS[kind];
  const version = Constants.expoConfig?.version;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title={title} backHref={backHref} />

        <Text style={[typography.bodyLarge, styles.intro, { color: colors.onSurface }]}>{content.intro}</Text>

        <InfoSections sections={content.sections} />

        <Text style={[typography.label, styles.footer, { color: colors.onSurfaceVariant }]}>
          {kind === 'info' && version ? `GarageGo versión ${version} · ` : ''}Última revisión: {CONTENT_UPDATED_AT}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.xl,
  },
  footer: {
    marginBottom: spacing.xl,
  },
});
