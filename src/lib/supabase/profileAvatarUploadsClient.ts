'use client';

import { createClient } from '@/lib/supabase/client';
import {
  createProfileAvatarStoragePath,
  getProfileAvatarExtension,
  MAX_PROFILE_AVATAR_BYTES,
  PROFILE_AVATAR_MIME_TYPES,
  removeProfileAvatarFile,
  uploadProfileAvatarFile,
} from '@/lib/supabase/profileAvatars';

export type ProfileAvatarUploadResult =
  | {
      ok: true;
      storagePath: string;
    }
  | {
      ok: false;
      reason: 'invalid-file' | 'file-too-large' | 'upload-failed';
      storagePath?: string;
    };

export function validateProfileAvatarFile(
  file: File
): 'invalid-file' | 'file-too-large' | null {
  if (
    !(PROFILE_AVATAR_MIME_TYPES as readonly string[]).includes(file.type) ||
    !getProfileAvatarExtension(file)
  ) {
    return 'invalid-file';
  }

  if (file.size > MAX_PROFILE_AVATAR_BYTES) {
    return 'file-too-large';
  }

  return null;
}

export async function uploadProfileAvatarForProfile(
  publicSlug: string,
  file: File
): Promise<ProfileAvatarUploadResult> {
  const validationError = validateProfileAvatarFile(file);

  if (validationError) {
    return { ok: false, reason: validationError };
  }

  const storagePath = createProfileAvatarStoragePath(publicSlug, file);

  if (!storagePath) {
    return { ok: false, reason: 'invalid-file' };
  }

  const supabase = createClient();
  const uploadSucceeded = await uploadProfileAvatarFile(
    supabase,
    storagePath,
    file
  );

  if (!uploadSucceeded) {
    return { ok: false, reason: 'upload-failed', storagePath };
  }

  return {
    ok: true,
    storagePath,
  };
}

export async function cleanupUploadedProfileAvatar(
  storagePath: string
): Promise<void> {
  const supabase = createClient();

  await removeProfileAvatarFile(supabase, storagePath);
}
