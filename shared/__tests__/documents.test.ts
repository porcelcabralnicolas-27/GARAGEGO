import {
  DEFAULT_DOCUMENT_RULES,
  documentRequirements,
  missingDocumentRequirements,
  parseDocumentRules,
  type DocumentRule,
} from '../domain';

// Sin reglas, se usan las de siempre (DEFAULT_DOCUMENT_RULES, las mismas que carga la 0097). La regla
// se repite en SQL (`lot_missing_documents`): supabase/tests/document_requirements_checks.sql prueba
// la del servidor.

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

describe('reglas configurables (0097)', () => {
  const withPolicy = (code: string, policy: DocumentRule['policy']): DocumentRule[] =>
    DEFAULT_DOCUMENT_RULES.map((rule) => (rule.code === code ? { ...rule, policy } : rule));

  it('un requisito en "No se pide" no aparece ni se exige', () => {
    const rules = withPolicy('property_proof', 'off');
    expect(documentRequirements('owner', 'house', rules).map((r) => r.id)).toEqual(['dni']);
    expect(missingDocumentRequirements('owner', ['dni'], 'house', rules)).toEqual([]);
  });

  it('la habilitación obligatoria se exige solo en estacionamientos', () => {
    const rules = withPolicy('commercial_license', 'required');
    expect(missingDocumentRequirements('owner', ['dni', 'tax_bill'], 'lot', rules).map((r) => r.id)).toEqual([
      'commercial_license',
    ]);
    expect(missingDocumentRequirements('owner', ['dni', 'tax_bill'], 'house', rules)).toEqual([]);
  });

  it('un opcional se marca como opcional en el nombre', () => {
    const optional = documentRequirements('owner', 'lot').find((r) => r.id === 'commercial_license');
    expect(optional?.label).toBe('Habilitación municipal (opcional)');
  });

  it('lee lo que devuelve public_document_requirements y descarta lo raro', () => {
    const rules = parseDocumentRules([
      { code: 'dni', label: 'DNI', hint: '', kinds: ['dni'], for_owner: true, for_tenant: false, for_manager: false, applies_lot_type: 'all', policy: 'required' },
      { code: 'raro', label: 'Sin tipos', kinds: ['pasaporte'] },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ code: 'dni', forOwner: true, forTenant: false, policy: 'required' });
    expect(parseDocumentRules(null)).toBe(DEFAULT_DOCUMENT_RULES);
    expect(parseDocumentRules([])).toBe(DEFAULT_DOCUMENT_RULES);
  });
});
