'use client';

import { useEffect, useRef, useState } from 'react';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import { content } from '@/content/tyv';
import { getProfileAvatarPublicUrl } from '@/lib/supabase/profileAvatars';

type Props = {
  avatarPath: string | null;
  displayName: string;
  focusX: number;
  focusY: number;
  zoom: number;
};

export default function PublicSellerAvatarViewer({
  avatarPath,
  displayName,
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
        aria-label={`${content.openProfilePhotoViewerLabel}: ${displayName}`}
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
            aria-label={`${content.profilePhotoLabel}: ${displayName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="avatar-dialog-close"
              onClick={() => setViewerOpen(false)}
            >
              {content.closeListingPhotoViewerButton}
            </button>
            <div className="avatar-public-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getProfileAvatarPublicUrl(avatarPath)}
                alt={`${displayName} profile photo`}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
