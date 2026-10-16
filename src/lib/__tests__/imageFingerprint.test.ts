import { hashBytes } from '../imageFingerprint';

describe('hashBytes', () => {
  it('da la misma huella para el mismo contenido', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3, 4]))).toBe(hashBytes(new Uint8Array([1, 2, 3, 4])));
  });

  it('da huellas distintas si cambia un solo byte', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3, 4]))).not.toBe(hashBytes(new Uint8Array([1, 2, 3, 5])));
  });

  it('distingue el orden de los bytes', () => {
    expect(hashBytes(new Uint8Array([1, 2]))).not.toBe(hashBytes(new Uint8Array([2, 1])));
  });

  it('distingue contenidos de distinto largo aunque uno sea prefijo del otro', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 3, 0])));
  });

  it('acepta una imagen vacía', () => {
    expect(typeof hashBytes(new Uint8Array([]))).toBe('string');
  });
});
