/**
 * Datos REALES de los tickets de soporte para el panel (migraciones 0041 y 0059).
 *
 * La lista viene de `admin_tickets_page()`, paginada y con los filtros aplicados en el servidor
 * (el admin no tiene RLS sobre `bookings`, así que el nombre de la cochera también lo resuelve
 * la RPC). Los mensajes se piden solo del ticket que se abre: antes se traían todos los
 * mensajes de todos los tickets en cada carga.
 */

import { supabase } from '../../lib/supabase';
import type { TicketCategory, TicketStatus } from '../../domain';

export type PanelTicketMessage = {
  id: string;
  authorSide: 'user' | 'admin';
  authorName: string;
  body: string;
  createdAt: string;
};

export type PanelTicket = {
  id: string;
  code: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  reporterName: string;
  reporterRole: 'client' | 'owner';
  contextLabel: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
};

export const TICKETS_PAGE_SIZE = 30;

export type TicketFilters = {
  status: TicketStatus | null;
  category: TicketCategory | null;
  search: string;
};

export type TicketCursor = { lastMessageAt: string; id: string };

export type TicketCounts = { open: number; resolved: number; all: number };

type TicketRow = {
  id: string;
  code: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  reporter_role: 'client' | 'owner';
  created_at: string;
  updated_at: string;
  last_message_at: string;
  reporter_name: string;
  context_label: string | null;
  last_message_preview: string | null;
};

type MessageRow = {
  id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
};

function guard(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

/**
 * Una página de tickets, del último mensaje más nuevo al más viejo. `limit` permite recargar de
 * una vez las filas ya cargadas cuando llega un evento de Realtime (hasta 100).
 */
export async function fetchTicketsPage(
  filters: TicketFilters,
  cursor: TicketCursor | null,
  limit = TICKETS_PAGE_SIZE
): Promise<{ rows: PanelTicket[]; nextCursor: TicketCursor | null }> {
  const { data, error } = await guard().rpc('admin_tickets_page', {
    p_limit: limit,
    p_status: filters.status,
    p_category: filters.category,
    p_search: filters.search.trim() || null,
    p_cursor_last_message_at: cursor?.lastMessageAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const rows = ((data ?? []) as TicketRow[]).map((t) => ({
    id: t.id,
    code: t.code,
    subject: t.subject,
    category: t.category,
    status: t.status,
    reporterName: t.reporter_name,
    reporterRole: t.reporter_role,
    contextLabel: t.context_label,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    lastMessageAt: t.last_message_at,
    lastMessagePreview: t.last_message_preview,
  }));
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: rows.length === limit && last ? { lastMessageAt: last.lastMessageAt, id: last.id } : null,
  };
}

/** Cuántos tickets hay en cada estado, para las pestañas. Tres `count` sin traer filas. */
export async function fetchTicketCounts(): Promise<TicketCounts> {
  const db = guard();
  const count = (status: TicketStatus | null) => {
    const query = db.from('support_tickets').select('id', { count: 'exact', head: true });
    return status ? query.eq('status', status) : query;
  };
  const [open, resolved, all] = await Promise.all([count('open'), count('resolved'), count(null)]);
  for (const result of [open, resolved, all]) if (result.error) throw result.error;
  return { open: open.count ?? 0, resolved: resolved.count ?? 0, all: all.count ?? 0 };
}

/** Todos los mensajes de UN ticket, en orden cronológico. */
export async function fetchTicketMessages(ticketId: string, reporterName: string): Promise<PanelTicketMessage[]> {
  const { data, error } = await guard()
    .from('support_ticket_messages')
    .select('id, author_role, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>();
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    authorSide: m.author_role,
    authorName: m.author_role === 'admin' ? 'Soporte GarageGo' : reporterName,
    body: m.body,
    createdAt: m.created_at,
  }));
}

export async function replyToTicket(ticketId: string, adminId: string, body: string): Promise<void> {
  const { error } = await guard()
    .from('support_ticket_messages')
    .insert({ ticket_id: ticketId, author_id: adminId, author_role: 'admin', body: body.trim() });
  if (error) throw error;
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const { error } = await guard().from('support_tickets').update({ status }).eq('id', ticketId);
  if (error) throw error;
}

export async function setTicketCategory(ticketId: string, category: TicketCategory): Promise<void> {
  const { error } = await guard().from('support_tickets').update({ category }).eq('id', ticketId);
  if (error) throw error;
}
