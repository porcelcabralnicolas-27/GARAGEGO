import { documentRequirements, missingDocumentRequirements } from '../domain';

// Estas reglas se repiten en SQL (`lot_missing_documents`, migración 0078): si se cambia una, hay
// que cambiar la otra. supabase/tests/ownership_checks.sql prueba la del servidor.

const ids = (role: Parameters<typeof missingDocumentRequirements>[0], have: Parameters<typeof missingDocumentRequirements>[1]) =>
  missingDocumentRequirements(role, have).map((requirement) => requirement.id);

describe('documentRequirements', () => {
  it('el titular necesita DNI y un comprobante de propiedad', () => {
    expect(documentRequirements('owner').map((r) => r.id)).toEqual(['dni', 'property_proof']);
  });

  it('el inquilino necesita DNI, contrato y autorización del dueño', () => {
    expect(documentRequirements('tenant').map((r) => r.id)).toEqual(['dni', 'rental_contract', 'owner_authorization']);
  });

  it('el administrador necesita DNI y autorización del dueño', () => {
    expect(documentRequirements('manager').map((r) => r.id)).toEqual(['dni', 'owner_authorization']);
  });

  it('un estacionamiento suma la habilitación municipal, pero opcional', () => {
    const requirements = documentRequirements('owner', 'lot');
    expect(requirements.at(-1)).toMatchObject({ id: 'commercial_license', optional: true });
    expect(documentRequirements('owner', 'house').some((r) => r.id === 'commercial_license')).toBe(false);
  });
});

describe('missingDocumentRequirements', () => {
  it('sin nada cargado falta todo lo obligatorio', () => {
    expect(ids('owner', [])).toEqual(['dni', 'property_proof']);
  });

  it('para el titular, escritura o boleta cumplen el mismo requisito', () => {
    expect(ids('owner', ['dni', 'ownership_deed'])).toEqual([]);
    expect(ids('owner', ['dni', 'tax_bill'])).toEqual([]);
  });

  it('el DNI solo no alcanza', () => {
    expect(ids('owner', ['dni'])).toEqual(['property_proof']);
    expect(ids('manager', ['dni'])).toEqual(['owner_authorization']);
  });

  it('el comprobante solo, sin DNI, tampoco', () => {
    expect(ids('owner', ['tax_bill'])).toEqual(['dni']);
  });

  it('el inquilino necesita las dos cosas además del DNI', () => {
    expect(ids('tenant', ['dni', 'rental_contract'])).toEqual(['owner_authorization']);
    expect(ids('tenant', ['dni', 'rental_contract', 'owner_authorization'])).toEqual([]);
  });

  it('los documentos de otro rol no cuentan', () => {
    expect(ids('manager', ['dni', 'tax_bill'])).toEqual(['owner_authorization']);
  });

  it('la habilitación opcional nunca bloquea', () => {
    expect(ids('owner', ['dni', 'tax_bill'])).toEqual([]);
  });
});
