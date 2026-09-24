import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { listConversationsPage, type ConversationCursor } from '@/features/messaging/api';
import type { ThreadRole } from '@/features/messaging/types';
import { listUnreadMessageNotifications } from '@/features/notifications/api';
import { flattenPages } from '@/lib/pagination';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Datos de la lista de conversaciones (conductor o propietario): los hilos, de a una página, y
 * qué reservas tienen mensajes sin leer. Las dos consultas van en paralelo.
 */
export function useConversations(userId: string | undefined, role: ThreadRole) {
  const threadsKey =
    role === 'client' ? queryKeys.messaging.clientThreads(userId ?? '') : queryKeys.messaging.ownerThreads(userId ?? '');

  const threadsQuery = useInfiniteQuery({
    queryKey: threadsKey,
    queryFn: ({ pageParam }) => listConversationsPage(role, pageParam),
    initialPageParam: null as ConversationCursor | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(userId),
  });

  const unreadQuery = useQuery({
    queryKey: [...threadsKey, 'unread'],
    queryFn: () => listUnreadMessageNotifications(userId as string, role),
    enabled: Boolean(userId),
  });

  const unreadBookingIds = useMemo(
    () =>
      new Set((unreadQuery.data ?? []).map((n) => n.relatedBookingId).filter((id): id is string => id !== null)),
    [unreadQuery.data]
  );

  const { refetch: refetchThreads } = threadsQuery;
  const { refetch: refetchUnread } = unreadQuery;
  const refetch = useCallback(() => {
    refetchThreads();
    refetchUnread();
  }, [refetchThreads, refetchUnread]);

  // Un mensaje nuevo puede llegar mientras se estaba en otra pestaña: el refetch al enfocar
  // trae el hilo actualizado sin depender de una suscripción realtime en esta lista.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  return {
    threads: flattenPages(threadsQuery.data),
    unreadBookingIds,
    isLoading: threadsQuery.isLoading,
    isError: threadsQuery.isError,
    refetch,
    loadMore: () => {
      if (threadsQuery.hasNextPage && !threadsQuery.isFetchingNextPage) threadsQuery.fetchNextPage();
    },
    isFetchingMore: threadsQuery.isFetchingNextPage,
  };
}
