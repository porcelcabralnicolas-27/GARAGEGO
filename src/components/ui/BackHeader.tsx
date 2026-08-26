import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

export function BackHeader({ href }: { href: Href }) {
  const router = useRouter();
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.replace(href)} hitSlop={8} style={styles.button}>
        <Ionicons name="arrow-back" size={20} color={colors.onBackground} />
        <Text style={[typography.bodyLarge, { color: colors.onBackground, marginLeft: 6 }]}>Volver</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});
