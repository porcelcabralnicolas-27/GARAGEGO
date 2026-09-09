/**
 * Datos REALES de los tickets de soporte para el panel (migración 0041).
 *
 * El admin lee `support_tickets` y `support_ticket_messages` por policy (`is_admin()`), pero no
 * tiene RLS sobre `bookings`: el nombre de la cochera de un ticket de conductor lo resuelve la
 * RPC `admin_ticket_context()`.
 */

import { supabase } from '../../lib/supabase';
import type { TicketCategory, TicketStatus } from '../../mocks/types';

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
  messages: PanelTicketMessage[];
};

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
};

type MessageRow = {
  id: string;
  ticket_id: string;
  author_role: 'user' | 'admin';
  body: string;
  created_at: string;
};

type ContextRow = { ticket_id: string; reporter_name: string; related_lot_name: string | null };

function guard(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase no está configurado (falta el .env del panel).');
  return supabase;
}

export async function fetchTickets(): Promise<PanelTicket[]> {
  const db = guard();

  const { data: tickets, error } = await db
    .from('support_tickets')
    .select('id, code, subject, category, status, reporter_role, created_at, updated_at, last_message_at')
    .order('last_message_at', { ascending: false })
    .returns<TicketRow[]>();
  if (error) throw error;
  if (!tickets || tickets.length === 0) return [];

  const ids = tickets.map((t) => t.id);
  const [messagesRes, contextRes] = await Promise.all([
    db
      .from('support_ticket_messages')
      .select('id, ticket_id, author_role, body, created_at')
      .in('ticket_id', ids)
      .order('created_at', { ascending: true })
      .returns<MessageRow[]>(),
    db.rpc('admin_ticket_context'),
  ]);
  if (messagesRes.error) throw messagesRes.error;
  if (contextRes.error) throw contextRes.error;

  const ctxByTicket = new Map(
    ((contextRes.data ?? []) as ContextRow[]).map((c) => [c.ticket_id, c])
  );

  const messagesByTicket = new Map<string, MessageRow[]>();
  for (const m of messagesRes.data ?? []) {
    const list = messagesByTicket.get(m.ticket_id) ?? [];
    list.push(m);
    messagesByTicket.set(m.ticket_id, list);
  }

  return tickets.map((t) => {
    const ctx = ctxByTicket.get(t.id);
    const reporterName = ctx?.reporter_name ?? 'Usuario';
    return {
      id: t.id,
      code: t.code,
      subject: t.subject,
      category: t.category,
      status: t.status,
      reporterName,
      reporterRole: t.reporter_role,
      contextLabel: ctx?.related_lot_name ?? null,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      messages: (messagesByTicket.get(t.id) ?? []).map((m) => ({
        id: m.id,
        authorSide: m.author_role,
        authorName: m.author_role === 'admin' ? 'Soporte GarageGo' : reporterName,
        body: m.body,
        createdAt: m.created_at,
      })),
    };
  });
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
