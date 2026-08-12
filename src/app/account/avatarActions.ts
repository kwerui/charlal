'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUserResult } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
  isProfileAvatarPath,
  removeProfileAvatarFile,
} from '@/lib/supabase/profileAvatars';
import {
  clampAvatarFocus,
  clampAvatarZoom,
} from '@/lib/profileAvatarCrop';

type AvatarMutationRow = {
  public_slug: string;
  avatar_path: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
  previous_avatar_path: string | null;
};

export type ProfileAvatarMutationResult =
  | {
      ok: true;
      avatarPath: string | null;
      avatarFocusX: number;
      avatarFocusY: number;
      avatarZoom: number;
      previousAvatarPath: string | null;
      publicSlug: string;
    }
  | {
      ok: false;
      reason: 'unauthenticated' | 'invalid-path' | 'database-unavailable';
    };

function isAvatarMutationRow(value: unknown): value is AvatarMutationRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof AvatarMutationRow, unknown>>;

  return (
    typeof row.public_slug === 'string' &&
    (row.avatar_path === null || typeof row.avatar_path === 'string') &&
    typeof row.avatar_focus_x === 'number' &&
    typeof row.avatar_focus_y === 'number' &&
    typeof row.avatar_zoom === 'number' &&
    (row.previous_avatar_path === null ||
      typeof row.previous_avatar_path === 'string')
  );
}

function revalidateAvatarPaths(publicSlug: string): void {
  revalidatePath('/account');
  revalidatePath(`/seller/${publicSlug}`);
  revalidatePath('/listing/[id]', 'page');
}

async function setCurrentProfileAvatarPath(
  avatarPath: string | null,
  focusX: number,
  focusY: number,
  zoom: number
): Promise<ProfileAvatarMutationResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const publicSlug = authResult.profile.publicSlug;
  const safeFocusX = clampAvatarFocus(focusX);
  const safeFocusY = clampAvatarFocus(focusY);
  const safeZoom = clampAvatarZoom(zoom);

  if (
    avatarPath !== null &&
    (!isProfileAvatarPath(avatarPath) ||
      !avatarPath.startsWith(`${publicSlug}/`))
  ) {
    return { ok: false, reason: 'invalid-path' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_current_profile_avatar', {
    p_avatar_path: avatarPath,
    p_avatar_focus_x: safeFocusX,
    p_avatar_focus_y: safeFocusY,
    p_avatar_zoom: safeZoom,
  });

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];

  if (!isAvatarMutationRow(row)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  if (
    row.previous_avatar_path &&
    row.previous_avatar_path !== row.avatar_path
  ) {
    await removeProfileAvatarFile(supabase, row.previous_avatar_path);
  }

  revalidateAvatarPaths(row.public_slug);

  return {
    ok: true,
    avatarPath: row.avatar_path,
    avatarFocusX: row.avatar_focus_x,
    avatarFocusY: row.avatar_focus_y,
    avatarZoom: row.avatar_zoom,
    previousAvatarPath: row.previous_avatar_path,
    publicSlug: row.public_slug,
  };
}

export async function saveProfileAvatarAction(
  avatarPath: string,
  focusX: number,
  focusY: number,
  zoom: number
): Promise<ProfileAvatarMutationResult> {
  const safeAvatarPath = avatarPath.trim();

  if (!safeAvatarPath) {
    return { ok: false, reason: 'invalid-path' };
  }

  return setCurrentProfileAvatarPath(safeAvatarPath, focusX, focusY, zoom);
}

export async function removeProfileAvatarAction(): Promise<ProfileAvatarMutationResult> {
  return setCurrentProfileAvatarPath(null, 50, 50, 100);
}

export async function saveProfileAvatarFocusAction(
  focusX: number,
  focusY: number,
  zoom: number
): Promise<ProfileAvatarMutationResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  return setCurrentProfileAvatarPath(
    authResult.profile.avatarPath,
    focusX,
    focusY,
    zoom
  );
}
