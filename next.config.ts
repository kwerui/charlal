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

const nextConfig: NextConfig = {
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
