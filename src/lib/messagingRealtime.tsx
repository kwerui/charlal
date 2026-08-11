'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getMessagingSnapshotAction } from '@/app/account/messages/actions';
import type { AppConversationSummary } from '@/lib/messagingTypes';
import { useAuthStatus } from '@/lib/auth/client';
import { createClient } from '@/lib/supabase/client';

type MessagingRealtimeStatus =
  | 'idle'
  | 'subscribed'
  | 'reconnecting'
  | 'unavailable';

type MessagingRealtimeContextValue = {
  unreadConversationCount: number;
  conversations: AppConversationSummary[] | null;
  status: MessagingRealtimeStatus;
  refreshMessagingState: () => Promise<void>;
};

const MessagingRealtimeContext =
  createContext<MessagingRealtimeContextValue | undefined>(undefined);

type Props = {
  initialUnreadConversationCount: number;
  children: ReactNode;
};

type MessagingSnapshotState = {
  userId: string | null;
  unreadConversationCount: number;
  conversations: AppConversationSummary[] | null;
};

type ChannelStatusState = {
  userId: string | null;
  status: MessagingRealtimeStatus;
};

export function MessagingRealtimeProvider({
  initialUnreadConversationCount,
  children,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { status: authStatus, user } = useAuthStatus();
  const userId = authStatus === 'authenticated' ? user?.id || null : null;
  const [snapshot, setSnapshot] = useState<MessagingSnapshotState>({
    userId: null,
    unreadConversationCount: initialUnreadConversationCount,
    conversations: null,
  });
  const [channelStatus, setChannelStatus] = useState<ChannelStatusState>({
    userId: null,
    status: 'idle',
  });
  const currentUserIdRef = useRef<string | null>(userId);
  const refreshInFlightRef = useRef(false);
  const refreshAgainRef = useRef(false);

  useEffect(() => {
    currentUserIdRef.current = userId;
  }, [userId]);

  const refreshMessagingStateForUser = useCallback(
    async (targetUserId: string): Promise<void> => {
      if (refreshInFlightRef.current) {
        refreshAgainRef.current = true;
        return;
      }

      refreshInFlightRef.current = true;

      try {
        let shouldRefreshAgain = true;

        while (shouldRefreshAgain) {
          refreshAgainRef.current = false;

          const nextSnapshot = await getMessagingSnapshotAction();

          if (
            nextSnapshot.ok &&
            currentUserIdRef.current === targetUserId
          ) {
            setSnapshot({
              userId: targetUserId,
              unreadConversationCount: nextSnapshot.unreadConversationCount,
              conversations: nextSnapshot.conversations,
            });
          }

          shouldRefreshAgain = refreshAgainRef.current;
        }
      } finally {
        refreshInFlightRef.current = false;
        refreshAgainRef.current = false;
      }
    },
    []
  );

  const refreshMessagingState = useCallback(async (): Promise<void> => {
    const targetUserId = currentUserIdRef.current;

    if (!targetUserId) {
      return;
    }

    await refreshMessagingStateForUser(targetUserId);
  }, [refreshMessagingStateForUser]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    let active = true;

    queueMicrotask(() => {
      if (active) {
        void refreshMessagingStateForUser(userId);
      }
    });

    const requestSnapshotRefresh = () => {
      if (active) {
        void refreshMessagingStateForUser(userId);
      }
    };

    const channel = supabase
      .channel(`messaging-global:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        requestSnapshotRefresh
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_reads',
        },
        requestSnapshotRefresh
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_reads',
        },
        requestSnapshotRefresh
      )
      .subscribe((nextStatus) => {
        if (!active) {
          return;
        }

        if (nextStatus === 'SUBSCRIBED') {
          setChannelStatus({
            userId,
            status: 'subscribed',
          });
          return;
        }

        if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          setChannelStatus({
            userId,
            status: 'unavailable',
          });
          return;
        }

        if (nextStatus === 'CLOSED') {
          setChannelStatus({
            userId,
            status: 'reconnecting',
          });
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [refreshMessagingStateForUser, supabase, userId]);

  const unreadConversationCount =
    authStatus === 'authenticated' && userId
      ? snapshot.userId === userId
        ? snapshot.unreadConversationCount
        : initialUnreadConversationCount
      : authStatus === 'checking'
        ? initialUnreadConversationCount
        : 0;
  const conversations =
    authStatus === 'authenticated' && userId && snapshot.userId === userId
      ? snapshot.conversations
      : null;
  const status =
    authStatus === 'authenticated' &&
    userId &&
    channelStatus.userId === userId
      ? channelStatus.status
      : 'idle';

  const value = useMemo<MessagingRealtimeContextValue>(
    () => ({
      unreadConversationCount,
      conversations,
      status,
      refreshMessagingState,
    }),
    [conversations, refreshMessagingState, status, unreadConversationCount]
  );

  return (
    <MessagingRealtimeContext.Provider value={value}>
      {children}
    </MessagingRealtimeContext.Provider>
  );
}

export function useMessagingRealtime(): MessagingRealtimeContextValue {
  const context = useContext(MessagingRealtimeContext);

  if (!context) {
    throw new Error(
      'useMessagingRealtime must be used within MessagingRealtimeProvider.'
    );
  }

  return context;
}
