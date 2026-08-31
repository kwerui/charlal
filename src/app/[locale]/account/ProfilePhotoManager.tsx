'use client';

import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent,
  WheelEvent,
} from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  removeProfileAvatarAction,
  saveProfileAvatarAction,
  saveProfileAvatarFocusAction,
} from '@/app/account/avatarActions';
import ProfileAvatar from '@/app/components/ProfileAvatar';
import type { AppProfile } from '@/lib/auth/types';
import { useAuthStatus } from '@/lib/auth/client';
import {
  MAX_PROFILE_AVATAR_ZOOM,
  MIN_PROFILE_AVATAR_ZOOM,
  clampAvatarFocus,
  clampAvatarZoom,
} from '@/lib/profileAvatarCrop';
import { getProfileAvatarPublicUrl } from '@/lib/supabase/profileAvatars';
import {
  cleanupUploadedProfileAvatar,
  uploadProfileAvatarForProfile,
  validateProfileAvatarFile,
} from '@/lib/supabase/profileAvatarUploadsClient';

type Props = {
  profile: AppProfile;
  displayName: string;
  onChanged: () => Promise<void>;
};

type EditorMode = 'existing' | 'new-photo';

type EditorState = {
  mode: EditorMode;
  previewUrl: string;
  selectedFile: File | null;
  focusX: number;
  focusY: number;
  zoom: number;
  imageWidth: number | null;
  imageHeight: number | null;
};

function focusChanged(
  nextX: number,
  nextY: number,
  nextZoom: number,
  currentX: number,
  currentY: number,
  currentZoom: number
): boolean {
  return (
    clampAvatarFocus(nextX) !== clampAvatarFocus(currentX) ||
    clampAvatarFocus(nextY) !== clampAvatarFocus(currentY) ||
    clampAvatarZoom(nextZoom) !== clampAvatarZoom(currentZoom)
  );
}

function getFileValidationMessage(
  reason: string,
  t: ReturnType<typeof useTranslations>
): string {
  if (reason === 'file-too-large') {
    return t('tooLargeMessage');
  }

  return t('invalidFormatMessage');
}

export default function ProfilePhotoManager({
  profile,
  displayName,
  onChanged,
}: Props) {
  const t = useTranslations('ProfilePhoto');
  const listingDetailGalleryT = useTranslations('ListingDetail.gallery');
  const listingReportT = useTranslations('ListingReport');
  const { refreshAuth } = useAuthStatus();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const removeCancelRef = useRef<HTMLButtonElement | null>(null);
  const draftObjectUrlRef = useRef<string | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startFocusX: number;
    startFocusY: number;
  } | null>(null);
  const editorTextareaLabelId = useId();
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const inputId = 'profile-avatar-upload';
  const currentFocusX = clampAvatarFocus(profile.avatarFocusX);
  const currentFocusY = clampAvatarFocus(profile.avatarFocusY);
  const currentZoom = clampAvatarZoom(profile.avatarZoom);

  const closeEditor = useCallback((): void => {
    setEditorState((currentEditor) => {
      if (currentEditor?.mode === 'new-photo') {
        URL.revokeObjectURL(currentEditor.previewUrl);
        draftObjectUrlRef.current = null;
      }

      return null;
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    return () => {
      if (draftObjectUrlRef.current) {
        URL.revokeObjectURL(draftObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editorState && !removeDialogOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return;
      }

      if (removeDialogOpen) {
        setRemoveDialogOpen(false);
        return;
      }

      if (!isSubmitting) {
        closeEditor();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeEditor, editorState, isSubmitting, removeDialogOpen]);

  useEffect(() => {
    if (editorState) {
      closeButtonRef.current?.focus();
    }
  }, [editorState]);

  useEffect(() => {
    if (removeDialogOpen) {
      removeCancelRef.current?.focus();
    }
  }, [removeDialogOpen]);

  function openExistingEditor(): void {
    if (!profile.avatarPath || isSubmitting) {
      return;
    }

    setError('');
    setMessage('');
    setEditorState({
      mode: 'existing',
      previewUrl: getProfileAvatarPublicUrl(profile.avatarPath),
      selectedFile: null,
      focusX: currentFocusX,
      focusY: currentFocusY,
      zoom: currentZoom,
      imageWidth: null,
      imageHeight: null,
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setError('');
    setMessage('');

    const file = event.target.files?.[0] || null;

    if (!file) {
      return;
    }

    const validationError = validateProfileAvatarFile(file);

    if (validationError) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setError(getFileValidationMessage(validationError, t));
      return;
    }

    setEditorState((currentEditor) => {
      if (currentEditor?.mode === 'new-photo') {
        URL.revokeObjectURL(currentEditor.previewUrl);
      }

      const nextPreviewUrl = URL.createObjectURL(file);
      draftObjectUrlRef.current = nextPreviewUrl;

      return {
        mode: 'new-photo',
        previewUrl: nextPreviewUrl,
        selectedFile: file,
        focusX: 50,
        focusY: 50,
        zoom: MIN_PROFILE_AVATAR_ZOOM,
        imageWidth: null,
        imageHeight: null,
      };
    });
  }

  function updateEditorTransform(focusX: number, focusY: number, zoom: number): void {
    setEditorState((currentEditor) =>
      currentEditor
        ? {
            ...currentEditor,
            focusX: clampAvatarFocus(focusX),
            focusY: clampAvatarFocus(focusY),
            zoom: clampAvatarZoom(zoom),
          }
        : currentEditor
    );
  }

  function updateEditorImageDimensions(width: number, height: number): void {
    setEditorState((currentEditor) =>
      currentEditor
        ? {
            ...currentEditor,
            imageWidth: width,
            imageHeight: height,
          }
        : currentEditor
    );
  }

  function getCropGeometry(
    editor: EditorState,
    cropSize: number
  ): {
    overflowX: number;
    overflowY: number;
    renderedWidth: number;
    renderedHeight: number;
  } {
    if (!editor.imageWidth || !editor.imageHeight || cropSize <= 0) {
      return {
        overflowX: 0,
        overflowY: 0,
        renderedWidth: cropSize,
        renderedHeight: cropSize,
      };
    }

    const coverScale = Math.max(
      cropSize / editor.imageWidth,
      cropSize / editor.imageHeight
    );
    const zoomScale = clampAvatarZoom(editor.zoom) / 100;
    const renderedWidth = editor.imageWidth * coverScale * zoomScale;
    const renderedHeight = editor.imageHeight * coverScale * zoomScale;

    return {
      overflowX: Math.max(0, renderedWidth - cropSize),
      overflowY: Math.max(0, renderedHeight - cropSize),
      renderedWidth,
      renderedHeight,
    };
  }

  function getFocusFromDelta(
    editor: EditorState,
    cropSize: number,
    deltaX: number,
    deltaY: number,
    startFocusX: number,
    startFocusY: number
  ): { focusX: number; focusY: number } {
    const geometry = getCropGeometry(editor, cropSize);
    const nextFocusX =
      geometry.overflowX > 0
        ? startFocusX - (deltaX / geometry.overflowX) * 100
        : 50;
    const nextFocusY =
      geometry.overflowY > 0
        ? startFocusY - (deltaY / geometry.overflowY) * 100
        : 50;

    return {
      focusX: clampAvatarFocus(nextFocusX),
      focusY: clampAvatarFocus(nextFocusY),
    };
  }

  function getCropSize(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();

    return Math.max(0, Math.min(rect.width, rect.height));
  }

  function handleCropPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!editorState || isSubmitting) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startFocusX: editorState.focusX,
      startFocusY: editorState.focusY,
    };
  }

  function handleCropPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const dragState = dragStateRef.current;

    if (!editorState || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const cropSize = getCropSize(event.currentTarget);
    const nextFocus = getFocusFromDelta(
      editorState,
      cropSize,
      event.clientX - dragState.startClientX,
      event.clientY - dragState.startClientY,
      dragState.startFocusX,
      dragState.startFocusY
    );

    updateEditorTransform(nextFocus.focusX, nextFocus.focusY, editorState.zoom);
  }

  function handleCropPointerEnd(event: PointerEvent<HTMLDivElement>): void {
    const dragState = dragStateRef.current;

    if (dragState?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  }

  function handleCropWheel(event: WheelEvent<HTMLDivElement>): void {
    if (!editorState || isSubmitting) {
      return;
    }

    event.preventDefault();

    const zoomDelta = event.deltaY > 0 ? -8 : 8;

    updateEditorTransform(
      editorState.focusX,
      editorState.focusY,
      editorState.zoom + zoomDelta
    );
  }

  function moveCropWithKeyboard(
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void {
    if (!editorState || isSubmitting) {
      return;
    }

    const step = event.shiftKey ? 8 : 3;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      updateEditorTransform(
        editorState.focusX - step,
        editorState.focusY,
        editorState.zoom
      );
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      updateEditorTransform(
        editorState.focusX + step,
        editorState.focusY,
        editorState.zoom
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      updateEditorTransform(
        editorState.focusX,
        editorState.focusY - step,
        editorState.zoom
      );
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      updateEditorTransform(
        editorState.focusX,
        editorState.focusY + step,
        editorState.zoom
      );
    }
  }

  function changeZoom(delta: number): void {
    if (!editorState) {
      return;
    }

    updateEditorTransform(
      editorState.focusX,
      editorState.focusY,
      editorState.zoom + delta
    );
  }

  async function refreshAfterAvatarChange(successMessage: string): Promise<void> {
    await refreshAuth();
    await onChanged();
    setMessage(successMessage);
  }

  async function handleSaveEditor(): Promise<void> {
    if (!editorState || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    if (editorState.mode === 'existing') {
      if (
        !focusChanged(
          editorState.focusX,
          editorState.focusY,
          editorState.zoom,
          currentFocusX,
          currentFocusY,
          currentZoom
        )
      ) {
        setIsSubmitting(false);
        closeEditor();
        return;
      }

      const saveResult = await saveProfileAvatarFocusAction(
        editorState.focusX,
        editorState.focusY,
        editorState.zoom
      );

      if (!saveResult.ok) {
        setIsSubmitting(false);
        setError(t('focusSaveFailedMessage'));
        return;
      }

      closeEditor();
      await refreshAfterAvatarChange(t('updatedMessage'));
      setIsSubmitting(false);
      return;
    }

    if (!editorState.selectedFile) {
      setIsSubmitting(false);
      return;
    }

    const uploadResult = await uploadProfileAvatarForProfile(
      profile.publicSlug,
      editorState.selectedFile
    );

    if (!uploadResult.ok) {
      setIsSubmitting(false);
      setError(
        uploadResult.reason === 'upload-failed'
          ? t('uploadFailedMessage')
          : getFileValidationMessage(uploadResult.reason, t)
      );
      return;
    }

    const saveResult = await saveProfileAvatarAction(
      uploadResult.storagePath,
      editorState.focusX,
      editorState.focusY,
      editorState.zoom
    );

    if (!saveResult.ok) {
      await cleanupUploadedProfileAvatar(uploadResult.storagePath);
      setIsSubmitting(false);
      setError(t('uploadFailedMessage'));
      return;
    }

    closeEditor();
    await refreshAfterAvatarChange(t('updatedMessage'));
    setIsSubmitting(false);
  }

  async function handleConfirmRemovePhoto(): Promise<void> {
    if (isSubmitting || !profile.avatarPath) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    const removeResult = await removeProfileAvatarAction();

    if (!removeResult.ok) {
      setIsSubmitting(false);
      setError(t('removeFailedMessage'));
      return;
    }

    setRemoveDialogOpen(false);
    closeEditor();
    await refreshAfterAvatarChange(t('removedMessage'));
    setIsSubmitting(false);
  }

  const canRemovePhoto = Boolean(profile.avatarPath) && !editorState;
  const editorSaveLabel =
    editorState?.mode === 'existing'
      ? t('savePositionButton')
      : t('saveButton');

  return (
    <section className="profile-photo-manager" aria-labelledby="profile-photo-title">
      <div className="profile-photo-preview">
        {profile.avatarPath ? (
          <button
            type="button"
            className="profile-photo-avatar-button"
            onClick={openExistingEditor}
            aria-label={t('adjustButton')}
            disabled={isSubmitting}
          >
            <ProfileAvatar
              avatarPath={profile.avatarPath}
              displayName={displayName}
              size="large"
              focusX={currentFocusX}
              focusY={currentFocusY}
              zoom={currentZoom}
            />
          </button>
        ) : (
          <ProfileAvatar
            avatarPath={profile.avatarPath}
            displayName={displayName}
            size="large"
            focusX={currentFocusX}
            focusY={currentFocusY}
            zoom={currentZoom}
          />
        )}
      </div>
      <div className="profile-photo-controls">
        <h4 id="profile-photo-title">{t('label')}</h4>
        <p className="account-help-text">
          {t('requirementsMessage')}
        </p>
        <div className="profile-photo-main-actions">
          <label
            className="profile-photo-button profile-photo-button--secondary"
            htmlFor={inputId}
          >
            {profile.avatarPath
              ? t('changeButton')
              : t('chooseButton')}
          </label>
          {canRemovePhoto ? (
            <button
              type="button"
              className="profile-photo-button profile-photo-button--danger-secondary"
              onClick={() => {
                setError('');
                setMessage('');
                setRemoveDialogOpen(true);
              }}
              disabled={isSubmitting}
            >
              {t('removeButton')}
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          id={inputId}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={isSubmitting}
        />
        {message ? (
          <p className="account-status-message account-status-message--success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="account-status-message account-status-message--error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {editorState ? (
        <div
          className="avatar-viewer-backdrop"
          role="presentation"
          onClick={() => {
            if (!isSubmitting) {
              closeEditor();
            }
          }}
        >
          <div
            className="avatar-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-editor-title"
            aria-describedby={editorTextareaLabelId}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="avatar-dialog-close"
              onClick={closeEditor}
              disabled={isSubmitting}
            >
              {listingDetailGalleryT('closeViewer')}
            </button>
            <div className="avatar-editor-content">
              <div className="avatar-editor-copy">
                <h2 id="avatar-editor-title">
                  {editorState.mode === 'existing'
                    ? t('adjustButton')
                    : t('previewTitle')}
                </h2>
                <p id={editorTextareaLabelId}>
                  {t('previewHelp')}
                </p>
              </div>

              <div
                className="avatar-focus-preview"
                role="application"
                tabIndex={0}
                aria-label={t('positionControlLabel')}
                onKeyDown={moveCropWithKeyboard}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerEnd}
                onPointerCancel={handleCropPointerEnd}
                onWheel={handleCropWheel}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={editorState.previewUrl}
                  alt=""
                  draggable={false}
                  onLoad={(event) =>
                    updateEditorImageDimensions(
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight
                    )
                  }
                  style={{
                    objectPosition: `${editorState.focusX}% ${editorState.focusY}%`,
                    transform: `scale(${editorState.zoom / 100})`,
                    transformOrigin: `${editorState.focusX}% ${editorState.focusY}%`,
                  }}
                />
              </div>

              <div className="avatar-editor-hint">
                {t('dragZoomHelp')}
              </div>

              <div className="avatar-focus-controls">
                <div className="avatar-zoom-buttons" aria-label={t('zoomControlsLabel')}>
                  <button
                    type="button"
                    className="profile-photo-button profile-photo-button--secondary profile-photo-button--compact"
                    onClick={() => changeZoom(-15)}
                    disabled={
                      isSubmitting ||
                      editorState.zoom <= MIN_PROFILE_AVATAR_ZOOM
                    }
                    aria-label={t('zoomOutButton')}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="profile-photo-button profile-photo-button--secondary profile-photo-button--compact"
                    onClick={() => changeZoom(15)}
                    disabled={
                      isSubmitting ||
                      editorState.zoom >= MAX_PROFILE_AVATAR_ZOOM
                    }
                    aria-label={t('zoomInButton')}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="profile-photo-button profile-photo-button--secondary"
                  onClick={() =>
                    updateEditorTransform(50, 50, MIN_PROFILE_AVATAR_ZOOM)
                  }
                  disabled={isSubmitting}
                >
                  {t('resetFocusButton')}
                </button>
              </div>

              <div className="profile-photo-action-row">
                <button
                  type="button"
                  className="profile-photo-button profile-photo-button--primary"
                  onClick={handleSaveEditor}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? t('uploadingMessage')
                    : editorSaveLabel}
                </button>
                <button
                  type="button"
                  className="profile-photo-button profile-photo-button--secondary"
                  onClick={closeEditor}
                  disabled={isSubmitting}
                >
                  {listingReportT('cancelButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {removeDialogOpen ? (
        <div
          className="message-confirmation-backdrop"
          role="presentation"
          onClick={() => {
            if (!isSubmitting) {
              setRemoveDialogOpen(false);
            }
          }}
        >
          <div
            className="message-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-profile-photo-title"
            aria-describedby="remove-profile-photo-description"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="remove-profile-photo-title">
              {t('removeConfirmTitle')}
            </h2>
            <p id="remove-profile-photo-description">
              {t('removeConfirmMessage')}
            </p>
            <div className="message-confirmation-actions">
              <button
                ref={removeCancelRef}
                type="button"
                className="message-confirmation-button message-confirmation-button--secondary"
                onClick={() => setRemoveDialogOpen(false)}
                disabled={isSubmitting}
              >
                {listingReportT('cancelButton')}
              </button>
              <button
                type="button"
                className="message-confirmation-button message-confirmation-button--destructive"
                onClick={() => void handleConfirmRemovePhoto()}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t('uploadingMessage')
                  : t('removeButton')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
