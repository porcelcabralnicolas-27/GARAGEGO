import { useEffect, useState } from 'react';

import { DEFAULT_DOCUMENT_RULES, type DocumentRule } from '../../domain';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { fetchRulesForReview } from './documentRulesApi';

let current: readonly DocumentRule[] = DEFAULT_DOCUMENT_RULES;

/** Reglas de documentos (0097) para la revisión de Inventario. Sin la migración, las de siempre. */
export function useDocumentRules(): readonly DocumentRule[] {
  const [rules, setRules] = useState(current);

  const load = () => {
    void fetchRulesForReview().then((next) => {
      current = next;
      setRules(next);
    });
  };

  useEffect(load, []);
  useRealtimeRefresh('admin-document-rules', ['document_requirements'], load);

  return rules;
}
