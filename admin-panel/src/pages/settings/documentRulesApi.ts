/**
 * Documentos de titularidad configurables (migración 0097): qué se le pide al propietario para
 * publicar. Viven en `document_requirements`; el equipo los lee y edita por RLS, y
 * `lot_missing_documents` los hace cumplir en el servidor.
 */

import { DEFAULT_DOCUMENT_RULES, type DocumentKind, type DocumentPolicy, type DocumentRule, type LotType } from '../../domain';
import { supabase } from '../../lib/supabase';

export type DocumentRuleItem = DocumentRule & {
  isBuiltin: boolean;
  position: number;
  /** Para SortableList: "activo" = se pide (obligatorio u opcional). */
  isActive: boolean;
};

export type DocumentRuleInput = Omit<DocumentRule, 'code'>;

export const DOCUMENT_POLICY_LABELS: Record<DocumentPolicy, string> = {
  required: 'Obligatorio',
  optional: 'Opcional',
  off: 'No se pide',
};

export const RULE_LOT_TYPE_LABELS: Record<'all' | LotType, string> = {
  all: 'Todos los lugares',
  house: 'Solo cocheras de casa',
  lot: 'Solo estacionamientos',
};

type RuleRow = {
  code: string;
  label: string;
  hint: string;
  kinds: DocumentKind[];
  for_owner: boolean;
  for_tenant: boolean;
  for_manager: boolean;
  applies_lot_type: 'all' | LotType;
  policy: DocumentPolicy;
  is_builtin: boolean;
  position: number;
};

const COLUMNS = 'code, label, hint, kinds, for_owner, for_tenant, for_manager, applies_lot_type, policy, is_builtin, position';

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

export function documentRuleErrorMessage(message: string): string {
  if (message.includes('document_requirements_some_role')) return 'Elegí al menos a quién se le pide.';
  if (message.includes('document_requirements_kinds_check') || message.includes('kinds')) {
    return 'Elegí al menos un documento que cumpla el requisito.';
  }
  if (message.includes('document_requirements_label_check')) return 'El nombre tiene que tener entre 3 y 80 caracteres.';
  if (message.includes('catalog_code_immutable')) return 'El código de un requisito no se puede cambiar.';
  if (message.includes('document_requirements')) return `${message} (¿está corrida la migración 0097?)`;
  return message;
}

function fail(error: { message: string }): never {
  throw new Error(documentRuleErrorMessage(error.message));
}

function toItem(row: RuleRow): DocumentRuleItem {
  return {
    code: row.code,
    label: row.label,
    hint: row.hint ?? '',
    kinds: row.kinds ?? [],
    forOwner: row.for_owner,
    forTenant: row.for_tenant,
    forManager: row.for_manager,
    appliesLotType: row.applies_lot_type,
    policy: row.policy,
    isBuiltin: row.is_builtin,
    position: row.position,
    isActive: row.policy !== 'off',
  };
}

function toRow(input: Partial<DocumentRuleInput>) {
  return {
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.hint !== undefined ? { hint: input.hint.trim() } : {}),
    ...(input.kinds !== undefined ? { kinds: input.kinds } : {}),
    ...(input.forOwner !== undefined ? { for_owner: input.forOwner } : {}),
    ...(input.forTenant !== undefined ? { for_tenant: input.forTenant } : {}),
    ...(input.forManager !== undefined ? { for_manager: input.forManager } : {}),
    ...(input.appliesLotType !== undefined ? { applies_lot_type: input.appliesLotType } : {}),
    ...(input.policy !== undefined ? { policy: input.policy } : {}),
  };
}

/** Todos los requisitos, en orden. */
export async function fetchDocumentRules(): Promise<DocumentRuleItem[]> {
  const { data, error } = await client()
    .from('document_requirements')
    .select(COLUMNS)
    .order('position')
    .order('created_at');
  if (error) fail(error);
  return ((data ?? []) as RuleRow[]).map(toItem);
}

export async function createDocumentRule(input: DocumentRuleInput, items: DocumentRuleItem[]): Promise<void> {
  const position = items.reduce((max, item) => Math.max(max, item.position), 0) + 10;
  const { error } = await client().from('document_requirements').insert({ ...toRow(input), position });
  if (error) fail(error);
}

export async function updateDocumentRule(code: string, input: Partial<DocumentRuleInput>): Promise<void> {
  const { error } = await client().from('document_requirements').update(toRow(input)).eq('code', code);
  if (error) fail(error);
}

export async function swapDocumentRules(a: DocumentRuleItem, b: DocumentRuleItem): Promise<void> {
  const [posA, posB] = a.position === b.position ? [b.position + 1, a.position] : [b.position, a.position];
  const first = await client().from('document_requirements').update({ position: posA }).eq('code', a.code);
  if (first.error) fail(first.error);
  const second = await client().from('document_requirements').update({ position: posB }).eq('code', b.code);
  if (second.error) fail(second.error);
}

export async function deleteDocumentRule(code: string): Promise<void> {
  const { error } = await client().from('document_requirements').delete().eq('code', code);
  if (error) fail(error);
}

/** Para la revisión de Inventario: las reglas vigentes, o las de siempre si no se pueden leer. */
export async function fetchRulesForReview(): Promise<DocumentRule[]> {
  try {
    const items = await fetchDocumentRules();
    return items.length > 0 ? items : DEFAULT_DOCUMENT_RULES;
  } catch {
    return DEFAULT_DOCUMENT_RULES;
  }
}
