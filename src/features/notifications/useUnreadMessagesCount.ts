import { useCallback, useEffect, useState } from 'react';

import { countUnreadMessageNotifications, subscribeToMessageNotificationChanges } from './api';

export function useUnreadMessagesCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) return;
    countUnreadMessageNotifications(userId)
      .then(setCount)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    return subscribeToMessageNotificationChanges(userId, {
      onInsert: () => setCount((prev) => prev + 1),
      onRead: () => refresh(),
      onDelete: () => refresh(),
    });
  }, [userId, refresh]);

  return count;
}
