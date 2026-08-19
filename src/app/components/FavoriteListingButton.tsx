'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  removeFavoriteAction,
  saveFavoriteAction,
} from '@/app/favorites/actions';
import { content } from '@/content/tyv';
import {
  getListingFavoriteKey,
  type ListingFavoriteReference,
} from '@/lib/listingFavoriteKeys';
import { useAuthStatus } from '@/lib/auth/client';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';

type Props = {
  reference: ListingFavoriteReference;
  initiallySaved: boolean;
  initiallySavedForUserId?: string | null;
  variant?: 'card' | 'detail';
  returnHref?: string;
  onRemoved?: () => void;
};

const PENDING_FAVORITE_INTENT_KEY = 'charlal:pending-favorite-intent';
const PENDING_FAVORITE_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

type PendingFavoriteIntent = {
  key: string;
  reference: ListingFavoriteReference;
  createdAt: number;
};

function getSafeCurrentHref(pathname: string, searchParams: URLSearchParams): string {
  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

function isPendingFavoriteIntent(value: unknown): value is PendingFavoriteIntent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const intent = value as Partial<PendingFavoriteIntent>;
  const reference = intent.reference as
    | Partial<ListingFavoriteReference>
    | undefined;

  return (
    typeof intent.key === 'string' &&
    typeof intent.createdAt === 'number' &&
    Boolean(reference) &&
    (reference?.source === 'database' || reference?.source === 'builtin') &&
    typeof reference?.listingId === 'string'
  );
}

function savePendingFavoriteIntent(reference: ListingFavoriteReference): void {
  if (typeof window === 'undefined') {
    return;
  }

  const intent: PendingFavoriteIntent = {
    key: getListingFavoriteKey(reference),
    reference,
    createdAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(
      PENDING_FAVORITE_INTENT_KEY,
      JSON.stringify(intent)
    );
  } catch {
    // The redirect still works if session storage is unavailable.
  }
}

function takeMatchingPendingFavoriteIntent(
  favoriteKey: string
): ListingFavoriteReference | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawIntent = window.sessionStorage.getItem(
      PENDING_FAVORITE_INTENT_KEY
    );

    if (!rawIntent) {
      return null;
    }

    const parsedIntent: unknown = JSON.parse(rawIntent);

    if (!isPendingFavoriteIntent(parsedIntent)) {
      window.sessionStorage.removeItem(PENDING_FAVORITE_INTENT_KEY);
      return null;
    }

    const intentIsFresh =
      Date.now() - parsedIntent.createdAt <= PENDING_FAVORITE_INTENT_MAX_AGE_MS;

    if (!intentIsFresh) {
      window.sessionStorage.removeItem(PENDING_FAVORITE_INTENT_KEY);
      return null;
    }

    if (parsedIntent.key !== favoriteKey) {
      return null;
    }

    window.sessionStorage.removeItem(PENDING_FAVORITE_INTENT_KEY);

    return parsedIntent.reference;
  } catch {
    window.sessionStorage.removeItem(PENDING_FAVORITE_INTENT_KEY);
    return null;
  }
}

export default function FavoriteListingButton({
  reference,
  initiallySaved,
  initiallySavedForUserId = null,
  variant = 'card',
  returnHref,
  onRemoved,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status, user } = useAuthStatus();
  const [savedForUserId, setSavedForUserId] = useState<string | null>(
    initiallySaved ? initiallySavedForUserId : null
  );
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const mutationInFlightRef = useRef(false);
  const favoriteKey = useMemo(() => getListingFavoriteKey(reference), [
    reference,
  ]);
  const activeUserId =
    status === 'authenticated' && user ? user.id : null;
  const isSaved = Boolean(activeUserId && savedForUserId === activeUserId);
  const displayedError = status === 'authenticated' ? error : '';
  const buttonLabel = isSaved
    ? content.removeSavedAdvertisementButton
    : content.saveAdvertisementButton;
  const visibleLabel =
    isSaved
      ? content.savedAdvertisementButton
      : content.saveAdvertisementShortButton;
  const signInReturnHref = getSafeNextPath(
    returnHref || getSafeCurrentHref(pathname, searchParams),
    '/'
  );

  useEffect(() => {
    if (mutationInFlightRef.current) {
      return;
    }

    setSavedForUserId(initiallySaved ? initiallySavedForUserId : null);
  }, [favoriteKey, initiallySaved, initiallySavedForUserId]);

  useEffect(() => {
    if (!activeUserId || isSaved || isPending || mutationInFlightRef.current) {
      return;
    }

    const pendingReference = takeMatchingPendingFavoriteIntent(favoriteKey);

    if (!pendingReference) {
      return;
    }

    startTransition(async () => {
      mutationInFlightRef.current = true;

      try {
        const result = await saveFavoriteAction(pendingReference);

        if (!result.ok) {
          setError(
            result.reason === 'auth-required'
              ? content.signInToSaveAdvertisementMessage
              : content.unableUpdateSavedAdvertisementMessage
          );
          return;
        }

        setSavedForUserId(activeUserId);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Favorite save failed.', error);
        }

        setError(content.unableUpdateSavedAdvertisementMessage);
      } finally {
        mutationInFlightRef.current = false;
      }
    });
  }, [activeUserId, favoriteKey, isPending, isSaved]);

  function handleToggle(): void {
    if (mutationInFlightRef.current) {
      return;
    }

    setError('');

    if (status !== 'authenticated' || !activeUserId) {
      if (!isSaved) {
        savePendingFavoriteIntent(reference);
      }

      router.push(`/sign-in?next=${encodeURIComponent(signInReturnHref)}`);
      return;
    }

    startTransition(async () => {
      mutationInFlightRef.current = true;

      try {
        const result = isSaved
          ? await removeFavoriteAction(reference)
          : await saveFavoriteAction(reference);

        if (!result.ok) {
          setError(
            result.reason === 'auth-required'
              ? content.signInToSaveAdvertisementMessage
              : content.unableUpdateSavedAdvertisementMessage
          );

          if (result.reason === 'auth-required') {
            router.push(`/sign-in?next=${encodeURIComponent(signInReturnHref)}`);
          }

          return;
        }

        if (isSaved) {
          setSavedForUserId(null);
          onRemoved?.();
        } else {
          setSavedForUserId(activeUserId);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Favorite toggle failed.', error);
        }

        setError(content.unableUpdateSavedAdvertisementMessage);
      } finally {
        mutationInFlightRef.current = false;
      }
    });
  }

  return (
    <div
      className={
        variant === 'detail'
          ? 'favorite-control favorite-control--detail'
          : 'favorite-control favorite-control--card'
      }
    >
      <button
        type="button"
        className={
          isSaved
            ? 'favorite-button favorite-button--saved'
            : 'favorite-button'
        }
        onClick={handleToggle}
        disabled={isPending || status === 'checking'}
        aria-pressed={isSaved}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <span className="favorite-button-icon" aria-hidden="true">
          {isSaved ? '♥' : '♡'}
        </span>
        {visibleLabel ? (
          <span className="favorite-button-label">{visibleLabel}</span>
        ) : null}
      </button>
      {displayedError ? (
        <p className="favorite-error" role="alert">
          {displayedError}
        </p>
      ) : null}
    </div>
  );
}
