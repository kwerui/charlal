export type MessagingRealtimeStatus =
  | 'idle'
  | 'subscribed'
  | 'reconnecting'
  | 'unavailable';

export type MessagingRealtimeSubscriptionStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';

export function getMessagingRealtimeStatusAfterSnapshotRefresh(
  currentStatus: MessagingRealtimeStatus
): MessagingRealtimeStatus {
  return currentStatus;
}

export function getMessagingRealtimeStatusAfterSubscriptionStatus({
  nextStatus,
  hadSubscribed,
}: {
  nextStatus: MessagingRealtimeSubscriptionStatus;
  hadSubscribed: boolean;
}): MessagingRealtimeStatus {
  if (nextStatus === 'SUBSCRIBED') {
    return 'subscribed';
  }

  if (nextStatus === 'CLOSED') {
    return hadSubscribed ? 'reconnecting' : 'unavailable';
  }

  return 'unavailable';
}
