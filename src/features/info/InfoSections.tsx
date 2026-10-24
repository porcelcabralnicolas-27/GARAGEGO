import { StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import type { InfoSection } from './content';

// Lista de secciones de texto (título + párrafos + viñetas) de las pantallas Legal, Información
// y Seguridad.
export function InfoSections({ sections }: { sections: InfoSection[] }) {
  const { colors, typography } = useTheme();

  return (
    <>
      {sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]} accessibilityRole="header">
            {section.heading}
          </Text>

          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={[typography.bodyMedium, styles.paragraph, { color: colors.onSurfaceVariant }]}>
              {paragraph}
            </Text>
          ))}

          {section.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={[typography.bodyMedium, { color: colors.accent }]}>•</Text>
              <Text style={[typography.bodyMedium, styles.bulletText, { color: colors.onSurfaceVariant }]}>
                {bullet}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  paragraph: {
    marginTop: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bulletText: {
    flex: 1,
  },
});
