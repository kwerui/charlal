import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { redactRealtimeUrl } from '@/lib/supabase/realtimeDiagnostics';

function redactRealtimeLogData(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[redacted-depth]';
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactRealtimeLogData(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const lowerKey = key.toLocaleLowerCase();

    if (
      lowerKey.includes('token') ||
      lowerKey.includes('authorization') ||
      lowerKey === 'apikey' ||
      lowerKey === 'api_key' ||
      lowerKey.includes('jwt')
    ) {
      redacted[key] = '[redacted]';
      continue;
    }

    if (lowerKey === 'record' || lowerKey === 'old_record') {
      redacted[key] = '[redacted-record]';
      continue;
    }

    redacted[key] = redactRealtimeLogData(nestedValue, depth + 1);
  }

  return redacted;
}

function shouldLogRealtimeEvent(kind: string, message: string): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }

  if (kind === 'transport' || kind === 'channel' || kind === 'error') {
    return true;
  }

  return (
    (kind === 'push' || kind === 'receive') &&
    (message.includes('phx_join') ||
      message.includes('phx_reply') ||
      message.includes('heartbeat'))
  );
}

function redactRealtimeLogMessage(message: string): string {
  return redactRealtimeUrl(message)
    .replace(/([?&]apikey=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(access_token=)[^&\s]+/gi, '$1[redacted]');
}

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();

  const client = createBrowserClient(supabaseUrl, supabasePublishableKey, {
    realtime: {
      logger: (kind, message, data) => {
        if (!shouldLogRealtimeEvent(kind, message)) {
          return;
        }

        console.debug('[supabase-realtime]', {
          kind,
          message: redactRealtimeLogMessage(message),
          data: redactRealtimeLogData(data),
        });
      },
    },
  });

  return client;
}
