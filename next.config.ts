import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

type SupabaseStorageRemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
};

function getSupabaseStorageRemotePatterns(): SupabaseStorageRemotePattern[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    return [];
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    const isHttps = parsedUrl.protocol === "https:";
    const isLocalDevelopmentHttp =
      process.env.NODE_ENV !== "production" &&
      parsedUrl.protocol === "http:" &&
      (parsedUrl.hostname === "127.0.0.1" ||
        parsedUrl.hostname === "localhost");

    if (!isHttps && !isLocalDevelopmentHttp) {
      return [];
    }

    const protocol: "http" | "https" =
      parsedUrl.protocol === "https:" ? "https" : "http";

    return [
      {
        protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        pathname: "/storage/v1/object/public/listing-images/**",
      },
      {
        protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        pathname: "/storage/v1/object/public/profile-avatars/**",
      },
    ];
  } catch {
    return [];
  }
}

const supabaseStorageRemotePatterns =
  getSupabaseStorageRemotePatterns();

type SupabaseCspOrigins = {
  supabaseOrigin: string;
  supabaseRealtimeOrigin: string;
};

export function getSupabaseCspOrigins(
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
): SupabaseCspOrigins {
  if (!supabaseUrl) {
    return {
      supabaseOrigin: "",
      supabaseRealtimeOrigin: "",
    };
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      return {
        supabaseOrigin: "",
        supabaseRealtimeOrigin: "",
      };
    }

    const realtimeUrl = new URL(supabaseUrl);
    realtimeUrl.protocol =
      parsedUrl.protocol === "https:" ? "wss:" : "ws:";

    return {
      supabaseOrigin: parsedUrl.origin,
      supabaseRealtimeOrigin: realtimeUrl.origin,
    };
  } catch {
    return {
      supabaseOrigin: "",
      supabaseRealtimeOrigin: "",
    };
  }
}

export function getContentSecurityPolicyConnectSources(
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
): string[] {
  const { supabaseOrigin, supabaseRealtimeOrigin } =
    getSupabaseCspOrigins(supabaseUrl);

  return Array.from(
    new Set(["'self'", supabaseOrigin, supabaseRealtimeOrigin].filter(Boolean))
  );
}

const { supabaseOrigin } = getSupabaseCspOrigins();

const imageSources = [
  "'self'",
  'data:',
  'blob:',
  'https://i.pinimg.com',
  'https://img.magnific.com',
  'https://encrypted-tbn0.gstatic.com',
  'https://thumbs.dreamstime.com',
  supabaseOrigin,
].filter(Boolean);

const connectSources = getContentSecurityPolicyConnectSources();
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src ${scriptSources.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imageSources.join(' ')}`,
  "font-src 'self' data:",
  `connect-src ${connectSources.join(' ')}`,
  ...(process.env.NODE_ENV === 'production'
    ? ["upgrade-insecure-requests"]
    : []),
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '0',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",

    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pinimg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.magnific.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "thumbs.dreamstime.com",
        pathname: "/**",
      },
      ...supabaseStorageRemotePatterns,
    ],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
