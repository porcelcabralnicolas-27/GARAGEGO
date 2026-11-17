import { useQuery } from '@tanstack/react-query';

import type { DocumentRule } from '../../shared/domain';
import { documentRules, fetchDocumentRules } from '@/lib/documentRules';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Reglas de documentos de titularidad (0097). Devuelve siempre un valor: mientras carga, o si la
 * consulta falla, las vigentes (al principio, las de siempre).
 */
export function useDocumentRules(): DocumentRule[] {
  const query = useQuery({
    queryKey: queryKeys.documentRules,
    queryFn: fetchDocumentRules,
    staleTime: 5 * 60_000,
  });
  return query.data ?? documentRules();
}
