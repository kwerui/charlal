import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';
import { getCurrentViewerId } from '@/lib/auth/server';
import { getPublicDatabaseListingById } from '@/lib/supabase/listingsServer';
import EditListingForm from './EditListingForm';

type EditListingPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditListingPage({ params }: EditListingPageProps) {
  const { id } = await params;
  const viewer = await getCurrentViewerId();

  if (viewer.status === 'signed-out') {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/account/listings/${id}/edit`)}`
    );
  }

  const builtInListing = listings.find((listing) => String(listing.id) === id);
  const databaseListingResult = builtInListing
    ? { ok: true as const, listing: null }
    : await getPublicDatabaseListingById(id);
  const initialEditState =
    viewer.status === 'unresolved'
      ? 'checking'
      : !databaseListingResult.ok
      ? 'unavailable'
      : !databaseListingResult.listing
      ? builtInListing
        ? 'not-owned'
        : 'not-found'
      : databaseListingResult.listing.ownerId === viewer.userId
      ? 'ready'
      : 'not-owned';
  const initialListing =
    initialEditState === 'ready' && databaseListingResult.ok
      ? databaseListingResult.listing
      : null;

  return (
    <main className="form-page">
      <section className="form-panel" aria-labelledby="edit-listing-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{content.accountKicker}</p>
          <h2 id="edit-listing-title" className="auth-title">
            {content.editAdvertisementTitle}
          </h2>
        </div>
        <EditListingForm
          id={id}
          categories={content.categories}
          initialEditStatus={initialEditState}
          initialListing={initialListing}
        />
      </section>
    </main>
  );
}
