import type { NextConfig } from "next";

type SupabaseStorageRemotePattern = {
  protocol: 'https';
  hostname: string;
  pathname: string;
};

function getSupabaseStorageRemotePattern(): SupabaseStorageRemotePattern | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    if (parsedUrl.protocol !== 'https:') {
      return null;
    }

    return {
      protocol: 'https',
      hostname: parsedUrl.hostname,
      pathname: '/storage/v1/object/public/listing-images/**',
    };
  } catch {
    return null;
  }
}

const supabaseStorageRemotePattern = getSupabaseStorageRemotePattern();

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
      ...(supabaseStorageRemotePattern ? [supabaseStorageRemotePattern] : []),
    ],
  },
};

export default nextConfig;
