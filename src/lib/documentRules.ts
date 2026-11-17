// Documentos de titularidad que se piden para publicar, configurados por el equipo en el panel
// (Configuración → Aprobación y titularidad, migración 0097).
//
// El servidor (`lot_missing_documents`) es el que exige lo obligatorio; la app lee las reglas con
// `public_document_requirements()` para mostrar qué subir. Como los catálogos, lo vigente vive en
// un estado de módulo y las pantallas usan `useDocumentRules()`. Si la consulta falla (sin
// conexión, migración sin correr), quedan las reglas de antes de la 0097.

import { DEFAULT_DOCUMENT_RULES, parseDocumentRules, type DocumentRule } from '../../shared/domain';
import { supabase } from '@/lib/supabase/client';

let current: DocumentRule[] = DEFAULT_DOCUMENT_RULES;

export function documentRules(): DocumentRule[] {
  return current;
}

export function setDocumentRules(next: DocumentRule[]): void {
  current = next;
}

/** Trae las reglas, las deja como vigentes y las devuelve. */
export async function fetchDocumentRules(): Promise<DocumentRule[]> {
  const { data, error } = await supabase.rpc('public_document_requirements');
  if (error) throw error;
  const next = parseDocumentRules(data);
  setDocumentRules(next);
  return next;
}
