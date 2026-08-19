import type { RealtimeChannel } from '@supabase/realtime-js';

type RealtimeDiagnosticClient = {
  getChannels: () => RealtimeChannel[];
  channel: (name: string) => RealtimeChannel;
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
  realtime: {
    isConnected: () => boolean;
    isConnecting: () => boolean;
    isDisconnecting?: () => boolean;
    connectionState: () => string;
    endpointURL?: () => string;
  };
};

type RealtimeSubscribeCallback = NonNullable<
  Parameters<RealtimeChannel['subscribe']>[0]
>;

type RealtimeInternalSocket = {
  conn?: {
    readyState?: number;
    url?: string;
    protocol?: string;
    constructor?: {
      name?: string;
    };
  } | null;
  transport?: {
    name?: string;
  };
};

type RealtimeInternalClient = {
  socketAdapter?: {
    transport?: {
      name?: string;
    };
    getSocket?: () => RealtimeInternalSocket;
  };
};

const supabaseClientIds = new WeakMap<object, string>();
const realtimeClientIds = new WeakMap<object, string>();

let nextSupabaseClientId = 1;
let nextRealtimeClientId = 1;

function shouldLogRealtimeDiagnostics(): boolean {
  return process.env.NODE_ENV === 'development';
}

function getDebugId(
  ids: WeakMap<object, string>,
  target: object,
  prefix: string,
  nextId: () => number
): string {
  const existingId = ids.get(target);

  if (existingId) {
    return existingId;
  }

  const id = `${prefix}-${nextId()}`;
  ids.set(target, id);

  return id;
}

export function getSupabaseClientDebugId(client: object): string {
  return getDebugId(
    supabaseClientIds,
    client,
    'supabase-browser',
    () => nextSupabaseClientId++
  );
}

export function getRealtimeClientDebugId(client: object): string {
  return getDebugId(
    realtimeClientIds,
    client,
    'realtime-client',
    () => nextRealtimeClientId++
  );
}

export function redactRealtimeUrl(input: unknown): string {
  const rawValue = String(input);

  try {
    const url = new URL(rawValue);
    const redactedSearchParams = new URLSearchParams(url.search);

    for (const key of redactedSearchParams.keys()) {
      const lowerKey = key.toLocaleLowerCase();

      if (
        lowerKey.includes('token') ||
        lowerKey === 'apikey' ||
        lowerKey === 'api_key'
      ) {
        redactedSearchParams.set(key, '[redacted]');
      }
    }

    const hostname = url.hostname.replace(
      /^[^.]+(?=\.supabase\.)/,
      '[supabase-project]'
    );
    const search = redactedSearchParams.toString();

    return `${url.protocol}//${hostname}${url.pathname}${
      search ? `?${search}` : ''
    }${url.hash}`;
  } catch {
    return rawValue
      .replace(/([?&]apikey=)[^&\s]+/gi, '$1[redacted]')
      .replace(/([?&]access_token=)[^&\s]+/gi, '$1[redacted]')
      .replace(
        /(wss?:\/\/)[^.]+(\.supabase\.[^/\s]+)/gi,
        '$1[supabase-project]$2'
      );
  }
}

export function logRealtimeDiagnostic(
  event: string,
  details: Record<string, unknown> = {}
): void {
  if (!shouldLogRealtimeDiagnostics()) {
    return;
  }

  console.debug('[supabase-realtime-lifecycle]', {
    event,
    ...details,
  });
}

function getRealtimeInternalDiagnostics(
  supabase: RealtimeDiagnosticClient
): Record<string, unknown> {
  const realtimeClient = supabase.realtime as RealtimeInternalClient;
  const socketAdapter = realtimeClient.socketAdapter;
  const socket = socketAdapter?.getSocket?.();
  const conn = socket?.conn || null;

  return {
    internalTransportName:
      socketAdapter?.transport?.name || socket?.transport?.name || null,
    hasInternalSocket: Boolean(socket),
    hasInternalConn: Boolean(conn),
    internalConnReadyState: conn?.readyState ?? null,
    internalConnUrl: conn?.url ? redactRealtimeUrl(conn.url) : null,
    internalConnProtocol: conn?.protocol || null,
    internalConnConstructorName: conn?.constructor?.name || null,
  };
}

export function getRealtimeDiagnostics(
  supabase: RealtimeDiagnosticClient,
  channelName?: string,
  logicalChannelBaseName?: string
): Record<string, unknown> {
  const channels = supabase.getChannels();
  const topic = channelName ? `realtime:${channelName}` : null;
  const logicalTopicPrefix = logicalChannelBaseName
    ? `realtime:${logicalChannelBaseName}:`
    : null;
  const sameTopicChannels = topic
    ? channels.filter((channel) => channel.topic === topic)
    : [];
  const sameLogicalChannels = logicalTopicPrefix
    ? channels.filter((channel) => channel.topic.startsWith(logicalTopicPrefix))
    : [];

  return {
    supabaseClientDebugId: getSupabaseClientDebugId(supabase),
    realtimeClientDebugId: getRealtimeClientDebugId(supabase.realtime),
    channelName: channelName || null,
    topic,
    logicalChannelBaseName: logicalChannelBaseName || null,
    logicalTopicPrefix,
    websocketConnected: supabase.realtime.isConnected(),
    websocketConnecting: supabase.realtime.isConnecting(),
    websocketDisconnecting: supabase.realtime.isDisconnecting?.() ?? null,
    websocketConnectionState: supabase.realtime.connectionState(),
    websocketEndpoint: supabase.realtime.endpointURL
      ? redactRealtimeUrl(supabase.realtime.endpointURL())
      : null,
    activeChannelCount: channels.length,
    channelTopics: channels.map((channel) => ({
      topic: channel.topic,
      state: channel.state,
      joinedOnce: channel.joinedOnce,
    })),
    sameTopicChannelCount: sameTopicChannels.length,
    sameTopicChannels: sameTopicChannels.map((channel) => ({
      topic: channel.topic,
      state: channel.state,
      joinedOnce: channel.joinedOnce,
    })),
    sameLogicalChannelCount: sameLogicalChannels.length,
    sameLogicalChannels: sameLogicalChannels.map((channel) => ({
      topic: channel.topic,
      state: channel.state,
      joinedOnce: channel.joinedOnce,
    })),
    ...getRealtimeInternalDiagnostics(supabase),
  };
}

export function subscribeWithRealtimeDiagnostics(
  supabase: RealtimeDiagnosticClient,
  channel: RealtimeChannel,
  options: {
    eventPrefix: string;
    channelName: string;
    logicalChannelBaseName?: string;
    details?: Record<string, unknown>;
  },
  callback: RealtimeSubscribeCallback
): RealtimeChannel {
  const {
    eventPrefix,
    channelName,
    logicalChannelBaseName,
    details = {},
  } = options;

  logRealtimeDiagnostic(`${eventPrefix}-before-subscribe`, {
    ...details,
    ...getRealtimeDiagnostics(
      supabase,
      channelName,
      logicalChannelBaseName
    ),
  });

  const subscribedChannel = channel.subscribe(callback);

  logRealtimeDiagnostic(`${eventPrefix}-after-subscribe-returned`, {
    ...details,
    ...getRealtimeDiagnostics(
      supabase,
      channelName,
      logicalChannelBaseName
    ),
  });

  return subscribedChannel;
}
