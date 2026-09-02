import { Image } from 'react-native';

// Logo oficial de la app (assets/logo.png: 350×120, PNG con fondo transparente).
// Antes esto era una aproximación en texto ("Garage" + un badge "Go"); ahora usa la imagen
// real, que incluye el ícono del garaje con el auto dentro de la "a".
const LOGO_SOURCE = require('../../../assets/logo.png');
const ASPECT_RATIO = 350 / 120;

type LogoProps = {
  size?: 'large' | 'medium';
};

export function Logo({ size = 'large' }: LogoProps) {
  const width = size === 'large' ? 190 : 140;

  // Sin `alignSelf`: la alineación la decide quien lo usa (AuthHeading lo centra con su
  // wrapper; en la pantalla de inicio queda a la izquierda).
  return (
    <Image
      source={LOGO_SOURCE}
      style={{ width, height: width / ASPECT_RATIO }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="GarageGo"
    />
  );
}
