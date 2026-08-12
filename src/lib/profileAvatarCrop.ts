import type { CSSProperties } from 'react';

export const MIN_PROFILE_AVATAR_ZOOM = 100;
export const MAX_PROFILE_AVATAR_ZOOM = 300;

export function clampAvatarFocus(value: number): number {
  if (!Number.isFinite(value)) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampAvatarZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_PROFILE_AVATAR_ZOOM;
  }

  return Math.min(
    MAX_PROFILE_AVATAR_ZOOM,
    Math.max(MIN_PROFILE_AVATAR_ZOOM, Math.round(value))
  );
}

export function getProfileAvatarImageStyle(
  focusX: number = 50,
  focusY: number = 50,
  zoom: number = MIN_PROFILE_AVATAR_ZOOM
): CSSProperties {
  const safeFocusX = clampAvatarFocus(focusX);
  const safeFocusY = clampAvatarFocus(focusY);
  const safeZoom = clampAvatarZoom(zoom);

  return {
    objectPosition: `${safeFocusX}% ${safeFocusY}%`,
    transform: `scale(${safeZoom / 100})`,
    transformOrigin: `${safeFocusX}% ${safeFocusY}%`,
  };
}
