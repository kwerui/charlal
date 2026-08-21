'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { content } from '@/content/tyv';
import type { ListingImage } from '@/data/listings';

type Props = {
  images: ListingImage[];
  fallbackImage: string;
  listingTitle: string;
};

export default function ListingImageGallery({
  images,
  fallbackImage,
  listingTitle,
}: Props) {
  const galleryImages =
    images.length > 0
      ? images
      : [
          {
            id: 'fallback',
            url: fallbackImage,
            position: 0,
          },
        ];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedImage = galleryImages[selectedIndex] || galleryImages[0];
  const totalImages = galleryImages.length;
  const selectedAlt = content.listingPhotoAltTemplate
    .replace('{current}', String(selectedIndex + 1))
    .replace('{total}', String(totalImages));
  const fullAlt = `${listingTitle} - ${selectedAlt}`;
  const positionLabel = content.listingPhotoPositionTemplate
    .replace('{current}', String(selectedIndex + 1))
    .replace('{total}', String(totalImages));

  const showPreviousPhoto = useCallback((): void => {
    setSelectedIndex((currentIndex) =>
      currentIndex === 0 ? totalImages - 1 : currentIndex - 1
    );
  }, [totalImages]);

  const showNextPhoto = useCallback((): void => {
    setSelectedIndex((currentIndex) =>
      currentIndex >= totalImages - 1 ? 0 : currentIndex + 1
    );
  }, [totalImages]);

  useEffect(() => {
    if (!viewerOpen) {
      return undefined;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setViewerOpen(false);
        return;
      }

      if (totalImages <= 1) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPreviousPhoto();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNextPhoto();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNextPhoto, showPreviousPhoto, totalImages, viewerOpen]);

  return (
    <div className="listing-image-gallery">
      <button
        type="button"
        className="listing-detail-image-wrapper listing-detail-image-button"
        onClick={() => setViewerOpen(true)}
        aria-label={`${content.openListingPhotoViewerLabel}: ${fullAlt}`}
      >
        <Image
          className="listing-detail-image"
          src={selectedImage.url}
          alt={fullAlt}
          fill
          fetchPriority="high"
          sizes="(max-width: 768px) calc(100vw - 24px), 600px"
        />
      </button>
      {totalImages > 1 ? (
        <div className="listing-image-thumbnails" aria-label={content.listingPhotosLabel}>
          {galleryImages.map((image, index) => {
            const photoNumber = index + 1;
            const selected = index === selectedIndex;

            return (
              <button
                key={image.id}
                type="button"
                className={`listing-image-thumbnail${
                  selected ? ' listing-image-thumbnail--selected' : ''
                }`}
                aria-label={content.viewListingPhotoLabel
                  .replace('{current}', String(photoNumber))
                  .replace('{total}', String(totalImages))}
                aria-current={selected ? 'true' : undefined}
                onClick={() => setSelectedIndex(index)}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="96px"
                />
              </button>
            );
          })}
        </div>
      ) : null}
      {viewerOpen ? (
        <div
          className="listing-photo-viewer-backdrop"
          role="presentation"
          onClick={() => setViewerOpen(false)}
        >
          <div
            className="listing-photo-viewer-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${content.listingPhotoViewerTitle}: ${fullAlt}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="listing-photo-viewer-close"
              onClick={() => setViewerOpen(false)}
            >
              {content.closeListingPhotoViewerButton}
            </button>
            {totalImages > 1 ? (
              <>
                <button
                  type="button"
                  className="listing-photo-viewer-nav listing-photo-viewer-nav--previous"
                  onClick={showPreviousPhoto}
                >
                  {content.previousListingPhotoButton}
                </button>
                <button
                  type="button"
                  className="listing-photo-viewer-nav listing-photo-viewer-nav--next"
                  onClick={showNextPhoto}
                >
                  {content.nextListingPhotoButton}
                </button>
                <p className="listing-photo-viewer-position" aria-live="polite">
                  {positionLabel}
                </p>
              </>
            ) : null}
            <div className="listing-photo-viewer-image-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="listing-photo-viewer-image"
                src={selectedImage.url}
                alt={fullAlt}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
