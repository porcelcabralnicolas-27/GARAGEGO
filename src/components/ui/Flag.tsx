import Svg, { Circle, Rect } from 'react-native-svg';

import type { RegionCode } from '@/lib/region';

// Banderas dibujadas con SVG y no con emoji: Windows no tiene emojis de banderas (en la web se
// verían las letras "AR" / "US"). Simplificadas para el tamaño de un ícono.

const WIDTH = 30;
const HEIGHT = 20;

function Argentina() {
  return (
    <>
      <Rect width={WIDTH} height={HEIGHT} fill="#74ACDF" />
      <Rect y={HEIGHT / 3} width={WIDTH} height={HEIGHT / 3} fill="#FFFFFF" />
      <Circle cx={WIDTH / 2} cy={HEIGHT / 2} r={2.2} fill="#F6B40E" />
    </>
  );
}

function UnitedStates() {
  const stripe = HEIGHT / 13;
  const cantonWidth = WIDTH * 0.42;
  const cantonHeight = stripe * 7;
  const stars: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      stars.push({ x: ((col + 0.5) * cantonWidth) / 5, y: ((row + 0.5) * cantonHeight) / 4 });
    }
  }
  return (
    <>
      <Rect width={WIDTH} height={HEIGHT} fill="#FFFFFF" />
      {Array.from({ length: 7 }, (_, i) => (
        <Rect key={i} y={i * 2 * stripe} width={WIDTH} height={stripe} fill="#B22234" />
      ))}
      <Rect width={cantonWidth} height={cantonHeight} fill="#3C3B6E" />
      {stars.map((star, i) => (
        <Circle key={i} cx={star.x} cy={star.y} r={0.55} fill="#FFFFFF" />
      ))}
    </>
  );
}

export function Flag({ region, size = 28 }: { region: RegionCode; size?: number }) {
  return (
    <Svg width={size} height={(size * HEIGHT) / WIDTH} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ borderRadius: 3 }}>
      {region === 'US' ? <UnitedStates /> : <Argentina />}
    </Svg>
  );
}
