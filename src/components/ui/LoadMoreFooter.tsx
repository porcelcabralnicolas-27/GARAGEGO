import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme';

/** Pie de las listas con scroll infinito: un spinner mientras llega la página siguiente. */
export function LoadMoreFooter({ isFetching }: { isFetching: boolean }) {
  const { colors } = useTheme();
  if (!isFetching) return null;
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.lg,
  },
});
