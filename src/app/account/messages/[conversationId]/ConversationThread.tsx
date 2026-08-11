'use client';

import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/realtime-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteMessageAction,
  editMessageAction,
  getConversationThreadSnapshotAction,
  hideConversationAction,
  markConversationReadAction,
  sendMessageAction,
} from '@/app/account/messages/actions';
import { content } from '@/content/tyv';
import { useMessagingRealtime } from '@/lib/messagingRealtime';
import {
  MESSAGE_BODY_MAX_LENGTH,
  databaseConversationReadRowToApp,
  databaseMessageRowToApp,
  isDatabaseConversationReadRow,
  isDatabaseMessageRow,
  type AppConversationRead,
  type AppConversation,
  type AppMessage,
  type DatabaseConversationReadRow,
  type DatabaseMessageRow,
} from '@/lib/messagingTypes';
import { createClient } from '@/lib/supabase/client';

type Props = {
  conversation: AppConversation;
  initialMessages: AppMessage[];
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

const SEND_CONFIRMATION_TIMEOUT_MS = 12000;
const MESSAGE_MENU_WIDTH = 152;
const MESSAGE_MENU_HEIGHT = 78;
const VIEWPORT_OVERLAY_GUTTER = 12;

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
  if (!historyElement) {
    return true;
  }

  return (
    historyElement.scrollHeight -
      historyElement.clientHeight -
      historyElement.scrollTop <=
    96
  );
}

function scrollHistoryToBottom(historyElement: HTMLDivElement | null): void {
  if (!historyElement) {
    return;
  }

  historyElement.scrollTop = historyElement.scrollHeight;
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
  initialMessages,
  initialReadMarkers,
  currentUserId,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { refreshMessagingState } = useMessagingRealtime();
  const [messages, setMessages] = useState(() =>
    [...initialMessages].sort(compareMessagesByCreatedAt)
  );
  const [readMarkers, setReadMarkers] = useState(initialReadMarkers);
  const [body, setBody] = useState('');
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
  const markReadRequestedRef = useRef(false);
  const hasSubscribedRef = useRef(false);
  const shouldScrollToBottomRef = useRef(true);
  const initialThreadRevealRef = useRef(false);
  const messageHistoryRef = useRef<HTMLDivElement | null>(null);
  const messageFormRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const confirmationDialogRef = useRef<HTMLDivElement | null>(null);
  const conversationDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const messageActionTriggerRefs = useRef<Map<string, HTMLButtonElement>>(
    new Map()
  );
  const mountedRef = useRef(false);
  const sendAttemptRef = useRef(0);
  const sendStatusRef = useRef<SendStatus>('idle');
  const pendingDeliveryRef = useRef<PendingDelivery | null>(null);
  const threadStatusRef = useRef<ThreadRealtimeStatus>('idle');
  const threadStatusVersionRef = useRef(0);
  const activeThreadChannelGenerationRef = useRef(0);
  const [threadReconnectGeneration, setThreadReconnectGeneration] =
    useState(0);
  const otherParticipantName = useMemo(() => {
    return conversation.buyerId === currentUserId
      ? conversation.sellerDisplayName
      : conversation.buyerDisplayName;
  }, [conversation, currentUserId]);
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
  const errorId = 'thread-message-error';
  const visibleConnectionStatus: VisibleConnectionStatus = !isBrowserOnline
    ? 'offline'
    : threadStatus === 'unavailable'
      ? 'unavailable'
      : threadStatus === 'reconnecting'
        ? 'reconnecting'
        : null;

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
    initialThreadRevealRef.current = false;
    mountedRef.current = true;
    const localTimeFrame = window.requestAnimationFrame(() => {
      setUseLocalTime(true);
    });

    return () => {
      window.cancelAnimationFrame(localTimeFrame);
      mountedRef.current = false;
      sendAttemptRef.current += 1;
      pendingDeliveryRef.current = null;
    };
  }, [conversation.id]);

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
    threadStatusRef.current = threadStatus;
  }, [threadStatus]);

  useEffect(() => {
    sendStatusRef.current = sendStatus;
  }, [sendStatus]);

  const updateSendStatus = useCallback((nextStatus: SendStatus): void => {
    sendStatusRef.current = nextStatus;
    setSendStatus(nextStatus);
  }, []);

  const reconcileThread = useCallback(async (): Promise<void> => {
    const result = await getConversationThreadSnapshotAction(conversation.id);

    if (!mountedRef.current || !result.ok) {
      return;
    }

    const sortedMessages = [...result.messages].sort(compareMessagesByCreatedAt);

    setMessages(sortedMessages);
    setReadMarkers(result.readMarkers);

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
      shouldScrollToBottomRef.current = true;
    }

    void refreshMessagingState();
  }, [conversation.id, currentUserId, refreshMessagingState, updateSendStatus]);

  const markThreadRead = useCallback(async (): Promise<void> => {
    const result = await markConversationReadAction(conversation.id);

    if (!mountedRef.current) {
      return;
    }

    if (!result.ok) {
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
    if (markReadRequestedRef.current || messages.length === 0) {
      return;
    }

    markReadRequestedRef.current = true;
    void markThreadRead();
  }, [markThreadRead, messages.length]);

  useEffect(() => {
    let active = true;
    const channelGeneration = activeThreadChannelGenerationRef.current + 1;
    activeThreadChannelGenerationRef.current = channelGeneration;

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
      const shouldAutoScroll =
        nextMessage.senderId === currentUserId ||
        isNearHistoryBottom(messageHistoryRef.current);

      threadStatusVersionRef.current += 1;
      setThreadStatus('subscribed');
      shouldScrollToBottomRef.current = shouldAutoScroll;
      setShowNewMessagesButton(
        nextMessage.senderId !== currentUserId && !shouldAutoScroll
      );
      setMessages((currentMessages) =>
        mergeMessage(currentMessages, nextMessage)
      );

      if (nextMessage.senderId !== currentUserId) {
        void markThreadRead();
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

    const channel = supabase
      .channel(`messaging-thread:${conversation.id}`)
      .on<DatabaseMessageRow>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleIncomingMessage
      )
      .on<DatabaseMessageRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleMessageUpdate
      )
      .on<DatabaseConversationReadRow>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_reads',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleReadMarkerChange
      )
      .on<DatabaseConversationReadRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_reads',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleReadMarkerChange
      )
      .subscribe((nextStatus) => {
        if (
          !active ||
          activeThreadChannelGenerationRef.current !== channelGeneration
        ) {
          return;
        }

        if (nextStatus === 'SUBSCRIBED') {
          threadStatusVersionRef.current += 1;
          hasSubscribedRef.current = true;
          setThreadStatus('subscribed');
          return;
        }

        if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          const statusVersion = threadStatusVersionRef.current + 1;
          threadStatusVersionRef.current = statusVersion;

          queueMicrotask(() => {
            if (
              active &&
              activeThreadChannelGenerationRef.current === channelGeneration &&
              threadStatusVersionRef.current === statusVersion
            ) {
              setThreadStatus('unavailable');
            }
          });
          return;
        }

        if (nextStatus === 'CLOSED' && hasSubscribedRef.current) {
          const statusVersion = threadStatusVersionRef.current + 1;
          threadStatusVersionRef.current = statusVersion;

          queueMicrotask(() => {
            if (
              active &&
              activeThreadChannelGenerationRef.current === channelGeneration &&
              threadStatusVersionRef.current === statusVersion
            ) {
              setThreadStatus('reconnecting');
            }
          });
        }
      });

    return () => {
      active = false;
      if (activeThreadChannelGenerationRef.current === channelGeneration) {
        activeThreadChannelGenerationRef.current += 1;
      }
      hasSubscribedRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [
    conversation.id,
    currentUserId,
    markThreadRead,
    refreshMessagingState,
    supabase,
    threadReconnectGeneration,
    updateSendStatus,
  ]);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      scrollHistoryToBottom(messageHistoryRef.current);
      setShowNewMessagesButton(false);

      if (!initialThreadRevealRef.current) {
        initialThreadRevealRef.current = true;

        window.requestAnimationFrame(() => {
          messageFormRef.current?.scrollIntoView({
            block: 'nearest',
            behavior: 'auto',
          });
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [conversation.id, messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sendStatus === 'sending') {
      return;
    }

    const safeBody = body.trim();

    if (!safeBody) {
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
    const clientAttemptId =
      existingPendingDelivery &&
      existingPendingDelivery.body === safeBody &&
      sendStatus === 'delivery-uncertain'
        ? existingPendingDelivery.clientAttemptId
        : createClientAttemptId();
    const attemptId = sendAttemptRef.current + 1;
    const pendingDelivery: PendingDelivery = {
      body: safeBody,
      clientAttemptId,
    };

    sendAttemptRef.current = attemptId;
    pendingDeliveryRef.current = pendingDelivery;
    updateSendStatus('sending');
    setError('');

    let handledAttempt = false;

    try {
      const result = await withTimeout(
        sendMessageAction({
          conversationId: conversation.id,
          body: safeBody,
          clientAttemptId,
        }),
        SEND_CONFIRMATION_TIMEOUT_MS
      );

      if (!mountedRef.current || sendAttemptRef.current !== attemptId) {
        return;
      }

      if (!result.ok) {
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
      shouldScrollToBottomRef.current = true;
      setBody('');
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

    if (!safeBody) {
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
        <div>
          <p className="hero-kicker">{content.messagesTitle}</p>
          <h1>{conversation.listingTitle}</h1>
          <p>{otherParticipantName}</p>
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
      >
        {messages.map((message, index) => {
          const isOwnMessage = message.senderId === currentUserId;
          const isLatestOwnMessage = latestOwnMessage?.id === message.id;
          const isDeleted = message.deletedAt !== null;
          const isEditing = editingMessageId === message.id;
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
                  <form className="message-edit-form" onSubmit={handleEditMessage}>
                    <label className="sr-only" htmlFor={`edit-message-${message.id}`}>
                      {content.editMessageButton}
                    </label>
                    <textarea
                      id={`edit-message-${message.id}`}
                      value={editBody}
                      maxLength={MESSAGE_BODY_MAX_LENGTH}
                      rows={3}
                      onChange={(event) => {
                        setEditBody(event.target.value);
                        setMessageActionError('');
                      }}
                      required
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
                    <p>{isDeleted ? content.messageDeletedLabel : message.body}</p>
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
            </div>
            );
        })}
      </div>

      {showNewMessagesButton ? (
        <button
          type="button"
          className="new-messages-button"
          onClick={() => {
            shouldScrollToBottomRef.current = true;
            scrollHistoryToBottom(messageHistoryRef.current);
            setShowNewMessagesButton(false);
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

      <form
        ref={messageFormRef}
        className="message-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <label className="form-field" htmlFor="thread-message-body">
          <span>{content.writeMessageLabel}</span>
          <textarea
            ref={textareaRef}
            id="thread-message-body"
            name="body"
            value={body}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            rows={4}
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

                if (sendStatusRef.current === 'delivery-uncertain') {
                  updateSendStatus('idle');
                }
              }
            }}
            required
          />
        </label>
        {error ? (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="message-form-actions">
          <Link href="/account/messages" className="secondary-button">
            {content.backToMessages}
          </Link>
          <button
            type="submit"
            className="search-button"
            disabled={sendStatus === 'sending'}
            aria-busy={sendStatus === 'sending'}
          >
            {sendStatus === 'sending'
              ? content.sendingMessageButton
              : content.sendMessageButton}
          </button>
        </div>
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
          <button
            type="button"
            onClick={() => {
              const selectedMessage = messages.find(
                (message) => message.id === messageMenuOverlay.messageId
              );

              if (selectedMessage) {
                startEditingMessage(selectedMessage);
              }
            }}
          >
            {content.editMessageButton}
          </button>
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
    </div>
  );
}
