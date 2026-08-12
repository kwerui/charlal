import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

export const PROFILE_AVATARS_BUCKET = 'profile-avatars';
export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

export const PROFILE_AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ProfileAvatarMimeType = (typeof PROFILE_AVATAR_MIME_TYPES)[number];

type ProfileAvatarStorageClient = Pick<SupabaseClient, 'storage'>;

const PROFILE_AVATAR_PATH_PATTERN =
  /^seller-[a-f0-9]{32}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isProfileAvatarPath(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_AVATAR_PATH_PATTERN.test(value);
}

export function getProfileAvatarPublicUrl(storagePath: string): string {
  const { supabaseUrl } = getSupabasePublicEnv();
  const encodedPath = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${supabaseUrl}/storage/v1/object/public/${PROFILE_AVATARS_BUCKET}/${encodedPath}`;
}

export function getProfileAvatarExtension(
  file: File
): 'jpg' | 'png' | 'webp' | null {
  if (file.type === 'image/jpeg') {
    return 'jpg';
  }

  if (file.type === 'image/png') {
    return 'png';
  }

  if (file.type === 'image/webp') {
    return 'webp';
  }

  return null;
}

export function createProfileAvatarStoragePath(
  publicSlug: string,
  file: File
): string | null {
  const safePublicSlug = publicSlug.trim();
  const extension = getProfileAvatarExtension(file);

  if (!/^seller-[a-f0-9]{32}$/.test(safePublicSlug) || !extension) {
    return null;
  }

  return `${safePublicSlug}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadProfileAvatarFile(
  supabase: ProfileAvatarStorageClient,
  storagePath: string,
  file: File
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

  return !error;
}

export async function removeProfileAvatarFile(
  supabase: ProfileAvatarStorageClient,
  storagePath: string | null
): Promise<boolean> {
  const safeStoragePath = storagePath?.trim();

  if (!safeStoragePath) {
    return true;
  }

  const { error } = await supabase.storage
    .from(PROFILE_AVATARS_BUCKET)
    .remove([safeStoragePath]);

  return !error;
}
