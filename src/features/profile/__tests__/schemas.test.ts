import { editProfileSchema } from '../schemas';

function parsePhone(phone: string) {
  return editProfileSchema.safeParse({ firstName: 'Ana', lastName: 'Pérez', phone });
}

describe('editProfileSchema', () => {
  it('exige nombre y apellido', () => {
    expect(editProfileSchema.safeParse({ firstName: '', lastName: 'Pérez' }).success).toBe(false);
    expect(editProfileSchema.safeParse({ firstName: 'Ana', lastName: '' }).success).toBe(false);
  });

  it('acepta el perfil sin teléfono (es opcional)', () => {
    expect(editProfileSchema.safeParse({ firstName: 'Ana', lastName: 'Pérez' }).success).toBe(true);
    expect(parsePhone('').success).toBe(true);
  });

  describe('teléfono argentino', () => {
    it.each([
      ['11 1234-5678', 'celular escrito como lo escribe la gente'],
      ['1112345678', 'solo dígitos'],
      ['+54 9 11 1234-5678', 'con prefijo internacional de celular'],
      ['011 15 1234-5678', 'con 0 de larga distancia y 15 de celular'],
      ['(011) 1234-5678', 'con paréntesis'],
      ['0351 155-123456', 'código de área de 4 dígitos con 15'],
    ])('acepta %s (%s)', (phone) => {
      expect(parsePhone(phone).success).toBe(true);
    });

    it.each([
      ['123', 'muy corto'],
      ['11 1234-567', 'un dígito de menos'],
      ['11 1234-56789', 'un dígito de más'],
      ['no es un teléfono', 'texto'],
    ])('rechaza %s (%s)', (phone) => {
      expect(parsePhone(phone).success).toBe(false);
    });
  });
});
