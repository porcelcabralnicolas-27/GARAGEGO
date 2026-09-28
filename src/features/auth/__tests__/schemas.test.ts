import { recoveryCodeSchema } from '../schemas';

const valid = { code: '123456', password: 'claveNueva1', confirmPassword: 'claveNueva1' };

describe('recoveryCodeSchema', () => {
  it('acepta un código numérico de 6 dígitos con contraseñas iguales', () => {
    expect(recoveryCodeSchema.safeParse(valid).success).toBe(true);
  });

  it('ignora espacios alrededor del código pegado desde el mail', () => {
    const result = recoveryCodeSchema.safeParse({ ...valid, code: ' 123456 ' });
    expect(result.success && result.data.code).toBe('123456');
  });

  it('rechaza códigos con letras o demasiado cortos', () => {
    expect(recoveryCodeSchema.safeParse({ ...valid, code: '12a456' }).success).toBe(false);
    expect(recoveryCodeSchema.safeParse({ ...valid, code: '12345' }).success).toBe(false);
  });

  it('rechaza contraseñas que no coinciden o de menos de 8 caracteres', () => {
    expect(recoveryCodeSchema.safeParse({ ...valid, confirmPassword: 'otraClave1' }).success).toBe(false);
    expect(recoveryCodeSchema.safeParse({ ...valid, password: 'corta', confirmPassword: 'corta' }).success).toBe(false);
  });
});
