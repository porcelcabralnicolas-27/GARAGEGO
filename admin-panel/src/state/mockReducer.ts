import type {
  AdminParkingLot,
  AdminTicket,
  ApprovalStatus,
  MockState,
  ModerationState,
  TicketCategory,
  TicketStatus,
} from '../mocks/types';

/**
 * Acciones sobre el mock. Cada una es el equivalente de lo que mañana sería una RPC o un update
 * contra Supabase, así que la lista de acá es, en la práctica, la especificación de la API que
 * hace falta para que el panel funcione de verdad.
 */
export type MockAction =
  | { type: 'APPROVE_LOT'; lotId: string }
  | { type: 'REJECT_LOT'; lotId: string; reason: string }
  | { type: 'REQUEST_CHANGES_LOT'; lotId: string; note: string }
  | { type: 'RESTORE_LOT'; lot: AdminParkingLot }
  | { type: 'SET_LOT_MODERATION'; lotIds: string[]; state: ModerationState; reason: string | null; until: string | null }
  | { type: 'SET_RATING_HIDDEN'; ratingId: string; hidden: boolean; reason: string | null }
  | { type: 'SET_TICKET_STATUS'; ticketId: string; status: TicketStatus }
  | { type: 'SET_TICKET_CATEGORY'; ticketId: string; category: TicketCategory }
  | { type: 'ADD_TICKET_REPLY'; ticketId: string; body: string }
  | { type: 'CREATE_TICKET'; ticket: AdminTicket }
  | { type: 'TICK'; now: number; onlineUserIds: string[] }
  | { type: 'RESET'; state: MockState };

const APPROVAL_EVENT_LABEL: Record<ApprovalStatus, string> = {
  approved: 'Aprobada por el equipo',
  rejected: 'Rechazada por el equipo',
  changes_requested: 'Se pidieron cambios',
  pending: 'Enviada a revisión',
};

function withModerationEvent(
  state: MockState,
  lotId: string,
  label: string,
  detail: string | null,
  now: number
): MockState['moderationEvents'] {
  return [
    ...state.moderationEvents,
    {
      id: `mev-${lotId}-${now}-${state.moderationEvents.length}`,
      parkingLotId: lotId,
      label,
      detail,
      at: new Date(now).toISOString(),
    },
  ];
}

/** Aplica un cambio de estado de aprobación y deja el rastro en el historial de moderación. */
function moderate(
  state: MockState,
  lotId: string,
  approvalStatus: ApprovalStatus,
  reason: string | null
): MockState {
  const nowIso = new Date(state.now).toISOString();
  return {
    ...state,
    parkingLots: state.parkingLots.map((lot) =>
      lot.id === lotId
        ? {
            ...lot,
            approvalStatus,
            // Aprobar es lo que efectivamente publica la cochera: hasta acá `isActive` era false.
            isActive: approvalStatus === 'approved',
            reviewedAt: nowIso,
            reviewedBy: 'Equipo GarageGo',
            rejectionReason: reason,
            updatedAt: nowIso,
          }
        : lot
    ),
    moderationEvents: withModerationEvent(
      state,
      lotId,
      APPROVAL_EVENT_LABEL[approvalStatus],
      reason,
      state.now
    ),
  };
}

export function mockReducer(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case 'APPROVE_LOT':
      return moderate(state, action.lotId, 'approved', null);

    case 'REJECT_LOT':
      return moderate(state, action.lotId, 'rejected', action.reason);

    case 'REQUEST_CHANGES_LOT':
      return moderate(state, action.lotId, 'changes_requested', action.note);

    // Deshacer: se restituye la fila entera tal como estaba, no se intenta invertir la acción.
    case 'RESTORE_LOT':
      return {
        ...state,
        parkingLots: state.parkingLots.map((lot) => (lot.id === action.lot.id ? action.lot : lot)),
      };

    case 'SET_LOT_MODERATION': {
      const ids = new Set(action.lotIds);
      const label =
        action.state === 'live'
          ? 'Reactivada por el equipo'
          : action.state === 'suspended'
            ? 'Suspendida por el equipo'
            : 'Pausada por el equipo';

      let events = state.moderationEvents;
      action.lotIds.forEach((lotId) => {
        events = withModerationEvent({ ...state, moderationEvents: events }, lotId, label, action.reason, state.now);
      });

      return {
        ...state,
        parkingLots: state.parkingLots.map((lot) =>
          ids.has(lot.id)
            ? {
                ...lot,
                moderationState: action.state,
                pauseReason: action.state === 'live' ? null : action.reason,
                suspendedUntil: action.state === 'suspended' ? action.until : null,
                updatedAt: new Date(state.now).toISOString(),
              }
            : lot
        ),
        moderationEvents: events,
      };
    }

    case 'SET_RATING_HIDDEN':
      return {
        ...state,
        ratings: state.ratings.map((r) =>
          r.id === action.ratingId
            ? { ...r, isHidden: action.hidden, hiddenReason: action.hidden ? action.reason : null }
            : r
        ),
      };

    case 'SET_TICKET_STATUS':
      return {
        ...state,
        tickets: state.tickets.map((t) =>
          t.id === action.ticketId
            ? { ...t, status: action.status, updatedAt: new Date(state.now).toISOString() }
            : t
        ),
      };

    case 'SET_TICKET_CATEGORY':
      return {
        ...state,
        tickets: state.tickets.map((t) =>
          t.id === action.ticketId ? { ...t, category: action.category } : t
        ),
      };

    case 'ADD_TICKET_REPLY': {
      const nowIso = new Date(state.now).toISOString();
      return {
        ...state,
        tickets: state.tickets.map((t) =>
          t.id === action.ticketId
            ? {
                ...t,
                updatedAt: nowIso,
                messages: [
                  ...t.messages,
                  {
                    id: `tmsg-${t.id}-${t.messages.length + 1}`,
                    ticketId: t.id,
                    authorSide: 'admin' as const,
                    authorName: 'Equipo GarageGo',
                    body: action.body,
                    createdAt: nowIso,
                  },
                ],
              }
            : t
        ),
      };
    }

    case 'CREATE_TICKET':
      return { ...state, tickets: [action.ticket, ...state.tickets] };

    case 'TICK':
      return { ...state, now: action.now, onlineUserIds: action.onlineUserIds };

    case 'RESET':
      return action.state;

    default:
      return state;
  }
}
