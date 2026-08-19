import type { AuthStatus } from '@/lib/auth/types';

export const MESSAGE_THREAD_BOTTOM_THRESHOLD_PX = 96;
export const MESSAGE_THREAD_REALTIME_RETRY_DELAYS_MS = [
  1000,
  3000,
  7000,
  15000,
] as const;
export const MESSAGE_THREAD_SNAPSHOT_HYDRATION_RETRY_DELAYS_MS = [
  750,
  2000,
] as const;

export type MessageThreadScrollMetrics = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
};

export type MessageThreadRealtimeChannelSummary = {
  topic: string;
};

export type MessageThreadRealtimePostgresChangeSpec = {
  event: 'INSERT' | 'UPDATE';
  schema: 'public';
  table: 'messages' | 'conversation_reads';
  filter: string;
};

export function getScrollBottomDistance({
  scrollHeight,
  clientHeight,
  scrollTop,
}: MessageThreadScrollMetrics): number {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function isNearMessageThreadBottom(
  metrics: MessageThreadScrollMetrics | null,
  thresholdPx = MESSAGE_THREAD_BOTTOM_THRESHOLD_PX
): boolean {
  if (!metrics) {
    return true;
  }

  return getScrollBottomDistance(metrics) <= thresholdPx;
}

export function shouldAutoScrollForThreadMessage({
  senderId,
  currentUserId,
  wasNearBottom,
}: {
  senderId: string;
  currentUserId: string;
  wasNearBottom: boolean;
}): boolean {
  return senderId === currentUserId || wasNearBottom;
}

export function canStartThreadRealtime({
  authStatus,
  authUserId,
  currentUserId,
  isBrowserOnline,
}: {
  authStatus: AuthStatus;
  authUserId: string | null | undefined;
  currentUserId: string;
  isBrowserOnline: boolean;
}): boolean {
  return (
    isBrowserOnline &&
    authStatus === 'authenticated' &&
    authUserId === currentUserId
  );
}

export function getThreadRealtimeRetryDelayMs(attemptIndex: number): number {
  const safeAttemptIndex = Math.max(0, Math.floor(attemptIndex));

  return MESSAGE_THREAD_REALTIME_RETRY_DELAYS_MS[
    Math.min(
      safeAttemptIndex,
      MESSAGE_THREAD_REALTIME_RETRY_DELAYS_MS.length - 1
    )
  ];
}

export function getMessageSnapshotHydrationRetryDelayMs(
  attemptIndex: number
): number | null {
  const safeAttemptIndex = Math.max(0, Math.floor(attemptIndex));

  return (
    MESSAGE_THREAD_SNAPSHOT_HYDRATION_RETRY_DELAYS_MS[safeAttemptIndex] ?? null
  );
}

export function shouldRetryMessageSnapshotHydration({
  reason,
  attachmentCount,
  retryAttemptIndex,
}: {
  reason: string;
  attachmentCount: number;
  retryAttemptIndex: number;
}): boolean {
  return (
    reason === 'message-insert' &&
    attachmentCount === 0 &&
    getMessageSnapshotHydrationRetryDelayMs(retryAttemptIndex) !== null
  );
}

export function toSupabaseRealtimeTopic(channelName: string): string {
  return `realtime:${channelName}`;
}

export function getRealtimeChannelName(
  channelBaseName: string,
  generation: number
): string {
  return `${channelBaseName}:g${Math.max(0, Math.floor(generation))}`;
}

export function countRealtimeChannelsForTopic(
  channels: MessageThreadRealtimeChannelSummary[],
  topic: string
): number {
  return channels.filter((channel) => channel.topic === topic).length;
}

export function countRealtimeChannelsForTopicPrefix(
  channels: MessageThreadRealtimeChannelSummary[],
  topicPrefix: string
): number {
  return channels.filter((channel) => channel.topic.startsWith(topicPrefix))
    .length;
}

export function shouldHydrateRealtimeMessageSnapshot({
  eventTable,
  rawEventIncludesAttachments,
}: {
  eventTable: 'messages' | 'message_attachments';
  rawEventIncludesAttachments: boolean;
}): boolean {
  return eventTable === 'message_attachments' || !rawEventIncludesAttachments;
}

export function getThreadRealtimePostgresChangeSpecs(
  conversationId: string
): MessageThreadRealtimePostgresChangeSpec[] {
  const filter = `conversation_id=eq.${conversationId}`;

  return [
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter,
    },
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter,
    },
    {
      event: 'INSERT',
      schema: 'public',
      table: 'conversation_reads',
      filter,
    },
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'conversation_reads',
      filter,
    },
  ];
}
