import { useCallback, useEffect, useState } from 'react';

import { countUnreadMessageNotifications, subscribeToMessageNotificationChanges } from './api';
import type { NotificationAudience } from './types';

export function useUnreadMessagesCount(
  userId: string | undefined,
  audience: NotificationAudience
): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) return;
    countUnreadMessageNotifications(userId, audience)
      .then(setCount)
      .catch(() => {});
  }, [userId, audience]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToMessageNotificationChanges(userId, audience, {
      onInsert: () => setCount((prev) => prev + 1),
      onRead: () => refresh(),
      onDelete: () => refresh(),
    });
  }, [userId, audience, refresh]);

  return count;
}
