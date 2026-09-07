import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';

type ProgressRingProps = {
  /** Avance de 0 a 1. Los valores fuera de rango se recortan. */
  progress: number;
  /** Diámetro exterior en puntos. */
  size?: number;
  strokeWidth?: number;
  /** Contenido centrado dentro del anillo: el tiempo restante, un ícono, etc. */
  children?: ReactNode;
};

// Anillo de progreso de la sesión activa (pantalla 5 del Figma: el aro verde alrededor del auto).
//
// Se dibuja con react-native-svg, que ya es dependencia del proyecto, en vez de sumar una
// librería de gráficos: es un solo círculo con `strokeDasharray`, no justifica el peso.
//
// El arco arranca arriba (-90°) porque por defecto SVG empieza a las 3 en punto, que se lee
// como un reloj torcido.
export function ProgressRing({ progress, size = 220, strokeWidth = 14, children }: ProgressRingProps) {
  const { colors } = useTheme();

  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Pista de fondo */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Arco de avance */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
