'use client';

import { useEffect, useRef, useState } from 'react';
import { content } from '@/content/tyv';
import type { ReviewPhoto } from '@/lib/supabase/reviews';

type Props = {
  photos: ReviewPhoto[];
  className?: string;
};

function getViewerPosition(current: number, total: number): string {
  return content.listingPhotoPositionTemplate
    .replace('{current}', String(current))
    .replace('{total}', String(total));
}

export default function ReviewPhotoViewer({
  photos,
  className = 'seller-review-photos',
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedPhoto =
    selectedIndex === null ? null : photos[selectedIndex] || null;

  useEffect(() => {
    if (selectedIndex === null) {
      return undefined;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSelectedIndex(null);
      }

      if (event.key === 'ArrowLeft' && photos.length > 1) {
        setSelectedIndex((currentIndex) =>
          currentIndex === null
            ? currentIndex
            : (currentIndex - 1 + photos.length) % photos.length
        );
      }

      if (event.key === 'ArrowRight' && photos.length > 1) {
        setSelectedIndex((currentIndex) =>
          currentIndex === null
            ? currentIndex
            : (currentIndex + 1) % photos.length
        );
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [photos.length, selectedIndex]);

  if (photos.length === 0) {
    return null;
  }

  return (
    <>
      <div className={className}>
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className="review-photo-thumb-button"
            onClick={() => setSelectedIndex(index)}
            aria-label={`${content.openReviewPhotoLabel} ${index + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={content.reviewPhotoPreviewLabel} />
          </button>
        ))}
      </div>

      {selectedPhoto && selectedIndex !== null ? (
        <div
          className="listing-photo-viewer-backdrop review-photo-viewer-backdrop"
          role="presentation"
          onClick={() => setSelectedIndex(null)}
        >
          <div
            className="listing-photo-viewer-dialog review-photo-viewer-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={content.reviewPhotoPreviewLabel}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="listing-photo-viewer-close"
              onClick={() => setSelectedIndex(null)}
            >
              {content.closeListingPhotoViewerButton}
            </button>
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  className="listing-photo-viewer-nav listing-photo-viewer-nav--previous"
                  onClick={() =>
                    setSelectedIndex(
                      (selectedIndex - 1 + photos.length) % photos.length
                    )
                  }
                  aria-label={content.previousListingPhotoButton}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="listing-photo-viewer-nav listing-photo-viewer-nav--next"
                  onClick={() =>
                    setSelectedIndex((selectedIndex + 1) % photos.length)
                  }
                  aria-label={content.nextListingPhotoButton}
                >
                  ›
                </button>
              </>
            ) : null}
            <div className="listing-photo-viewer-position">
              {getViewerPosition(selectedIndex + 1, photos.length)}
            </div>
            <div className="listing-photo-viewer-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="listing-photo-viewer-image"
                src={selectedPhoto.url}
                alt={content.reviewPhotoPreviewLabel}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
