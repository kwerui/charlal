'use client';

import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/realtime-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChangeEvent, CSSProperties, FormEvent } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import {
  deleteMessageAction,
  editMessageAction,
  getConversationMessageSnapshotAction,
  getConversationThreadSnapshotAction,
  hideConversationAction,
  markConversationReadAction,
  sendMessageAction,
} from '@/app/account/messages/actions';
import { content } from '@/content/tyv';
import { useAuthStatus } from '@/lib/auth/client';
import {
  canStartThreadRealtime,
  countRealtimeChannelsForTopicPrefix,
  getRealtimeChannelName,
  getMessageSnapshotHydrationRetryDelayMs,
  getThreadRealtimePostgresChangeSpecs,
  getScrollBottomDistance,
  getThreadRealtimeRetryDelayMs,
  isNearMessageThreadBottom,
  shouldHydrateRealtimeMessageSnapshot,
  shouldAutoScrollForThreadMessage,
  shouldRetryMessageSnapshotHydration,
  toSupabaseRealtimeTopic,
} from '@/lib/messageThreadClientBehavior';
import { useMessagingRealtime } from '@/lib/messagingRealtime';
import {
  MESSAGE_BODY_MAX_LENGTH,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_ACCEPT,
  databaseConversationReadRowToApp,
  databaseMessageRowToApp,
  isDatabaseConversationReadRow,
  isDatabaseMessageRow,
  type AppConversationRead,
  type AppConversation,
  type AppConversationPublicCounterpart,
  type AppMessage,
  type AppMessageAttachment,
  type DatabaseConversationReadRow,
  type DatabaseMessageRow,
} from '@/lib/messagingTypes';
import { createClient } from '@/lib/supabase/client';
import {
  getRealtimeDiagnostics,
  subscribeWithRealtimeDiagnostics,
} from '@/lib/supabase/realtimeDiagnostics';
import {
  cleanupUploadedMessageAttachments,
  prepareMessageAttachmentMetadata,
} from '@/lib/supabase/messageAttachmentUploadsClient';
import type { MessageAttachmentMetadataInput } from '@/lib/supabase/messageAttachments';

type Props = {
  conversation: AppConversation;
  counterpart: AppConversationPublicCounterpart;
  initialMessages: AppMessage[];
  initialAttachments: AppMessageAttachment[];
  initialReadMarkers: AppConversationRead[];
  currentUserId: string;
};

type ThreadRealtimeStatus =
  | 'idle'
  | 'subscribed'
  | 'reconnecting'
  | 'unavailable';

type VisibleConnectionStatus =
  | 'offline'
  | 'reconnecting'
  | 'unavailable'
  | null;

type SendStatus =
  | 'idle'
  | 'sending'
  | 'delivery-uncertain'
  | 'failed';

type PendingDelivery = {
  body: string;
  clientAttemptId: string;
  attachmentSignature: string;
  uploadedAttachments: MessageAttachmentMetadataInput[];
};

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

type AttachmentViewerState = {
  kind: 'sent';
  attachmentId: string;
} | {
  kind: 'pending';
  attachmentId: string;
};

type ConversationPhotoGalleryItem = {
  attachment: AppMessageAttachment;
  message: AppMessage;
  positionInMessage: number;
  messageAttachmentCount: number;
};

type PendingPhotoGalleryItem = {
  attachment: PendingAttachment;
  position: number;
  total: number;
};

type FollowNewestTarget = {
  messageId: string;
  attachmentCount: number | null;
  settledAttachmentCount: number;
  snapshotResolved: boolean;
};

type InitialBottomPinState = {
  conversationId: string;
  pendingAttachmentIds: Set<string>;
  settlingFrame: number | null;
};

type MessageMenuOverlay = {
  messageId: string;
  top: number;
  left: number;
};

type ConfirmationDialogState =
  | {
      kind: 'message';
      messageId: string;
    }
  | {
      kind: 'conversation';
    };

type ThreadRealtimeDiagnosticSupabase = ReturnType<typeof createClient>;

const SEND_CONFIRMATION_TIMEOUT_MS = 12000;
const MESSAGE_MENU_WIDTH = 152;
const MESSAGE_MENU_HEIGHT = 78;
const VIEWPORT_OVERLAY_GUTTER = 12;

function getAttachmentsByMessageId(
  attachments: AppMessageAttachment[]
): Record<string, AppMessageAttachment[]> {
  const groupedAttachments: Record<string, AppMessageAttachment[]> = {};

  for (const attachment of attachments) {
    const existingAttachments = groupedAttachments[attachment.messageId] || [];

    groupedAttachments[attachment.messageId] = [
      ...existingAttachments,
      attachment,
    ].sort((first, second) => {
      if (first.position !== second.position) {
        return first.position - second.position;
      }

      return first.createdAt.localeCompare(second.createdAt);
    });
  }

  return groupedAttachments;
}

function getAttachmentSignature(
  attachments: MessageAttachmentMetadataInput[]
): string {
  return attachments
    .map((attachment) => `${attachment.storagePath}:${attachment.contentType}`)
    .join('|');
}

function formatMessageTime(value: string, useLocalTime: boolean): string {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: useLocalTime ? undefined : 'UTC',
  }).format(new Date(value));
}

function getDateParts(value: string, useLocalTime: boolean) {
  const date = new Date(value);

  return {
    year: useLocalTime ? date.getFullYear() : date.getUTCFullYear(),
    month: useLocalTime ? date.getMonth() : date.getUTCMonth(),
    day: useLocalTime ? date.getDate() : date.getUTCDate(),
  };
}

function getDateKey(value: string, useLocalTime: boolean): string {
  const parts = getDateParts(value, useLocalTime);
  const month = String(parts.month + 1).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');

  return `${parts.year}-${month}-${day}`;
}

function getRelativeDateKey(offsetDays: number, useLocalTime: boolean): string {
  const date = new Date();

  if (useLocalTime) {
    date.setDate(date.getDate() - offsetDays);
  } else {
    date.setUTCDate(date.getUTCDate() - offsetDays);
  }

  return getDateKey(date.toISOString(), useLocalTime);
}

function formatMessageDateDivider(value: string, useLocalTime: boolean): string {
  const dateKey = getDateKey(value, useLocalTime);

  if (dateKey === getRelativeDateKey(0, useLocalTime)) {
    return content.todayLabel;
  }

  if (dateKey === getRelativeDateKey(1, useLocalTime)) {
    return content.yesterdayLabel;
  }

  const parts = getDateParts(value, useLocalTime);
  const monthName = content.monthNames[parts.month] || '';

  return `${parts.day} ${monthName} ${parts.year}`.trim();
}

function getSendErrorMessage(reason: string): string {
  if (reason === 'empty-message') {
    return content.messageEmptyMessage;
  }

  if (reason === 'message-too-long') {
    return content.messageTooLongMessage;
  }

  if (reason === 'too-many-attachments') {
    return content.messageAttachmentMaximumMessage;
  }

  if (reason === 'invalid-attachment') {
    return content.messageAttachmentUnsupportedTypeMessage;
  }

  if (reason === 'attachment-upload-failed') {
    return content.messageAttachmentUploadFailedMessage;
  }

  return content.unableSendMessageMessage;
}

function compareMessagesByCreatedAt(left: AppMessage, right: AppMessage): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

function mergeMessage(
  currentMessages: AppMessage[],
  nextMessage: AppMessage
): AppMessage[] {
  if (currentMessages.some((message) => message.id === nextMessage.id)) {
    return currentMessages;
  }

  return [...currentMessages, nextMessage].sort(compareMessagesByCreatedAt);
}

function upsertMessage(
  currentMessages: AppMessage[],
  nextMessage: AppMessage
): AppMessage[] {
  if (currentMessages.some((message) => message.id === nextMessage.id)) {
    return currentMessages
      .map((message) => (message.id === nextMessage.id ? nextMessage : message))
      .sort(compareMessagesByCreatedAt);
  }

  return [...currentMessages, nextMessage].sort(compareMessagesByCreatedAt);
}

function mergeReadMarker(
  currentMarkers: AppConversationRead[],
  nextMarker: AppConversationRead
): AppConversationRead[] {
  const existingMarker = currentMarkers.find(
    (marker) =>
      marker.conversationId === nextMarker.conversationId &&
      marker.userId === nextMarker.userId
  );

  if (!existingMarker) {
    return [...currentMarkers, nextMarker];
  }

  return currentMarkers.map((marker) =>
    marker.conversationId === nextMarker.conversationId &&
    marker.userId === nextMarker.userId
      ? nextMarker
      : marker
  );
}

function isNearHistoryBottom(historyElement: HTMLDivElement | null): boolean {
  return isNearMessageThreadBottom(
    historyElement
      ? {
          scrollHeight: historyElement.scrollHeight,
          clientHeight: historyElement.clientHeight,
          scrollTop: historyElement.scrollTop,
        }
      : null
  );
}

function scrollHistoryToBottom(historyElement: HTMLDivElement | null): void {
  if (!historyElement) {
    return;
  }

  historyElement.scrollTop = historyElement.scrollHeight;
}

function getHistoryScrollDiagnosticMetrics(
  historyElement: HTMLDivElement | null
): Record<string, unknown> {
  if (!historyElement) {
    return {
      hasHistoryElement: false,
    };
  }

  const metrics = {
    scrollHeight: historyElement.scrollHeight,
    clientHeight: historyElement.clientHeight,
    scrollTop: historyElement.scrollTop,
  };

  return {
    hasHistoryElement: true,
    ...metrics,
    distanceFromBottom: getScrollBottomDistance(metrics),
    isNearBottom: isNearMessageThreadBottom(metrics),
  };
}

function isElementVisibleInHistory(
  historyElement: HTMLDivElement | null,
  targetElement: HTMLElement | null
): boolean {
  if (!historyElement || !targetElement) {
    return false;
  }

  const historyRect = historyElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();

  return (
    targetRect.top >= historyRect.top &&
    targetRect.bottom <= historyRect.bottom
  );
}

function canMarkConversationReadNow(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function getMenuOverlayPosition(triggerElement: HTMLElement): {
  top: number;
  left: number;
} {
  const rect = triggerElement.getBoundingClientRect();
  const bubbleRect =
    triggerElement.closest('.message-bubble')?.getBoundingClientRect() || rect;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = viewportWidth - MESSAGE_MENU_WIDTH - VIEWPORT_OVERLAY_GUTTER;
  const belowTop = bubbleRect.bottom + 6;
  const aboveTop = bubbleRect.top - MESSAGE_MENU_HEIGHT - 6;
  const hasRoomBelow =
    belowTop + MESSAGE_MENU_HEIGHT <= viewportHeight - VIEWPORT_OVERLAY_GUTTER;

  return {
    top: Math.max(
      VIEWPORT_OVERLAY_GUTTER,
      hasRoomBelow ? belowTop : Math.max(VIEWPORT_OVERLAY_GUTTER, aboveTop)
    ),
    left: Math.min(
      Math.max(VIEWPORT_OVERLAY_GUTTER, bubbleRect.right - MESSAGE_MENU_WIDTH),
      Math.max(VIEWPORT_OVERLAY_GUTTER, maxLeft)
    ),
  };
}

function getConnectionStatusMessage(status: VisibleConnectionStatus): string {
  if (status === 'offline') {
    return content.offlineThreadStatusMessage;
  }

  if (status === 'reconnecting') {
    return content.reconnectingLabel;
  }

  if (status === 'unavailable') {
    return content.liveUpdatesUnavailableMessage;
  }

  return '';
}

function logThreadRealtimeDiagnostic(
  conversationId: string,
  message: string,
  details: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.warn('[messaging-thread-realtime]', {
    conversationId,
    message,
    ...details,
  });
}

function logThreadScrollDiagnostic(
  conversationId: string,
  message: string,
  details: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.debug('[messaging-thread-scroll]', {
    conversationId,
    message,
    ...details,
  });
}

function serializeThreadRealtimeError(error: Error | undefined): Record<string, unknown> {
  if (!error) {
    return {
      hasError: false,
    };
  }

  const cause =
    'cause' in error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : null;

  return {
    hasError: true,
    errorName: error.name,
    errorMessage: error.message,
    errorCause: cause,
  };
}

function getThreadRealtimeDiagnostics(
  supabase: ThreadRealtimeDiagnosticSupabase,
  channelName: string,
  channelBaseName: string = channelName
): Record<string, unknown> {
  const logicalTopicPrefix = toSupabaseRealtimeTopic(`${channelBaseName}:`);
  const channels = supabase.getChannels();

  return {
    ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
    sameLogicalThreadChannelCount: countRealtimeChannelsForTopicPrefix(
      channels,
      logicalTopicPrefix
    ),
  };
}

function getCaptionSnippet(body: string): string {
  const normalizedBody = body.replace(/\s+/g, ' ').trim();
  const maxLength = 80;

  if (normalizedBody.length <= maxLength) {
    return normalizedBody;
  }

  return `${normalizedBody.slice(0, maxLength - 3).trimEnd()}...`;
}

function isDeliveryMatch(
  message: AppMessage,
  pendingDelivery: PendingDelivery,
  currentUserId: string
): boolean {
  return (
    message.senderId === currentUserId &&
    message.clientAttemptId === pendingDelivery.clientAttemptId
  );
}

function createClientAttemptId(): string {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const randomValues = new Uint8Array(16);
  window.crypto.getRandomValues(randomValues);
  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;

  const hexValues = Array.from(randomValues, (value) =>
    value.toString(16).padStart(2, '0')
  );

  return [
    hexValues.slice(0, 4).join(''),
    hexValues.slice(4, 6).join(''),
    hexValues.slice(6, 8).join(''),
    hexValues.slice(8, 10).join(''),
    hexValues.slice(10, 16).join(''),
  ].join('-');
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('message-send-timeout'));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export default function ConversationThread({
  conversation,
  counterpart,
  initialMessages,
  initialAttachments,
  initialReadMarkers,
  currentUserId,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { status: authStatus, user: authUser } = useAuthStatus();
  const { refreshMessagingState } = useMessagingRealtime();
  const [messages, setMessages] = useState(() =>
    [...initialMessages].sort(compareMessagesByCreatedAt)
  );
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState(() =>
    getAttachmentsByMessageId(initialAttachments)
  );
  const [readMarkers, setReadMarkers] = useState(initialReadMarkers);
  const [body, setBody] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [uploadedPendingAttachments, setUploadedPendingAttachments] = useState<
    MessageAttachmentMetadataInput[] | null
  >(null);
  const [attachmentViewer, setAttachmentViewer] =
    useState<AttachmentViewerState | null>(null);
  const [error, setError] = useState('');
  const [readStatusError, setReadStatusError] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [isBrowserOnline, setIsBrowserOnline] = useState(true);
  const [useLocalTime, setUseLocalTime] = useState(false);
  const [threadStatus, setThreadStatus] =
    useState<ThreadRealtimeStatus>('idle');
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const [messageMenuOverlay, setMessageMenuOverlay] =
    useState<MessageMenuOverlay | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editingSubmittingMessageId, setEditingSubmittingMessageId] =
    useState<string | null>(null);
  const [confirmationDialog, setConfirmationDialog] =
    useState<ConfirmationDialogState | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );
  const [messageActionError, setMessageActionError] = useState('');
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [deleteConversationError, setDeleteConversationError] = useState('');
  const markReadInFlightRef = useRef(false);
  const lastRequestedReadBoundaryRef = useRef<string | null>(null);
  const readSentinelVisibleRef = useRef(false);
  const hasSubscribedRef = useRef(false);
  const shouldScrollToBottomRef = useRef(true);
  const initialThreadRevealRef = useRef(false);
  const messageHistoryRef = useRef<HTMLDivElement | null>(null);
  const messageListContentRef = useRef<HTMLDivElement | null>(null);
  const messageFormRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editContainerRef = useRef<HTMLFormElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAttachmentPreviewListRef = useRef<HTMLDivElement | null>(null);
  const readSentinelRef = useRef<HTMLDivElement | null>(null);
  const attachmentViewerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingAttachmentPreviewUrlsRef = useRef<Set<string>>(new Set());
  const confirmationDialogRef = useRef<HTMLDivElement | null>(null);
  const conversationDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const messageActionTriggerRefs = useRef<Map<string, HTMLButtonElement>>(
    new Map()
  );
  const mountedRef = useRef(false);
  const sendAttemptRef = useRef(0);
  const sendStatusRef = useRef<SendStatus>('idle');
  const previousPendingAttachmentCountRef = useRef(0);
  const pendingDeliveryRef = useRef<PendingDelivery | null>(null);
  const outgoingAttachmentScrollRef = useRef<{
    messageId: string;
    expectedCount: number;
    settledCount: number;
    completed: boolean;
  } | null>(null);
  const hydratingMessageIdsRef = useRef<Set<string>>(new Set());
  const hydrateAgainMessageIdsRef = useRef<Set<string>>(new Set());
  const hydrationRetryTimeoutsRef = useRef<Map<string, number>>(new Map());
  const followNewestTargetRef = useRef<FollowNewestTarget | null>(null);
  const isStickyToBottomRef = useRef(true);
  const initialBottomPinRef = useRef<InitialBottomPinState | null>(null);
  const programmaticHistoryScrollRef = useRef(false);
  const programmaticHistoryScrollFrameRef = useRef<number | null>(null);
  const lastHistoryScrollTopRef = useRef(0);
  const threadStatusRef = useRef<ThreadRealtimeStatus>('idle');
  const threadStatusVersionRef = useRef(0);
  const activeThreadChannelGenerationRef = useRef(0);
  const threadRealtimeRetryTimeoutRef = useRef<number | null>(null);
  const threadRealtimeRetryAttemptRef = useRef(0);
  const [threadReconnectGeneration, setThreadReconnectGeneration] =
    useState(0);
  const canSubscribeToThreadRealtime = canStartThreadRealtime({
    authStatus,
    authUserId: authUser?.id,
    currentUserId,
    isBrowserOnline,
  });
  const otherParticipantName = counterpart.displayName;
  const otherParticipantId =
    conversation.buyerId === currentUserId
      ? conversation.sellerId
      : conversation.buyerId;
  const latestOwnMessage = useMemo(() => {
    return [...messages]
      .filter(
        (message) =>
          message.senderId === currentUserId && message.deletedAt === null
      )
      .sort(compareMessagesByCreatedAt)
      .at(-1);
  }, [currentUserId, messages]);
  const otherReadMarker = readMarkers.find(
    (marker) => marker.userId === otherParticipantId
  );
  const currentUserReadMarker = readMarkers.find(
    (marker) => marker.userId === currentUserId
  );
  const newestUnreadIncomingMessage = useMemo(() => {
    const currentReadTime = Date.parse(
      currentUserReadMarker?.lastReadAt || ''
    );
    const safeCurrentReadTime = Number.isFinite(currentReadTime)
      ? currentReadTime
      : 0;

    return [...messages]
      .filter(
        (message) =>
          message.senderId !== currentUserId &&
          message.deletedAt === null &&
          Date.parse(message.createdAt) > safeCurrentReadTime
      )
      .sort(compareMessagesByCreatedAt)
      .at(-1);
  }, [currentUserId, currentUserReadMarker?.lastReadAt, messages]);
  const errorId = 'thread-message-error';
  const visibleConnectionStatus: VisibleConnectionStatus = !isBrowserOnline
    ? 'offline'
    : threadStatus === 'unavailable'
      ? 'unavailable'
      : threadStatus === 'reconnecting'
        ? 'reconnecting'
        : null;
  const conversationPhotoGallery = useMemo(() => {
    const galleryItems: ConversationPhotoGalleryItem[] = [];

    for (const message of messages) {
      if (message.deletedAt !== null) {
        continue;
      }

      const messageAttachments = attachmentsByMessageId[message.id] || [];
      const messageAttachmentCount = messageAttachments.length;

      for (const [attachmentIndex, attachment] of messageAttachments.entries()) {
        galleryItems.push({
          attachment,
          message,
          positionInMessage: attachmentIndex + 1,
          messageAttachmentCount,
        });
      }
    }

    return galleryItems;
  }, [attachmentsByMessageId, messages]);
  const pendingPhotoGallery = useMemo(() => {
    const total = pendingAttachments.length;

    return pendingAttachments.map<PendingPhotoGalleryItem>(
      (attachment, index) => ({
        attachment,
        position: index + 1,
        total,
      })
    );
  }, [pendingAttachments]);
  const currentGalleryIndex = attachmentViewer?.kind === 'sent'
    ? conversationPhotoGallery.findIndex(
        (galleryItem) =>
          galleryItem.attachment.id === attachmentViewer.attachmentId
      )
    : -1;
  const currentPendingGalleryIndex = attachmentViewer?.kind === 'pending'
    ? pendingPhotoGallery.findIndex(
        (galleryItem) =>
          galleryItem.attachment.id === attachmentViewer.attachmentId
      )
    : -1;
  const selectedGalleryItem =
    currentGalleryIndex >= 0 ? conversationPhotoGallery[currentGalleryIndex] : null;
  const selectedPendingGalleryItem =
    currentPendingGalleryIndex >= 0
      ? pendingPhotoGallery[currentPendingGalleryIndex]
      : null;
  const viewerPositionLabel = selectedGalleryItem
    ? content.messagePhotoInMessagePositionTemplate
        .replace('{current}', String(selectedGalleryItem.positionInMessage))
        .replace('{total}', String(selectedGalleryItem.messageAttachmentCount))
    : selectedPendingGalleryItem
      ? content.messagePhotoInMessagePositionTemplate
          .replace('{current}', String(selectedPendingGalleryItem.position))
          .replace('{total}', String(selectedPendingGalleryItem.total))
    : '';
  const viewerCaptionSnippet = selectedGalleryItem
    ? getCaptionSnippet(selectedGalleryItem.message.body)
    : '';
  const viewerMessageTime = selectedGalleryItem
    ? formatMessageTime(selectedGalleryItem.message.createdAt, useLocalTime)
    : '';
  const viewerMetadataLabel =
    viewerPositionLabel && viewerMessageTime
      ? `${viewerPositionLabel} · ${viewerMessageTime}`
      : viewerPositionLabel || viewerMessageTime;
  const selectedViewerPhotoUrl =
    selectedGalleryItem?.attachment.url ||
    selectedPendingGalleryItem?.attachment.previewUrl ||
    '';
  const viewerGalleryLength =
    attachmentViewer?.kind === 'pending'
      ? pendingPhotoGallery.length
      : conversationPhotoGallery.length;
  const canViewPreviousPhoto =
    attachmentViewer?.kind === 'pending'
      ? currentPendingGalleryIndex > 0
      : currentGalleryIndex > 0;
  const canViewNextPhoto =
    attachmentViewer?.kind === 'pending'
      ? currentPendingGalleryIndex >= 0 &&
        currentPendingGalleryIndex < pendingPhotoGallery.length - 1
      : currentGalleryIndex >= 0 &&
        currentGalleryIndex < conversationPhotoGallery.length - 1;

  const clearThreadRealtimeRetry = useCallback((): void => {
    if (threadRealtimeRetryTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(threadRealtimeRetryTimeoutRef.current);
    threadRealtimeRetryTimeoutRef.current = null;
  }, []);

  const clearMessageHydrationRetry = useCallback((messageId: string): void => {
    const retryTimeout = hydrationRetryTimeoutsRef.current.get(messageId);

    if (retryTimeout === undefined) {
      return;
    }

    window.clearTimeout(retryTimeout);
    hydrationRetryTimeoutsRef.current.delete(messageId);
  }, []);

  const clearMessageHydrationRetries = useCallback((): void => {
    for (const retryTimeout of hydrationRetryTimeoutsRef.current.values()) {
      window.clearTimeout(retryTimeout);
    }

    hydrationRetryTimeoutsRef.current.clear();
  }, []);

  const showPreviousViewerPhoto = useCallback((): void => {
    if (!attachmentViewer || !canViewPreviousPhoto) {
      return;
    }

    if (attachmentViewer.kind === 'pending') {
      setAttachmentViewer({
        kind: 'pending',
        attachmentId:
          pendingPhotoGallery[currentPendingGalleryIndex - 1].attachment.id,
      });
      return;
    }

    setAttachmentViewer({
      kind: 'sent',
      attachmentId:
        conversationPhotoGallery[currentGalleryIndex - 1].attachment.id,
    });
  }, [
    attachmentViewer,
    canViewPreviousPhoto,
    conversationPhotoGallery,
    currentGalleryIndex,
    currentPendingGalleryIndex,
    pendingPhotoGallery,
  ]);

  const showNextViewerPhoto = useCallback((): void => {
    if (!attachmentViewer || !canViewNextPhoto) {
      return;
    }

    if (attachmentViewer.kind === 'pending') {
      setAttachmentViewer({
        kind: 'pending',
        attachmentId:
          pendingPhotoGallery[currentPendingGalleryIndex + 1].attachment.id,
      });
      return;
    }

    setAttachmentViewer({
      kind: 'sent',
      attachmentId:
        conversationPhotoGallery[currentGalleryIndex + 1].attachment.id,
    });
  }, [
    attachmentViewer,
    canViewNextPhoto,
    conversationPhotoGallery,
    currentGalleryIndex,
    currentPendingGalleryIndex,
    pendingPhotoGallery,
  ]);

  const closeConfirmationDialog = useCallback((): void => {
    const previousDialog = confirmationDialog;

    setConfirmationDialog(null);
    setMessageActionError('');
    setDeleteConversationError('');

    window.requestAnimationFrame(() => {
      if (previousDialog?.kind === 'message') {
        messageActionTriggerRefs.current.get(previousDialog.messageId)?.focus();
        return;
      }

      if (previousDialog?.kind === 'conversation') {
        conversationDeleteButtonRef.current?.focus();
      }
    });
  }, [confirmationDialog]);

  useEffect(() => {
    const hydratingMessageIds = hydratingMessageIdsRef.current;
    const hydrateAgainMessageIds = hydrateAgainMessageIdsRef.current;
    const initialAttachmentIds = new Set(
      initialAttachments.map((attachment) => attachment.id)
    );

    initialThreadRevealRef.current = false;
    shouldScrollToBottomRef.current = true;
    isStickyToBottomRef.current = true;
    initialBottomPinRef.current = {
      conversationId: conversation.id,
      pendingAttachmentIds: initialAttachmentIds,
      settlingFrame: null,
    };
    lastHistoryScrollTopRef.current = 0;
    followNewestTargetRef.current = null;
    outgoingAttachmentScrollRef.current = null;
    hydratingMessageIds.clear();
    hydrateAgainMessageIds.clear();
    clearMessageHydrationRetries();
    threadRealtimeRetryAttemptRef.current = 0;
    clearThreadRealtimeRetry();
    mountedRef.current = true;
    const localTimeFrame = window.requestAnimationFrame(() => {
      setUseLocalTime(true);
    });
    logThreadScrollDiagnostic(conversation.id, 'Initialized initial bottom pin.', {
      initialMessageCount: initialMessages.length,
      initialAttachmentCount: initialAttachments.length,
      pendingInitialAttachmentCount: initialAttachmentIds.size,
      ...getHistoryScrollDiagnosticMetrics(messageHistoryRef.current),
    });

    return () => {
      window.cancelAnimationFrame(localTimeFrame);
      const initialBottomPin = initialBottomPinRef.current;

      if (initialBottomPin && initialBottomPin.settlingFrame !== null) {
        window.cancelAnimationFrame(initialBottomPin.settlingFrame);
      }

      initialBottomPinRef.current = null;
      mountedRef.current = false;
      sendAttemptRef.current += 1;
      pendingDeliveryRef.current = null;
      outgoingAttachmentScrollRef.current = null;
      followNewestTargetRef.current = null;
      hydratingMessageIds.clear();
      hydrateAgainMessageIds.clear();
      clearMessageHydrationRetries();
      clearThreadRealtimeRetry();
      if (programmaticHistoryScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(programmaticHistoryScrollFrameRef.current);
        programmaticHistoryScrollFrameRef.current = null;
      }
    };
  }, [
    clearMessageHydrationRetries,
    clearThreadRealtimeRetry,
    conversation.id,
    initialAttachments,
    initialMessages.length,
  ]);

  useEffect(() => {
    const previewUrls = pendingAttachmentPreviewUrlsRef.current;

    return () => {
      for (const previewUrl of previewUrls) {
        URL.revokeObjectURL(previewUrl);
      }

      previewUrls.clear();
    };
  }, []);

  useEffect(() => {
    const previousCount = previousPendingAttachmentCountRef.current;

    previousPendingAttachmentCountRef.current = pendingAttachments.length;

    if (pendingAttachments.length <= previousCount) {
      return undefined;
    }

    const scrollFrame = window.requestAnimationFrame(() => {
      pendingAttachmentPreviewListRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [pendingAttachments.length]);

  useEffect(() => {
    if (!attachmentViewer) {
      return undefined;
    }

    attachmentViewerCloseButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setAttachmentViewer(null);
        return;
      }

      if (viewerGalleryLength <= 1) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPreviousViewerPhoto();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNextViewerPhoto();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    attachmentViewer,
    showNextViewerPhoto,
    showPreviousViewerPhoto,
    viewerGalleryLength,
  ]);

  useEffect(() => {
    const missingSentPhoto =
      attachmentViewer?.kind === 'sent' && currentGalleryIndex < 0;
    const missingPendingPhoto =
      attachmentViewer?.kind === 'pending' && currentPendingGalleryIndex < 0;

    if (missingSentPhoto || missingPendingPhoto) {
      const closeFrame = window.requestAnimationFrame(() => {
        setAttachmentViewer(null);
      });

      return () => {
        window.cancelAnimationFrame(closeFrame);
      };
    }

    return undefined;
  }, [attachmentViewer, currentGalleryIndex, currentPendingGalleryIndex]);

  useEffect(() => {
    const messageHistoryElement = messageHistoryRef.current;

    function handlePointerDown(event: PointerEvent): void {
      if (
        event.target instanceof Element &&
        event.target.closest(
          '.message-actions-menu, .message-actions-trigger, .message-actions-menu-list--floating, .message-confirmation-dialog'
        )
      ) {
        return;
      }

      setMessageMenuOverlay(null);
    }

    function handleMessageMenuScroll(): void {
      setMessageMenuOverlay(null);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return;
      }

      if (confirmationDialog) {
        closeConfirmationDialog();
        return;
      }

      setMessageMenuOverlay(null);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    messageHistoryElement?.addEventListener('scroll', handleMessageMenuScroll);
    window.addEventListener('scroll', handleMessageMenuScroll, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      messageHistoryElement?.removeEventListener('scroll', handleMessageMenuScroll);
      window.removeEventListener('scroll', handleMessageMenuScroll, true);
    };
  }, [closeConfirmationDialog, confirmationDialog]);

  useEffect(() => {
    if (!confirmationDialog) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      confirmationDialogRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [confirmationDialog]);

  useEffect(() => {
    if (!editingMessageId) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const historyElement = messageHistoryRef.current;
      const editElement = editContainerRef.current;

      if (historyElement && editElement) {
        const historyRect = historyElement.getBoundingClientRect();
        const editRect = editElement.getBoundingClientRect();
        const scrollPadding = 10;

        if (editRect.top < historyRect.top + scrollPadding) {
          historyElement.scrollTop -=
            historyRect.top + scrollPadding - editRect.top;
        } else if (editRect.bottom > historyRect.bottom - scrollPadding) {
          historyElement.scrollTop +=
            editRect.bottom - (historyRect.bottom - scrollPadding);
        }
      }

      editTextareaRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [editingMessageId]);

  useEffect(() => {
    threadStatusRef.current = threadStatus;
  }, [threadStatus]);

  useEffect(() => {
    sendStatusRef.current = sendStatus;
  }, [sendStatus]);

  const updateSendStatus = useCallback((nextStatus: SendStatus): void => {
    sendStatusRef.current = nextStatus;
    setSendStatus(nextStatus);
  }, []);

  const scrollMessageHistoryToBottom = useCallback((): void => {
    if (programmaticHistoryScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(programmaticHistoryScrollFrameRef.current);
    }

    programmaticHistoryScrollRef.current = true;
    isStickyToBottomRef.current = true;
    scrollHistoryToBottom(messageHistoryRef.current);
    programmaticHistoryScrollFrameRef.current = window.requestAnimationFrame(
      () => {
        programmaticHistoryScrollFrameRef.current =
          window.requestAnimationFrame(() => {
            programmaticHistoryScrollRef.current = false;
            programmaticHistoryScrollFrameRef.current = null;
          });
      }
    );
  }, []);

  const scrollOutgoingAttachmentMessageIntoView = useCallback((): void => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollMessageHistoryToBottom();
        setShowNewMessagesButton(false);
      });
    });
  }, [scrollMessageHistoryToBottom]);

  const handleOutgoingAttachmentSettled = useCallback(
    (messageId: string): void => {
      const pendingScroll = outgoingAttachmentScrollRef.current;

      if (
        !pendingScroll ||
        pendingScroll.completed ||
        pendingScroll.messageId !== messageId
      ) {
        return;
      }

      pendingScroll.settledCount += 1;

      if (pendingScroll.settledCount < pendingScroll.expectedCount) {
        return;
      }

      pendingScroll.completed = true;
      outgoingAttachmentScrollRef.current = null;
      scrollOutgoingAttachmentMessageIntoView();
    },
    [scrollOutgoingAttachmentMessageIntoView]
  );

  const clearPendingAttachments = useCallback((): void => {
    setPendingAttachments((currentAttachments) => {
      for (const attachment of currentAttachments) {
        URL.revokeObjectURL(attachment.previewUrl);
        pendingAttachmentPreviewUrlsRef.current.delete(attachment.previewUrl);
      }

      return [];
    });
    setUploadedPendingAttachments(null);

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  }, []);

  const removePendingAttachment = useCallback((attachmentId: string): void => {
    setPendingAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId
      );

      if (removedAttachment) {
        URL.revokeObjectURL(removedAttachment.previewUrl);
        pendingAttachmentPreviewUrlsRef.current.delete(
          removedAttachment.previewUrl
        );
      }

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId
      );
    });
    setUploadedPendingAttachments(null);
    pendingDeliveryRef.current = null;

    if (sendStatusRef.current === 'delivery-uncertain') {
      updateSendStatus('idle');
    }
  }, [updateSendStatus]);

  function handleAttachmentFilesChange(
    event: ChangeEvent<HTMLInputElement>
  ): void {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
      return;
    }

    setError('');
    setUploadedPendingAttachments(null);
    pendingDeliveryRef.current = null;

    setPendingAttachments((currentAttachments) => {
      const remainingSlots = MAX_MESSAGE_ATTACHMENTS - currentAttachments.length;

      if (remainingSlots <= 0 || selectedFiles.length > remainingSlots) {
        setError(content.messageAttachmentMaximumMessage);
        return currentAttachments;
      }

      const nextAttachments: PendingAttachment[] = [];

      for (const file of selectedFiles) {
        if (
          !MESSAGE_ATTACHMENT_ACCEPT.split(',').includes(file.type) ||
          file.size > MAX_MESSAGE_ATTACHMENT_BYTES
        ) {
          for (const attachment of nextAttachments) {
            URL.revokeObjectURL(attachment.previewUrl);
            pendingAttachmentPreviewUrlsRef.current.delete(
              attachment.previewUrl
            );
          }

          setError(
            file.size > MAX_MESSAGE_ATTACHMENT_BYTES
              ? content.messageAttachmentTooLargeMessage
              : content.messageAttachmentUnsupportedTypeMessage
          );
          return currentAttachments;
        }

        const previewUrl = URL.createObjectURL(file);
        pendingAttachmentPreviewUrlsRef.current.add(previewUrl);
        nextAttachments.push({
          id: createClientAttemptId(),
          file,
          previewUrl,
        });
      }

      return [...currentAttachments, ...nextAttachments];
    });

    event.target.value = '';
  }

  const reconcileThread = useCallback(async (): Promise<void> => {
    const result = await getConversationThreadSnapshotAction(conversation.id);

    if (!mountedRef.current || !result.ok) {
      return;
    }

    const sortedMessages = [...result.messages].sort(compareMessagesByCreatedAt);

    setMessages(sortedMessages);
    setAttachmentsByMessageId(getAttachmentsByMessageId(result.attachments));
    setReadMarkers(result.readMarkers);

    const followTarget = followNewestTargetRef.current;

    if (
      followTarget &&
      sortedMessages.some((message) => message.id === followTarget.messageId)
    ) {
      followTarget.snapshotResolved = true;
      followTarget.attachmentCount = result.attachments.filter(
        (attachment) => attachment.messageId === followTarget.messageId
      ).length;
      followTarget.settledAttachmentCount = 0;
      shouldScrollToBottomRef.current = true;
    }

    const pendingDelivery = pendingDeliveryRef.current;

    if (
      pendingDelivery &&
      sortedMessages.some((message) =>
        isDeliveryMatch(message, pendingDelivery, currentUserId)
      )
    ) {
      pendingDeliveryRef.current = null;
      updateSendStatus('idle');
      setError('');
      setBody((currentBody) =>
        currentBody.trim() === pendingDelivery.body ? '' : currentBody
      );
      clearPendingAttachments();
      shouldScrollToBottomRef.current = true;
    }

    void refreshMessagingState();
  }, [
    clearPendingAttachments,
    conversation.id,
    currentUserId,
    refreshMessagingState,
    updateSendStatus,
  ]);

  const hydrateRealtimeMessageSnapshot = useCallback(
    async (
      messageId: string,
      reason: string,
      hydrationRetryAttemptIndex = 0
    ): Promise<void> => {
      clearMessageHydrationRetry(messageId);

      if (hydratingMessageIdsRef.current.has(messageId)) {
        hydrateAgainMessageIdsRef.current.add(messageId);
        return;
      }

      hydratingMessageIdsRef.current.add(messageId);

      try {
        let shouldHydrateAgain = true;

        while (shouldHydrateAgain) {
          hydrateAgainMessageIdsRef.current.delete(messageId);

          const result = await getConversationMessageSnapshotAction(
            conversation.id,
            messageId
          );

          if (!mountedRef.current) {
            return;
          }

          if (!result.ok) {
            logThreadRealtimeDiagnostic(
              conversation.id,
              'Message snapshot hydration failed.',
              {
                messageId,
                reason,
                failureReason: result.reason,
              }
            );
            return;
          }

          setMessages((currentMessages) =>
            upsertMessage(currentMessages, result.message)
          );
          setAttachmentsByMessageId((currentAttachments) => ({
            ...currentAttachments,
            [result.message.id]: result.attachments,
          }));

          if (
            shouldRetryMessageSnapshotHydration({
              reason,
              attachmentCount: result.attachments.length,
              retryAttemptIndex: hydrationRetryAttemptIndex,
            })
          ) {
            const retryDelayMs = getMessageSnapshotHydrationRetryDelayMs(
              hydrationRetryAttemptIndex
            );

            if (retryDelayMs !== null) {
              const retryTimeout = window.setTimeout(() => {
                hydrationRetryTimeoutsRef.current.delete(messageId);

                if (!mountedRef.current) {
                  return;
                }

                void hydrateRealtimeMessageSnapshot(
                  messageId,
                  reason,
                  hydrationRetryAttemptIndex + 1
                );
              }, retryDelayMs);

              hydrationRetryTimeoutsRef.current.set(messageId, retryTimeout);
              logThreadRealtimeDiagnostic(
                conversation.id,
                'Scheduled bounded message snapshot hydration retry.',
                {
                  messageId,
                  reason,
                  hydrationRetryAttemptIndex,
                  retryDelayMs,
                }
              );
            }
          }

          const followTarget = followNewestTargetRef.current;

          if (followTarget?.messageId === result.message.id) {
            followTarget.snapshotResolved = true;
            followTarget.attachmentCount = result.attachments.length;
            followTarget.settledAttachmentCount = 0;
            shouldScrollToBottomRef.current = true;
          }

          const pendingDelivery = pendingDeliveryRef.current;

          if (
            pendingDelivery &&
            isDeliveryMatch(result.message, pendingDelivery, currentUserId)
          ) {
            pendingDeliveryRef.current = null;
            updateSendStatus('idle');
            setError('');
            setBody((currentBody) =>
              currentBody.trim() === pendingDelivery.body ? '' : currentBody
            );
            clearPendingAttachments();
            shouldScrollToBottomRef.current = true;
          }

          shouldHydrateAgain = hydrateAgainMessageIdsRef.current.has(messageId);
        }
      } finally {
        hydratingMessageIdsRef.current.delete(messageId);
        hydrateAgainMessageIdsRef.current.delete(messageId);
      }
    },
    [
      clearPendingAttachments,
      clearMessageHydrationRetry,
      conversation.id,
      currentUserId,
      updateSendStatus,
    ]
  );

  const markThreadRead = useCallback(async (readBoundaryMessageId: string): Promise<void> => {
    if (
      markReadInFlightRef.current ||
      lastRequestedReadBoundaryRef.current === readBoundaryMessageId ||
      !canMarkConversationReadNow()
    ) {
      return;
    }

    markReadInFlightRef.current = true;
    lastRequestedReadBoundaryRef.current = readBoundaryMessageId;
    const result = await markConversationReadAction(conversation.id);

    if (!mountedRef.current) {
      markReadInFlightRef.current = false;
      return;
    }

    markReadInFlightRef.current = false;

    if (!result.ok) {
      lastRequestedReadBoundaryRef.current = null;
      setReadStatusError(content.unableUpdateMessageStatusMessage);
      return;
    }

    setReadStatusError('');
    setReadMarkers((currentMarkers) =>
      mergeReadMarker(currentMarkers, {
        conversationId: conversation.id,
        userId: currentUserId,
        lastReadAt: new Date().toISOString(),
      })
    );
    void refreshMessagingState();
  }, [conversation.id, currentUserId, refreshMessagingState]);

  const markVisibleUnreadBoundaryRead = useCallback((): void => {
    const sentinelIsVisible =
      readSentinelVisibleRef.current ||
      isElementVisibleInHistory(
        messageHistoryRef.current,
        readSentinelRef.current
      );

    if (!newestUnreadIncomingMessage || !sentinelIsVisible) {
      return;
    }

    readSentinelVisibleRef.current = true;
    void markThreadRead(newestUnreadIncomingMessage.id);
  }, [markThreadRead, newestUnreadIncomingMessage]);

  const finishFollowNewestTarget = useCallback((): void => {
    followNewestTargetRef.current = null;
    shouldScrollToBottomRef.current = false;
  }, []);

  const finishInitialBottomPin = useCallback((reason: string): void => {
    const initialBottomPin = initialBottomPinRef.current;

    if (!initialBottomPin) {
      return;
    }

    if (initialBottomPin.settlingFrame !== null) {
      window.cancelAnimationFrame(initialBottomPin.settlingFrame);
    }

    initialBottomPinRef.current = null;
    logThreadScrollDiagnostic(conversation.id, 'Finished initial bottom pin.', {
      reason,
      ...getHistoryScrollDiagnosticMetrics(messageHistoryRef.current),
    });
  }, [conversation.id]);

  const scheduleInitialBottomPinSettled = useCallback((reason: string): void => {
    const initialBottomPin = initialBottomPinRef.current;

    if (!initialBottomPin) {
      return;
    }

    if (initialBottomPin.settlingFrame !== null) {
      window.cancelAnimationFrame(initialBottomPin.settlingFrame);
    }

    initialBottomPin.settlingFrame = window.requestAnimationFrame(() => {
      const currentPin = initialBottomPinRef.current;

      if (!currentPin) {
        return;
      }

      currentPin.settlingFrame = window.requestAnimationFrame(() => {
        scrollMessageHistoryToBottom();
        finishInitialBottomPin(reason);
      });
    });
  }, [finishInitialBottomPin, scrollMessageHistoryToBottom]);

  const handleInitialAttachmentSettled = useCallback(
    (attachmentId: string): void => {
      const initialBottomPin = initialBottomPinRef.current;

      if (
        !initialBottomPin ||
        initialBottomPin.conversationId !== conversation.id ||
        !initialBottomPin.pendingAttachmentIds.has(attachmentId)
      ) {
        return;
      }

      initialBottomPin.pendingAttachmentIds.delete(attachmentId);
      shouldScrollToBottomRef.current = true;
      scrollMessageHistoryToBottom();
      logThreadScrollDiagnostic(
        conversation.id,
        'Initial attachment image settled.',
        {
          attachmentId,
          remainingInitialAttachmentCount:
            initialBottomPin.pendingAttachmentIds.size,
          ...getHistoryScrollDiagnosticMetrics(messageHistoryRef.current),
        }
      );

      if (initialBottomPin.pendingAttachmentIds.size === 0) {
        scheduleInitialBottomPinSettled('initial-attachments-settled');
      }
    },
    [conversation.id, scheduleInitialBottomPinSettled, scrollMessageHistoryToBottom]
  );

  const alignFollowNewestTarget = useCallback((): void => {
    if (!followNewestTargetRef.current) {
      return;
    }

    shouldScrollToBottomRef.current = true;
    scrollMessageHistoryToBottom();
    setShowNewMessagesButton(false);
    markVisibleUnreadBoundaryRead();
  }, [markVisibleUnreadBoundaryRead, scrollMessageHistoryToBottom]);

  const handleIncomingAttachmentSettled = useCallback(
    (messageId: string): void => {
      const followTarget = followNewestTargetRef.current;

      if (!followTarget || followTarget.messageId !== messageId) {
        return;
      }

      if (!followTarget.attachmentCount || followTarget.attachmentCount <= 0) {
        finishFollowNewestTarget();
        return;
      }

      followTarget.settledAttachmentCount += 1;

      if (followTarget.settledAttachmentCount < followTarget.attachmentCount) {
        return;
      }

      alignFollowNewestTarget();
      finishFollowNewestTarget();
    },
    [alignFollowNewestTarget, finishFollowNewestTarget]
  );

  const handleMessageHistoryScroll = useCallback((): void => {
    const historyElement = messageHistoryRef.current;
    const previousScrollTop = lastHistoryScrollTopRef.current;
    const currentScrollTop = historyElement?.scrollTop || 0;
    const userMovedUp = currentScrollTop < previousScrollTop - 2;
    const isNearBottom = isNearHistoryBottom(historyElement);

    lastHistoryScrollTopRef.current = currentScrollTop;

    if (!programmaticHistoryScrollRef.current) {
      isStickyToBottomRef.current = isNearBottom;
    }

    if (
      initialBottomPinRef.current &&
      !programmaticHistoryScrollRef.current &&
      userMovedUp &&
      !isNearBottom
    ) {
      finishInitialBottomPin('manual-scroll-up');
    }

    if (
      followNewestTargetRef.current &&
      !programmaticHistoryScrollRef.current &&
      userMovedUp &&
      !isNearBottom
    ) {
      finishFollowNewestTarget();
      setShowNewMessagesButton(true);
      return;
    }

    if (!isNearBottom) {
      return;
    }

    setShowNewMessagesButton(false);
    markVisibleUnreadBoundaryRead();
  }, [
    finishFollowNewestTarget,
    finishInitialBottomPin,
    markVisibleUnreadBoundaryRead,
  ]);

  useLayoutEffect(() => {
    const contentElement = messageListContentRef.current;
    const historyElement = messageHistoryRef.current;

    if (!contentElement || !historyElement) {
      return undefined;
    }

    let alignmentFrame: number | null = null;

    function alignIfSticky(): void {
      if (
        !isStickyToBottomRef.current &&
        !shouldScrollToBottomRef.current &&
        !initialBottomPinRef.current &&
        !followNewestTargetRef.current
      ) {
        return;
      }

      if (alignmentFrame !== null) {
        window.cancelAnimationFrame(alignmentFrame);
      }

      alignmentFrame = window.requestAnimationFrame(() => {
        logThreadScrollDiagnostic(conversation.id, 'Resize/layout bottom alignment.', {
          hasInitialBottomPin: Boolean(initialBottomPinRef.current),
          shouldScrollToBottom: shouldScrollToBottomRef.current,
          isStickyToBottom: isStickyToBottomRef.current,
          hasFollowNewestTarget: Boolean(followNewestTargetRef.current),
          ...getHistoryScrollDiagnosticMetrics(historyElement),
        });
        scrollMessageHistoryToBottom();
        setShowNewMessagesButton(false);
        markVisibleUnreadBoundaryRead();
        alignmentFrame = null;
      });
    }

    const resizeObserver = new ResizeObserver(alignIfSticky);
    resizeObserver.observe(contentElement);
    resizeObserver.observe(historyElement);

    alignIfSticky();

    return () => {
      resizeObserver.disconnect();

      if (alignmentFrame !== null) {
        window.cancelAnimationFrame(alignmentFrame);
      }
    };
  }, [
    conversation.id,
    markVisibleUnreadBoundaryRead,
    scrollMessageHistoryToBottom,
  ]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setIsBrowserOnline(navigator.onLine);
      }
    });

    function handleOffline(): void {
      setIsBrowserOnline(false);

      if (hasSubscribedRef.current) {
        setThreadStatus('reconnecting');
      }

      if (sendStatusRef.current === 'sending') {
        sendAttemptRef.current += 1;
        updateSendStatus('delivery-uncertain');
        setError(content.messageDeliveryUnconfirmedMessage);
      }
    }

    function handleOnline(): void {
      setIsBrowserOnline(true);

      if (hasSubscribedRef.current) {
        threadStatusVersionRef.current += 1;
        setThreadStatus('reconnecting');
        setThreadReconnectGeneration((generation) => generation + 1);
      }

      void reconcileThread();
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      active = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [reconcileThread, updateSendStatus]);

  useEffect(() => {
    readSentinelVisibleRef.current = false;

    if (!newestUnreadIncomingMessage) {
      lastRequestedReadBoundaryRef.current = null;
      return undefined;
    }

    const historyElement = messageHistoryRef.current;
    const sentinelElement = readSentinelRef.current;

    if (!historyElement || !sentinelElement) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        readSentinelVisibleRef.current = Boolean(entry?.isIntersecting);

        if (readSentinelVisibleRef.current) {
          markVisibleUnreadBoundaryRead();
        }
      },
      {
        root: historyElement,
        threshold: 1,
      }
    );

    observer.observe(sentinelElement);

    return () => {
      observer.disconnect();
    };
  }, [markVisibleUnreadBoundaryRead, newestUnreadIncomingMessage]);

  useEffect(() => {
    function handleReadableWindowChange(): void {
      if (canMarkConversationReadNow()) {
        markVisibleUnreadBoundaryRead();
      }
    }

    document.addEventListener('visibilitychange', handleReadableWindowChange);
    window.addEventListener('focus', handleReadableWindowChange);
    window.addEventListener('blur', handleReadableWindowChange);

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleReadableWindowChange
      );
      window.removeEventListener('focus', handleReadableWindowChange);
      window.removeEventListener('blur', handleReadableWindowChange);
    };
  }, [markVisibleUnreadBoundaryRead]);

  useEffect(() => {
    clearThreadRealtimeRetry();
    const channelBaseName = `messaging-thread:${conversation.id}`;

    if (!canSubscribeToThreadRealtime) {
      let active = true;

      hasSubscribedRef.current = false;
      activeThreadChannelGenerationRef.current += 1;

      queueMicrotask(() => {
        if (!active) {
          return;
        }

        if (authStatus === 'checking') {
          setThreadStatus('idle');
        } else if (!isBrowserOnline) {
          setThreadStatus('reconnecting');
        } else {
          setThreadStatus('unavailable');
          logThreadRealtimeDiagnostic(
            conversation.id,
            'Thread realtime not started because client auth is unavailable or belongs to a different user.',
            {
              authStatus,
              hasAuthUser: Boolean(authUser?.id),
              authProviderUserId: authUser?.id || null,
              currentUserId,
              ...getThreadRealtimeDiagnostics(
                supabase,
                channelBaseName,
                channelBaseName
              ),
            }
          );
        }
      });

      return () => {
        active = false;
      };
    }

    let active = true;
    const channelGeneration = activeThreadChannelGenerationRef.current + 1;
    activeThreadChannelGenerationRef.current = channelGeneration;
    const channelName = getRealtimeChannelName(
      channelBaseName,
      channelGeneration
    );
    let channel: RealtimeChannel | null = null;

    function scheduleThreadRealtimeRetry(reason: string): void {
      const retryDelayMs = getThreadRealtimeRetryDelayMs(
        threadRealtimeRetryAttemptRef.current
      );

      threadRealtimeRetryAttemptRef.current += 1;
      clearThreadRealtimeRetry();
      logThreadRealtimeDiagnostic(conversation.id, 'Scheduling retry.', {
        reason,
        retryDelayMs,
        retryAttempt: threadRealtimeRetryAttemptRef.current,
        generation: channelGeneration,
        ...getThreadRealtimeDiagnostics(supabase, channelName, channelBaseName),
      });

      threadRealtimeRetryTimeoutRef.current = window.setTimeout(() => {
        threadRealtimeRetryTimeoutRef.current = null;

        if (
          !active ||
          activeThreadChannelGenerationRef.current !== channelGeneration
        ) {
          return;
        }

        setThreadStatus('reconnecting');
        setThreadReconnectGeneration((generation) => generation + 1);
      }, retryDelayMs);
    }

    async function removeLegacyThreadChannels(): Promise<void> {
      const topic = toSupabaseRealtimeTopic(channelBaseName);
      const existingChannels = supabase
        .getChannels()
        .filter((existingChannel) => existingChannel.topic === topic);

      if (existingChannels.length === 0) {
        return;
      }

      logThreadRealtimeDiagnostic(
        conversation.id,
        'Removing legacy stable-topic channel before subscribe.',
        {
          generation: channelGeneration,
          existingChannelCount: existingChannels.length,
          ...getThreadRealtimeDiagnostics(
            supabase,
            channelName,
            channelBaseName
          ),
        }
      );

      const removeResults = await Promise.all(
        existingChannels.map((existingChannel) =>
          supabase.removeChannel(existingChannel)
        )
      );

      logThreadRealtimeDiagnostic(
        conversation.id,
        'Removed legacy stable-topic channel before subscribe.',
        {
          generation: channelGeneration,
          removeResults,
          ...getThreadRealtimeDiagnostics(
            supabase,
            channelName,
            channelBaseName
          ),
        }
      );
    }

    function handleIncomingMessage(
      payload: RealtimePostgresInsertPayload<DatabaseMessageRow>
    ) {
      if (
        !active ||
        activeThreadChannelGenerationRef.current !== channelGeneration ||
        !isDatabaseMessageRow(payload.new)
      ) {
        return;
      }

      const nextMessage = databaseMessageRowToApp(payload.new);
      const shouldAutoScroll = shouldAutoScrollForThreadMessage({
        senderId: nextMessage.senderId,
        currentUserId,
        wasNearBottom: isNearHistoryBottom(messageHistoryRef.current),
      });

      threadStatusVersionRef.current += 1;
      setThreadStatus('subscribed');
      shouldScrollToBottomRef.current = shouldAutoScroll;
      if (nextMessage.senderId !== currentUserId && shouldAutoScroll) {
        followNewestTargetRef.current = {
          messageId: nextMessage.id,
          attachmentCount: null,
          settledAttachmentCount: 0,
          snapshotResolved: false,
        };
      }
      setShowNewMessagesButton(
        nextMessage.senderId !== currentUserId && !shouldAutoScroll
      );
      setMessages((currentMessages) =>
        mergeMessage(currentMessages, nextMessage)
      );
      if (
        shouldHydrateRealtimeMessageSnapshot({
          eventTable: 'messages',
          rawEventIncludesAttachments: false,
        })
      ) {
        void hydrateRealtimeMessageSnapshot(
          nextMessage.id,
          'message-insert'
        );
      }
      void refreshMessagingState();

      if (nextMessage.senderId !== currentUserId) {
        return;
      }

      const pendingDelivery = pendingDeliveryRef.current;

      if (
        pendingDelivery &&
        isDeliveryMatch(nextMessage, pendingDelivery, currentUserId)
      ) {
        pendingDeliveryRef.current = null;
        updateSendStatus('idle');
        setError('');
        setBody((currentBody) =>
          currentBody.trim() === pendingDelivery.body ? '' : currentBody
        );
      }
    }

    function handleMessageUpdate(
      payload: RealtimePostgresUpdatePayload<DatabaseMessageRow>
    ) {
      if (
        !active ||
        activeThreadChannelGenerationRef.current !== channelGeneration ||
        !isDatabaseMessageRow(payload.new)
      ) {
        return;
      }

      const nextMessage = databaseMessageRowToApp(payload.new);

      threadStatusVersionRef.current += 1;
      setThreadStatus('subscribed');
      setMessages((currentMessages) =>
        upsertMessage(currentMessages, nextMessage)
      );
      if (
        shouldHydrateRealtimeMessageSnapshot({
          eventTable: 'messages',
          rawEventIncludesAttachments: false,
        })
      ) {
        void hydrateRealtimeMessageSnapshot(
          nextMessage.id,
          'message-update'
        );
      }
      void refreshMessagingState();
    }

    function handleReadMarkerChange(
      payload:
        | RealtimePostgresInsertPayload<DatabaseConversationReadRow>
        | RealtimePostgresUpdatePayload<DatabaseConversationReadRow>
    ) {
      if (
        !active ||
        activeThreadChannelGenerationRef.current !== channelGeneration ||
        !isDatabaseConversationReadRow(payload.new)
      ) {
        return;
      }

      threadStatusVersionRef.current += 1;
      setThreadStatus('subscribed');
      setReadMarkers((currentMarkers) =>
        mergeReadMarker(
          currentMarkers,
          databaseConversationReadRowToApp(payload.new)
        )
      );
    }

    async function startThreadRealtimeSubscription(): Promise<void> {
      logThreadRealtimeDiagnostic(conversation.id, 'Starting subscription.', {
        generation: channelGeneration,
        retryAttempt: threadRealtimeRetryAttemptRef.current,
        authStatus,
        authProviderUserId: authUser?.id || null,
        currentUserId,
        ...getThreadRealtimeDiagnostics(supabase, channelName, channelBaseName),
      });

      try {
        await removeLegacyThreadChannels();

        if (
          !active ||
          activeThreadChannelGenerationRef.current !== channelGeneration
        ) {
          logThreadRealtimeDiagnostic(
            conversation.id,
            'Subscription start became stale before auth.',
            {
              generation: channelGeneration,
              latestGeneration: activeThreadChannelGenerationRef.current,
              ...getThreadRealtimeDiagnostics(
                supabase,
                channelName,
                channelBaseName
              ),
            }
          );
          return;
        }

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        const sessionUserId = sessionData.session?.user?.id || null;
        const hasSessionAccessToken = Boolean(sessionData.session?.access_token);

        logThreadRealtimeDiagnostic(
          conversation.id,
          'Resolved client session before realtime join.',
          {
            generation: channelGeneration,
            authStatus,
            authProviderUserId: authUser?.id || null,
            currentClientUserId: sessionUserId,
            currentUserId,
            hasSessionAccessToken,
            sessionError: sessionError?.message || null,
            ...getThreadRealtimeDiagnostics(
              supabase,
              channelName,
              channelBaseName
            ),
          }
        );

        if (
          sessionError ||
          !sessionData.session?.access_token ||
          sessionUserId !== currentUserId
        ) {
          setThreadStatus('unavailable');
          scheduleThreadRealtimeRetry('client-session-unavailable');
          return;
        }

        await supabase.realtime.setAuth(sessionData.session.access_token);

        if (
          !active ||
          activeThreadChannelGenerationRef.current !== channelGeneration
        ) {
          logThreadRealtimeDiagnostic(
            conversation.id,
            'Subscription start became stale after realtime auth.',
            {
              generation: channelGeneration,
              latestGeneration: activeThreadChannelGenerationRef.current,
              ...getThreadRealtimeDiagnostics(
                supabase,
                channelName,
                channelBaseName
              ),
            }
          );
          return;
        }

        logThreadRealtimeDiagnostic(
          conversation.id,
          'Applied realtime auth before channel join.',
          {
            generation: channelGeneration,
            ...getThreadRealtimeDiagnostics(
              supabase,
              channelName,
              channelBaseName
            ),
          }
        );

        const threadRealtimeSpecs =
          getThreadRealtimePostgresChangeSpecs(conversation.id);
        const conversationRealtimeFilter =
          threadRealtimeSpecs[0]?.filter ||
          `conversation_id=eq.${conversation.id}`;

        logThreadRealtimeDiagnostic(
          conversation.id,
          'Creating channel with scoped postgres change bindings.',
          {
            generation: channelGeneration,
            bindingCount: threadRealtimeSpecs.length,
            bindings: threadRealtimeSpecs.map((spec) => ({
              event: spec.event,
              schema: spec.schema,
              table: spec.table,
              filter: spec.filter,
            })),
            ...getThreadRealtimeDiagnostics(
              supabase,
              channelName,
              channelBaseName
            ),
          }
        );

        channel = supabase
          .channel(channelName)
          .on<DatabaseMessageRow>(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: conversationRealtimeFilter,
            },
            handleIncomingMessage
          )
          .on<DatabaseMessageRow>(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
              filter: conversationRealtimeFilter,
            },
            handleMessageUpdate
          )
          .on<DatabaseConversationReadRow>(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'conversation_reads',
              filter: conversationRealtimeFilter,
            },
            handleReadMarkerChange
          )
          .on<DatabaseConversationReadRow>(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'conversation_reads',
              filter: conversationRealtimeFilter,
            },
            handleReadMarkerChange
          );

        subscribeWithRealtimeDiagnostics(
          supabase,
          channel,
          {
            eventPrefix: 'messaging-thread',
            channelName,
            logicalChannelBaseName: channelBaseName,
            details: {
              owner: 'messaging-thread',
              conversationId: conversation.id,
              generation: channelGeneration,
              authStatus,
              authProviderUserId: authUser?.id || null,
              currentUserId,
            },
          },
          (nextStatus, error) => {
          if (
            !active ||
            activeThreadChannelGenerationRef.current !== channelGeneration
          ) {
            logThreadRealtimeDiagnostic(
              conversation.id,
              'Ignored stale subscription callback.',
              {
                generation: channelGeneration,
                latestGeneration: activeThreadChannelGenerationRef.current,
                status: nextStatus,
                ...serializeThreadRealtimeError(error),
                ...getThreadRealtimeDiagnostics(
                  supabase,
                  channelName,
                  channelBaseName
                ),
              }
            );
            return;
          }

          logThreadRealtimeDiagnostic(
            conversation.id,
            'Subscription callback status.',
            {
              generation: channelGeneration,
              status: nextStatus,
              authStatus,
              authProviderUserId: authUser?.id || null,
              currentUserId,
              ...serializeThreadRealtimeError(error),
              ...getThreadRealtimeDiagnostics(
                supabase,
                channelName,
                channelBaseName
              ),
            }
          );

          if (nextStatus === 'SUBSCRIBED') {
            threadStatusVersionRef.current += 1;
            hasSubscribedRef.current = true;
            threadRealtimeRetryAttemptRef.current = 0;
            clearThreadRealtimeRetry();
            setThreadStatus('subscribed');
            logThreadRealtimeDiagnostic(conversation.id, 'Subscribed.');
            return;
          }

          if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
            const statusVersion = threadStatusVersionRef.current + 1;
            threadStatusVersionRef.current = statusVersion;
            logThreadRealtimeDiagnostic(
              conversation.id,
              'Subscription reported a failure status.',
              {
                status: nextStatus,
                hadSubscribed: hasSubscribedRef.current,
                authStatus,
                ...serializeThreadRealtimeError(error),
                ...getThreadRealtimeDiagnostics(
                  supabase,
                  channelName,
                  channelBaseName
                ),
              }
            );

            queueMicrotask(() => {
              if (
                active &&
                activeThreadChannelGenerationRef.current ===
                  channelGeneration &&
                threadStatusVersionRef.current === statusVersion
              ) {
                setThreadStatus('unavailable');
                scheduleThreadRealtimeRetry(nextStatus);
              }
            });
            return;
          }

          if (nextStatus === 'CLOSED') {
            const statusVersion = threadStatusVersionRef.current + 1;
            threadStatusVersionRef.current = statusVersion;
            logThreadRealtimeDiagnostic(
              conversation.id,
              'Subscription closed.',
              {
                hadSubscribed: hasSubscribedRef.current,
                authStatus,
                ...serializeThreadRealtimeError(error),
                ...getThreadRealtimeDiagnostics(
                  supabase,
                  channelName,
                  channelBaseName
                ),
              }
            );

            queueMicrotask(() => {
              if (
                active &&
                activeThreadChannelGenerationRef.current ===
                  channelGeneration &&
                threadStatusVersionRef.current === statusVersion
              ) {
                setThreadStatus(
                  hasSubscribedRef.current ? 'reconnecting' : 'unavailable'
                );
                scheduleThreadRealtimeRetry(nextStatus);
              }
            });
          }
        });
      } catch (error) {
        if (
          !active ||
          activeThreadChannelGenerationRef.current !== channelGeneration
        ) {
          return;
        }

        setThreadStatus('unavailable');
        logThreadRealtimeDiagnostic(
          conversation.id,
          'Subscription start failed.',
          {
            generation: channelGeneration,
            error:
              error instanceof Error
                ? serializeThreadRealtimeError(error)
                : { errorMessage: String(error) },
            ...getThreadRealtimeDiagnostics(
              supabase,
              channelName,
              channelBaseName
            ),
          }
        );
        scheduleThreadRealtimeRetry('subscription-start-failed');
      }
    }

    void startThreadRealtimeSubscription();

    return () => {
      active = false;
      if (activeThreadChannelGenerationRef.current === channelGeneration) {
        activeThreadChannelGenerationRef.current += 1;
      }
      hasSubscribedRef.current = false;
      clearThreadRealtimeRetry();
      if (channel) {
        const channelToRemove = channel;

        void supabase
          .removeChannel(channelToRemove)
          .then((removeResult) => {
            logThreadRealtimeDiagnostic(
              conversation.id,
              'Removed active channel during cleanup.',
              {
                generation: channelGeneration,
                removeResult,
                ...getThreadRealtimeDiagnostics(
                  supabase,
                  channelName,
                  channelBaseName
                ),
              }
            );
          })
          .catch((error: unknown) => {
            logThreadRealtimeDiagnostic(
              conversation.id,
              'Failed to remove active channel during cleanup.',
              {
                generation: channelGeneration,
                error:
                  error instanceof Error
                    ? serializeThreadRealtimeError(error)
                    : { errorMessage: String(error) },
                ...getThreadRealtimeDiagnostics(
                  supabase,
                  channelName,
                  channelBaseName
                ),
              }
            );
          });
      }
    };
  }, [
    authStatus,
    authUser?.id,
    canSubscribeToThreadRealtime,
    clearThreadRealtimeRetry,
    conversation.id,
    currentUserId,
    hydrateRealtimeMessageSnapshot,
    isBrowserOnline,
    markThreadRead,
    reconcileThread,
    refreshMessagingState,
    supabase,
    threadReconnectGeneration,
    updateSendStatus,
  ]);

  useLayoutEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      return;
    }

    let cancelled = false;

    function alignThreadBottom(): void {
      logThreadScrollDiagnostic(conversation.id, 'Aligning thread bottom.', {
        hasInitialBottomPin: Boolean(initialBottomPinRef.current),
        shouldScrollToBottom: shouldScrollToBottomRef.current,
        hasFollowNewestTarget: Boolean(followNewestTargetRef.current),
        before: getHistoryScrollDiagnosticMetrics(messageHistoryRef.current),
      });
      scrollMessageHistoryToBottom();
      setShowNewMessagesButton(false);
      markVisibleUnreadBoundaryRead();
      logThreadScrollDiagnostic(conversation.id, 'Aligned thread bottom.', {
        hasInitialBottomPin: Boolean(initialBottomPinRef.current),
        after: getHistoryScrollDiagnosticMetrics(messageHistoryRef.current),
      });

      const followTarget = followNewestTargetRef.current;

      if (
        followTarget &&
        followTarget.snapshotResolved &&
        followTarget.attachmentCount === 0
      ) {
        finishFollowNewestTarget();
      } else if (!followTarget) {
        shouldScrollToBottomRef.current = false;
      }
    }

    alignThreadBottom();

    const animationFrame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      alignThreadBottom();
      if (!initialThreadRevealRef.current) {
        initialThreadRevealRef.current = true;

        window.requestAnimationFrame(() => {
          messageFormRef.current?.scrollIntoView({
            block: 'nearest',
            behavior: 'auto',
          });
        });
      }

      const initialBottomPin = initialBottomPinRef.current;

      if (initialBottomPin?.pendingAttachmentIds.size === 0) {
        scheduleInitialBottomPinSettled('initial-layout-settled');
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    attachmentsByMessageId,
    conversation.id,
    finishFollowNewestTarget,
    markVisibleUnreadBoundaryRead,
    scheduleInitialBottomPinSettled,
    messages.length,
    scrollMessageHistoryToBottom,
  ]);

  useEffect(() => {
    const followTarget = followNewestTargetRef.current;

    if (!followTarget) {
      return;
    }

    const targetAttachments = attachmentsByMessageId[followTarget.messageId] || [];

    followTarget.attachmentCount =
      followTarget.snapshotResolved || targetAttachments.length > 0
        ? targetAttachments.length
        : followTarget.attachmentCount;
    followTarget.settledAttachmentCount = 0;
    shouldScrollToBottomRef.current = true;

    const alignmentFrame = window.requestAnimationFrame(() => {
      alignFollowNewestTarget();

      if (followTarget.snapshotResolved && targetAttachments.length === 0) {
        finishFollowNewestTarget();
      }
    });

    return () => {
      window.cancelAnimationFrame(alignmentFrame);
    };
  }, [
    alignFollowNewestTarget,
    attachmentsByMessageId,
    finishFollowNewestTarget,
    messages.length,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sendStatus === 'sending') {
      return;
    }

    const safeBody = body.trim();

    if (!safeBody && pendingAttachments.length === 0) {
      setError(content.messageEmptyMessage);
      return;
    }

    if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
      setError(content.messageTooLongMessage);
      return;
    }

    if (!isBrowserOnline) {
      updateSendStatus('failed');
      setError(content.offlineBeforeSendMessage);
      return;
    }

    const existingPendingDelivery = pendingDeliveryRef.current;
    const existingUploadedAttachments = uploadedPendingAttachments || [];
    const canRetryUploadedAttachments =
      existingPendingDelivery &&
      sendStatus === 'delivery-uncertain' &&
      existingPendingDelivery.body === safeBody &&
      existingUploadedAttachments.length > 0 &&
      existingPendingDelivery.attachmentSignature ===
        getAttachmentSignature(existingUploadedAttachments);
    const clientAttemptId =
      existingPendingDelivery &&
      existingPendingDelivery.body === safeBody &&
      sendStatus === 'delivery-uncertain'
        ? existingPendingDelivery.clientAttemptId
        : createClientAttemptId();
    let uploadedAttachments = canRetryUploadedAttachments
      ? existingUploadedAttachments
      : [];
    const attemptId = sendAttemptRef.current + 1;

    sendAttemptRef.current = attemptId;
    updateSendStatus('sending');
    setError('');

    let handledAttempt = false;

    try {
      if (pendingAttachments.length > 0 && uploadedAttachments.length === 0) {
        const uploadResult = await prepareMessageAttachmentMetadata({
          conversationId: conversation.id,
          clientAttemptId,
          files: pendingAttachments.map((attachment) => attachment.file),
        });

        if (!mountedRef.current || sendAttemptRef.current !== attemptId) {
          return;
        }

        if (!uploadResult.ok) {
          handledAttempt = true;
          updateSendStatus('failed');
          setError(content.messageAttachmentUploadFailedMessage);
          return;
        }

        uploadedAttachments = uploadResult.attachments;
        setUploadedPendingAttachments(uploadedAttachments);
      }

      const pendingDelivery: PendingDelivery = {
        body: safeBody,
        clientAttemptId,
        attachmentSignature: getAttachmentSignature(uploadedAttachments),
        uploadedAttachments,
      };

      pendingDeliveryRef.current = pendingDelivery;

      const result = await withTimeout(
        sendMessageAction({
          conversationId: conversation.id,
          body: safeBody,
          clientAttemptId,
          attachments: uploadedAttachments,
        }),
        SEND_CONFIRMATION_TIMEOUT_MS
      );

      if (!mountedRef.current || sendAttemptRef.current !== attemptId) {
        return;
      }

      if (!result.ok) {
        if (uploadedAttachments.length > 0) {
          await cleanupUploadedMessageAttachments(
            uploadedAttachments.map((attachment) => attachment.storagePath)
          );
          setUploadedPendingAttachments(null);
        }

        pendingDeliveryRef.current = null;
        handledAttempt = true;
        updateSendStatus('failed');
        setError(getSendErrorMessage(result.reason));
        return;
      }

      pendingDeliveryRef.current = null;
      handledAttempt = true;
      setMessages((currentMessages) =>
        mergeMessage(currentMessages, result.message)
      );
      if (result.attachments && result.attachments.length > 0) {
        outgoingAttachmentScrollRef.current = {
          messageId: result.message.id,
          expectedCount: result.attachments.length,
          settledCount: 0,
          completed: false,
        };
        setAttachmentsByMessageId((currentAttachments) => ({
          ...currentAttachments,
          [result.message.id]: result.attachments || [],
        }));
        scrollOutgoingAttachmentMessageIntoView();
      }
      shouldScrollToBottomRef.current = true;
      setBody('');
      clearPendingAttachments();
      setError('');
      updateSendStatus('idle');
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
      void refreshMessagingState();
    } catch {
      if (!mountedRef.current || sendAttemptRef.current !== attemptId) {
        return;
      }

      handledAttempt = true;
      updateSendStatus('delivery-uncertain');
      setError(content.messageDeliveryUnconfirmedMessage);

      if (isBrowserOnline) {
        void reconcileThread();
      }
    } finally {
      if (
        mountedRef.current &&
        sendAttemptRef.current === attemptId &&
        !handledAttempt
      ) {
        updateSendStatus('idle');
      }
    }
  }

  function startEditingMessage(message: AppMessage): void {
    setEditingMessageId(message.id);
    setEditBody(message.body);
    setMessageMenuOverlay(null);
    setConfirmationDialog(null);
    setMessageActionError('');
  }

  function openMessageActions(
    messageId: string,
    triggerElement: HTMLButtonElement
  ): void {
    setConfirmationDialog(null);
    setMessageActionError('');
    setMessageMenuOverlay((currentOverlay) => {
      if (currentOverlay?.messageId === messageId) {
        return null;
      }

      return {
        messageId,
        ...getMenuOverlayPosition(triggerElement),
      };
    });
  }

  function openMessageDeleteConfirmation(messageId: string): void {
    setMessageMenuOverlay(null);
    setEditingMessageId(null);
    setEditBody('');
    setMessageActionError('');
    setConfirmationDialog({
      kind: 'message',
      messageId,
    });
  }

  function openConversationDeleteConfirmation(): void {
    setMessageMenuOverlay(null);
    setDeleteConversationError('');
    setConfirmationDialog({
      kind: 'conversation',
    });
  }

  async function handleEditMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingMessageId || editingSubmittingMessageId) {
      return;
    }

    const safeBody = editBody.trim();

    const editingMessageAttachments =
      attachmentsByMessageId[editingMessageId] || [];

    if (!safeBody && editingMessageAttachments.length === 0) {
      setMessageActionError(content.messageEmptyMessage);
      return;
    }

    if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
      setMessageActionError(content.messageTooLongMessage);
      return;
    }

    setEditingSubmittingMessageId(editingMessageId);
    setMessageActionError('');

    const result = await editMessageAction({
      conversationId: conversation.id,
      messageId: editingMessageId,
      body: safeBody,
    });

    if (!mountedRef.current) {
      return;
    }

    setEditingSubmittingMessageId(null);

    if (!result.ok) {
      setMessageActionError(
        result.reason === 'empty-message'
          ? content.messageEmptyMessage
          : result.reason === 'message-too-long'
            ? content.messageTooLongMessage
            : content.unableEditMessageMessage
      );
      return;
    }

    setMessages((currentMessages) =>
      upsertMessage(currentMessages, result.message)
    );
    setEditingMessageId(null);
    setEditBody('');
    setMessageActionError('');
    void refreshMessagingState();
  }

  async function handleDeleteMessage(messageId: string): Promise<void> {
    if (deletingMessageId) {
      return;
    }

    setDeletingMessageId(messageId);
    setMessageActionError('');

    const result = await deleteMessageAction({
      conversationId: conversation.id,
      messageId,
    });

    if (!mountedRef.current) {
      return;
    }

    setDeletingMessageId(null);

    if (!result.ok) {
      setConfirmationDialog(null);
      setMessageActionError(content.unableDeleteMessageMessage);
      return;
    }

    setMessages((currentMessages) =>
      upsertMessage(currentMessages, result.message)
    );
    closeConfirmationDialog();
    setMessageActionError('');
    void refreshMessagingState();
  }

  async function handleDeleteConversation(): Promise<void> {
    if (isDeletingConversation) {
      return;
    }

    setIsDeletingConversation(true);
    setDeleteConversationError('');

    const result = await hideConversationAction(conversation.id);

    if (!mountedRef.current) {
      return;
    }

    setIsDeletingConversation(false);

    if (!result.ok) {
      setDeleteConversationError(content.unableDeleteConversationMessage);
      return;
    }

    void refreshMessagingState();
    router.push('/account/messages');
  }

  return (
    <div className="conversation-thread">
      <div className="conversation-thread-heading">
        <div className="conversation-thread-title-block">
          <p className="hero-kicker">{content.messagesTitle}</p>
          <h1>{conversation.listingTitle}</h1>
          <Link
            href={`/seller/${counterpart.publicSlug}`}
            className="conversation-counterpart-link"
          >
            <ProfileAvatar
              avatarPath={counterpart.avatarPath}
              displayName={counterpart.displayName}
              size="small"
              focusX={counterpart.avatarFocusX}
              focusY={counterpart.avatarFocusY}
              zoom={counterpart.avatarZoom}
            />
            <span className="conversation-counterpart-text">
              <span className="conversation-counterpart-name">
                {otherParticipantName}
              </span>
              <span className="conversation-view-profile-label">
                {content.viewPublicProfileLabel}
              </span>
            </span>
          </Link>
        </div>
        <div className="conversation-heading-actions">
          {conversation.listingId ? (
            <Link href={`/listing/${conversation.listingId}`} className="secondary-button">
              {content.openListingLabel}
            </Link>
          ) : (
            <p className="conversation-listing-unavailable">
              {content.advertisementNoLongerAvailableMessage}
            </p>
          )}
          <div className="conversation-delete-control">
            <button
              ref={conversationDeleteButtonRef}
              type="button"
              className="secondary-button conversation-delete-button"
              onClick={openConversationDeleteConfirmation}
              aria-expanded={confirmationDialog?.kind === 'conversation'}
            >
              {content.deleteConversationButton}
            </button>
          </div>
        </div>
      </div>

      {visibleConnectionStatus ? (
        <p
          className={`messaging-live-status messaging-live-status--${visibleConnectionStatus}`}
          role="status"
        >
          {getConnectionStatusMessage(visibleConnectionStatus)}
        </p>
      ) : null}

      <div
        ref={messageHistoryRef}
        className="message-list"
        aria-label={content.messagesTitle}
        aria-live="polite"
        tabIndex={0}
        onScroll={handleMessageHistoryScroll}
      >
        <div ref={messageListContentRef} className="message-list-content">
          {messages.map((message, index) => {
            const isOwnMessage = message.senderId === currentUserId;
            const isLatestOwnMessage = latestOwnMessage?.id === message.id;
            const isDeleted = message.deletedAt !== null;
            const isEditing = editingMessageId === message.id;
            const messageAttachments = attachmentsByMessageId[message.id] || [];
            const shouldEagerLoadAttachments = index >= messages.length - 6;
            const messageDateKey = getDateKey(message.createdAt, useLocalTime);
            const previousMessage = index > 0 ? messages[index - 1] : null;
            const previousDateKey = previousMessage
              ? getDateKey(previousMessage.createdAt, useLocalTime)
              : null;
            const readByOtherParticipant =
              Boolean(otherReadMarker) &&
              Date.parse(otherReadMarker?.lastReadAt || '') >=
                Date.parse(message.createdAt);

            return (
              <div key={message.id} className="message-list-item">
              {messageDateKey !== previousDateKey ? (
                <div className="message-date-divider" role="separator">
                  {formatMessageDateDivider(message.createdAt, useLocalTime)}
                </div>
              ) : null}
              <article
                className={
                  isOwnMessage
                    ? isDeleted
                      ? 'message-bubble message-bubble--own message-bubble--deleted'
                      : 'message-bubble message-bubble--own'
                    : isDeleted
                      ? 'message-bubble message-bubble--other message-bubble--deleted'
                      : 'message-bubble message-bubble--other'
                }
              >
                {isEditing && !isDeleted ? (
                  <form
                    ref={editContainerRef}
                    className="message-edit-form"
                    onSubmit={handleEditMessage}
                  >
                    <label className="sr-only" htmlFor={`edit-message-${message.id}`}>
                      {content.editMessageButton}
                    </label>
                    <textarea
                      ref={editTextareaRef}
                      id={`edit-message-${message.id}`}
                      value={editBody}
                      maxLength={MESSAGE_BODY_MAX_LENGTH}
                      rows={3}
                      onChange={(event) => {
                        setEditBody(event.target.value);
                        setMessageActionError('');
                      }}
                      required={messageAttachments.length === 0}
                    />
                    {messageActionError ? (
                      <p className="form-error" role="alert">
                        {messageActionError}
                      </p>
                    ) : null}
                    <div className="message-inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditBody('');
                          setMessageActionError('');
                        }}
                        disabled={editingSubmittingMessageId === message.id}
                      >
                        {content.cancelButton}
                      </button>
                      <button
                        type="submit"
                        className="search-button"
                        disabled={editingSubmittingMessageId === message.id}
                        aria-busy={editingSubmittingMessageId === message.id}
                      >
                        {content.saveMessageButton}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {isDeleted ? (
                      <p>{content.messageDeletedLabel}</p>
                    ) : (
                      <>
                        {messageAttachments.length > 0 ? (
                          <div
                            className={`message-attachments message-attachments--count-${messageAttachments.length}`}
                            aria-label={content.messagePhotosLabel}
                          >
                            {messageAttachments.map((attachment, attachmentIndex) => (
                              <button
                                key={attachment.id}
                                type="button"
                                className="message-attachment-button"
                                onClick={() =>
                                  setAttachmentViewer({
                                    kind: 'sent',
                                    attachmentId: attachment.id,
                                  })
                                }
                                aria-label={content.openMessagePhotoViewerLabel
                                  .replace(
                                    '{current}',
                                    String(attachmentIndex + 1)
                                  )
                                  .replace(
                                    '{total}',
                                    String(messageAttachments.length)
                                  )}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={attachment.url}
                                  alt=""
                                  className="message-attachment-image"
                                  loading={
                                    shouldEagerLoadAttachments ? 'eager' : 'lazy'
                                  }
                                  onLoad={() => {
                                    handleInitialAttachmentSettled(attachment.id);
                                    handleOutgoingAttachmentSettled(message.id);
                                    handleIncomingAttachmentSettled(message.id);
                                  }}
                                  onError={() => {
                                    handleInitialAttachmentSettled(attachment.id);
                                    handleOutgoingAttachmentSettled(message.id);
                                    handleIncomingAttachmentSettled(message.id);
                                  }}
                                />
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {message.body ? <p>{message.body}</p> : null}
                      </>
                    )}
                    <div className="message-meta">
                      <time dateTime={message.createdAt}>
                        {formatMessageTime(message.createdAt, useLocalTime)}
                      </time>
                      {message.editedAt && !isDeleted ? (
                        <span className="message-edited-label">
                          {content.editedMessageLabel}
                        </span>
                      ) : null}
                      {isOwnMessage && isLatestOwnMessage ? (
                        <span
                          className={
                            readByOtherParticipant
                              ? 'message-read-receipt message-read-receipt--read'
                              : 'message-read-receipt'
                          }
                        >
                          {readByOtherParticipant
                            ? content.readMessageReceiptLabel
                            : content.sentMessageReceiptLabel}
                        </span>
                      ) : null}
                    </div>
                    {isOwnMessage && !isDeleted ? (
                      <div className="message-actions-menu">
                        <button
                          ref={(element) => {
                            if (element) {
                              messageActionTriggerRefs.current.set(
                                message.id,
                                element
                              );
                              return;
                            }

                            messageActionTriggerRefs.current.delete(message.id);
                          }}
                          type="button"
                          className="message-actions-trigger"
                          aria-label={content.messageActionsLabel}
                          title={content.messageActionsLabel}
                          aria-expanded={
                            messageMenuOverlay?.messageId === message.id
                          }
                          onClick={(event) =>
                            openMessageActions(message.id, event.currentTarget)
                          }
                        >
                          •••
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </article>
              {newestUnreadIncomingMessage?.id === message.id ? (
                <div
                  ref={readSentinelRef}
                  className="message-read-sentinel"
                  aria-hidden="true"
                />
              ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {showNewMessagesButton ? (
        <button
          type="button"
          className="new-messages-button"
          onClick={() => {
            shouldScrollToBottomRef.current = true;
            scrollMessageHistoryToBottom();
            setShowNewMessagesButton(false);
            window.requestAnimationFrame(markVisibleUnreadBoundaryRead);
          }}
        >
          {content.jumpToNewestMessageButton}
        </button>
      ) : null}

      {readStatusError ? (
        <p className="form-error" role="alert">
          {readStatusError}
        </p>
      ) : null}

      {messageActionError && !editingMessageId ? (
        <p className="message-action-error" role="alert">
          {messageActionError}
        </p>
      ) : null}

      <form
        ref={messageFormRef}
        className="message-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="message-composer-row">
          <div className="message-attachment-composer">
            <input
              ref={attachmentInputRef}
              id="thread-message-attachments"
              className="sr-only"
              type="file"
              accept={MESSAGE_ATTACHMENT_ACCEPT}
              multiple
              onChange={handleAttachmentFilesChange}
              disabled={
                sendStatus === 'sending' ||
                pendingAttachments.length >= MAX_MESSAGE_ATTACHMENTS
              }
            />
            <button
              type="button"
              className="secondary-button message-attachment-add-button"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={
                sendStatus === 'sending' ||
                pendingAttachments.length >= MAX_MESSAGE_ATTACHMENTS
              }
            >
              {content.addMessagePhotosButton}
            </button>
          </div>

          <label
            className="form-field message-composer-field"
            htmlFor="thread-message-body"
          >
            <span className="sr-only">{content.writeMessageLabel}</span>
            <textarea
              ref={textareaRef}
              id="thread-message-body"
              name="body"
              value={body}
              maxLength={MESSAGE_BODY_MAX_LENGTH}
              rows={2}
              placeholder={content.writeMessageLabel}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                const nextBody = event.target.value;

                setBody(nextBody);
                setError('');

                if (
                  pendingDeliveryRef.current &&
                  nextBody.trim() !== pendingDeliveryRef.current.body
                ) {
                  pendingDeliveryRef.current = null;
                  setUploadedPendingAttachments(null);

                  if (sendStatusRef.current === 'delivery-uncertain') {
                    updateSendStatus('idle');
                  }
                }
              }}
              required={pendingAttachments.length === 0}
            />
          </label>

          <button
            type="submit"
            className="search-button message-send-button"
            disabled={sendStatus === 'sending'}
            aria-busy={sendStatus === 'sending'}
          >
            {sendStatus === 'sending'
              ? content.sendingMessageButton
              : content.sendMessageButton}
          </button>
        </div>

        <p className="form-help message-attachment-help">
          {content.messageAttachmentRequirementsMessage}
        </p>

        {pendingAttachments.length > 0 ? (
          <div
            ref={pendingAttachmentPreviewListRef}
            className="message-attachment-preview-list"
            aria-label={content.messagePhotosLabel}
          >
            {pendingAttachments.map((attachment, index) => (
              <div key={attachment.id} className="message-attachment-preview">
                <button
                  type="button"
                  className="message-attachment-preview-button"
                  onClick={() =>
                    setAttachmentViewer({
                      kind: 'pending',
                      attachmentId: attachment.id,
                    })
                  }
                  aria-label={content.openMessagePhotoViewerLabel
                    .replace('{current}', String(index + 1))
                    .replace('{total}', String(pendingAttachments.length))}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.previewUrl}
                    alt=""
                    className="message-attachment-preview-image"
                  />
                </button>
                <button
                  type="button"
                  className="message-attachment-remove-button"
                  onClick={() => removePendingAttachment(attachment.id)}
                  disabled={sendStatus === 'sending'}
                  aria-label={`${content.removeMessagePhotoButton} ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {messageMenuOverlay ? (
        <div
          className="message-actions-menu-list message-actions-menu-list--floating"
          style={
            {
              '--message-menu-top': `${messageMenuOverlay.top}px`,
              '--message-menu-left': `${messageMenuOverlay.left}px`,
            } as CSSProperties
          }
        >
          {(() => {
            const selectedMessage = messages.find(
              (message) => message.id === messageMenuOverlay.messageId
            );
            const canEditMessage = selectedMessage
              ? selectedMessage.deletedAt === null &&
                selectedMessage.body.trim().length > 0
              : false;

            return canEditMessage ? (
              <button
                type="button"
                onClick={() => {
                  if (selectedMessage) {
                    startEditingMessage(selectedMessage);
                  }
                }}
              >
                {content.editMessageButton}
              </button>
            ) : null;
          })()}
          <button
            type="button"
            className="message-action-destructive"
            onClick={() =>
              openMessageDeleteConfirmation(messageMenuOverlay.messageId)
            }
          >
            {content.deleteMessageButton}
          </button>
        </div>
      ) : null}

      {confirmationDialog ? (
        <div
          className="message-confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeConfirmationDialog();
            }
          }}
        >
          <div
            ref={confirmationDialogRef}
            className="message-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-confirmation-title"
            aria-describedby="message-confirmation-description"
            tabIndex={-1}
          >
            <h2 id="message-confirmation-title">
              {confirmationDialog.kind === 'message'
                ? content.deleteMessageConfirmTitle
                : content.deleteConversationConfirmTitle}
            </h2>
            <p id="message-confirmation-description">
              {confirmationDialog.kind === 'message'
                ? content.deleteMessageConfirmMessage
                : content.deleteConversationConfirmMessage}
            </p>
            {confirmationDialog.kind === 'message' && messageActionError ? (
              <p className="form-error" role="alert">
                {messageActionError}
              </p>
            ) : null}
            {confirmationDialog.kind === 'conversation' &&
            deleteConversationError ? (
              <p className="form-error" role="alert">
                {deleteConversationError}
              </p>
            ) : null}
            <div className="message-confirmation-actions">
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--secondary"
                onClick={closeConfirmationDialog}
                disabled={
                  confirmationDialog.kind === 'message'
                    ? deletingMessageId === confirmationDialog.messageId
                    : isDeletingConversation
                }
              >
                {content.cancelButton}
              </button>
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--destructive"
                onClick={() => {
                  if (confirmationDialog.kind === 'message') {
                    void handleDeleteMessage(confirmationDialog.messageId);
                    return;
                  }

                  void handleDeleteConversation();
                }}
                disabled={
                  confirmationDialog.kind === 'message'
                    ? deletingMessageId === confirmationDialog.messageId
                    : isDeletingConversation
                }
                aria-busy={
                  confirmationDialog.kind === 'message'
                    ? deletingMessageId === confirmationDialog.messageId
                    : isDeletingConversation
                }
              >
                {confirmationDialog.kind === 'message'
                  ? content.deleteMessageButton
                  : content.deleteConversationButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedViewerPhotoUrl ? (
        <div
          className="listing-photo-viewer-backdrop message-photo-viewer-backdrop"
          role="presentation"
          onClick={() => setAttachmentViewer(null)}
        >
          <div
            className="listing-photo-viewer-dialog message-photo-viewer-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={content.messagePhotoViewerTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={attachmentViewerCloseButtonRef}
              type="button"
              className="listing-photo-viewer-close"
              aria-label={content.closeListingPhotoViewerButton}
              onClick={() => setAttachmentViewer(null)}
            >
              ×
            </button>
            {viewerGalleryLength > 1 ? (
              <>
                {canViewPreviousPhoto ? (
                  <button
                    type="button"
                    className="listing-photo-viewer-nav listing-photo-viewer-nav--previous"
                    aria-label={content.previousListingPhotoButton}
                    onClick={showPreviousViewerPhoto}
                  >
                    ‹
                  </button>
                ) : null}
                {canViewNextPhoto ? (
                  <button
                    type="button"
                    className="listing-photo-viewer-nav listing-photo-viewer-nav--next"
                    aria-label={content.nextListingPhotoButton}
                    onClick={showNextViewerPhoto}
                  >
                    ›
                  </button>
                ) : null}
              </>
            ) : null}
            {selectedGalleryItem || selectedPendingGalleryItem ? (
              <div
                className="listing-photo-viewer-position message-photo-viewer-context"
                aria-live="polite"
              >
                {viewerCaptionSnippet ? (
                  <p className="message-photo-viewer-caption">
                    {viewerCaptionSnippet}
                  </p>
                ) : null}
                {viewerMetadataLabel ? (
                  <p className="message-photo-viewer-metadata">
                    {viewerMetadataLabel}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="listing-photo-viewer-image-frame message-photo-viewer-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="listing-photo-viewer-image"
                src={selectedViewerPhotoUrl}
                alt={content.messagePhotoViewerTitle}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
