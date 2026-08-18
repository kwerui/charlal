import type { NextConfig } from "next";

type SupabaseStorageRemotePattern = {
  protocol: 'https';
  hostname: string;
  pathname: string;
};

function getSupabaseStorageRemotePatterns(): SupabaseStorageRemotePattern[] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    return [];
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    if (parsedUrl.protocol !== 'https:') {
      return [];
    }

    return [
      {
        protocol: 'https',
        hostname: parsedUrl.hostname,
        pathname: '/storage/v1/object/public/listing-images/**',
      },
      {
        protocol: 'https',
        hostname: parsedUrl.hostname,
        pathname: '/storage/v1/object/public/profile-avatars/**',
      },
    ];
  } catch {
    return [];
  }
}

const supabaseStorageRemotePatterns = getSupabaseStorageRemotePatterns();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseOrigin = (() => {
  if (!supabaseUrl) {
    return '';
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    return parsedUrl.protocol === 'https:' ? parsedUrl.origin : '';
  } catch {
    return '';
  }
})();

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

const connectSources = ["'self'", supabaseOrigin].filter(Boolean);
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
  "upgrade-insecure-requests",
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
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pinimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.magnific.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'encrypted-tbn0.gstatic.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'thumbs.dreamstime.com',
        pathname: '/**',
      },
      ...supabaseStorageRemotePatterns,
    ],
  },
};

export default nextConfig;
