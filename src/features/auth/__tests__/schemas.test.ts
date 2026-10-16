import { newPasswordSchema, recoveryCodeSchema, registerSchema } from '../schemas';

const validRegistration = {
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@ejemplo.com',
  password: 'claveNueva1',
  confirmPassword: 'claveNueva1',
};

describe('registerSchema', () => {
  it('acepta un registro completo', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it('rechaza el registro si las contraseñas no coinciden', () => {
    expect(registerSchema.safeParse({ ...validRegistration, confirmPassword: 'otraClave1' }).success).toBe(false);
  });

  it.each([
    ['menos de 8 caracteres', 'Abc1234'],
    ['sin mayúscula', 'clavenueva1'],
    ['sin minúscula', 'CLAVENUEVA1'],
    ['sin número', 'claveNueva'],
  ])('rechaza una contraseña %s', (_label, password) => {
    const result = registerSchema.safeParse({ ...validRegistration, password, confirmPassword: password });
    expect(result.success).toBe(false);
  });
});

describe('recoveryCodeSchema', () => {
  it('acepta un código numérico de 6 dígitos', () => {
    expect(recoveryCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('ignora espacios alrededor del código pegado desde el mail', () => {
    const result = recoveryCodeSchema.safeParse({ code: ' 123456 ' });
    expect(result.success && result.data.code).toBe('123456');
  });

  it('rechaza códigos con letras o demasiado cortos', () => {
    expect(recoveryCodeSchema.safeParse({ code: '12a456' }).success).toBe(false);
    expect(recoveryCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
  });
});

describe('newPasswordSchema', () => {
  it('acepta dos contraseñas iguales de 8 o más caracteres', () => {
    expect(newPasswordSchema.safeParse({ password: 'claveNueva1', confirmPassword: 'claveNueva1' }).success).toBe(true);
  });

  it('rechaza contraseñas que no coinciden o de menos de 8 caracteres', () => {
    expect(newPasswordSchema.safeParse({ password: 'claveNueva1', confirmPassword: 'otraClave1' }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: 'corta', confirmPassword: 'corta' }).success).toBe(false);
  });
});
