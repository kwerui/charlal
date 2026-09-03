'use client';

import { useEffect, useRef, useState } from 'react';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import { getProfileAvatarPublicUrl } from '@/lib/supabase/profileAvatars';

type Props = {
  avatarPath: string | null;
  displayName: string;
  profilePhotoLabel: string;
  openProfilePhotoViewerLabel: string;
  closeButtonLabel: string;
  focusX: number;
  focusY: number;
  zoom: number;
};

export default function PublicSellerAvatarViewer({
  avatarPath,
  displayName,
  profilePhotoLabel,
  openProfilePhotoViewerLabel,
  closeButtonLabel,
  focusX,
  focusY,
  zoom,
}: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!viewerOpen) {
      return undefined;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setViewerOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewerOpen]);

  if (!avatarPath) {
    return (
      <ProfileAvatar
        avatarPath={avatarPath}
        displayName={displayName}
        size="large"
        focusX={focusX}
        focusY={focusY}
        zoom={zoom}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className="seller-profile-avatar-button"
        onClick={() => setViewerOpen(true)}
        aria-label={`${openProfilePhotoViewerLabel}: ${displayName}`}
      >
        <ProfileAvatar
          avatarPath={avatarPath}
          displayName={displayName}
          size="large"
          focusX={focusX}
          focusY={focusY}
          zoom={zoom}
        />
      </button>

      {viewerOpen ? (
        <div
          className="avatar-viewer-backdrop"
          role="presentation"
          onClick={() => setViewerOpen(false)}
        >
          <div
            className="avatar-public-viewer-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${profilePhotoLabel}: ${displayName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="avatar-dialog-close"
              onClick={() => setViewerOpen(false)}
            >
              {closeButtonLabel}
            </button>
            <div className="avatar-public-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getProfileAvatarPublicUrl(avatarPath)}
                alt={`${displayName} ${profilePhotoLabel}`}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
