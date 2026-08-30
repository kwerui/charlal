import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getSignInHref } from '@/i18n/localePath';
import { getCurrentViewerId } from '@/lib/auth/server';
import { getSafeEditReturnHref } from '@/lib/resultReturnHref';
import { getOwnedDatabaseListingById } from '@/lib/supabase/listingsServer';
import EditListingForm from './EditListingForm';

type EditListingPageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function EditListingPage({
  params,
  searchParams,
}: EditListingPageProps) {
  const { locale, id } = await params;
  const query = await searchParams;
  const editPathname = `/account/listings/${id}/edit`;
  const editOrigin = getSafeEditReturnHref(query.from, editPathname);
  const viewer = await getCurrentViewerId();

  if (viewer.status === 'signed-out') {
    redirect(getSignInHref(editPathname, locale));
  }

  const databaseListingResult = await getOwnedDatabaseListingById(
    id,
    viewer.status === 'signed-in' ? viewer.userId : ''
  );
  const initialEditState =
    viewer.status === 'unresolved'
      ? 'checking'
      : !databaseListingResult.ok
      ? 'unavailable'
      : !databaseListingResult.listing
      ? 'not-found'
      : 'ready';
  const initialListing =
    initialEditState === 'ready' && databaseListingResult.ok
      ? databaseListingResult.listing
      : null;

  return (
    <main className="form-page form-page--listing-editor">
      <section
        className="form-panel form-panel--listing-editor"
        aria-labelledby="edit-listing-title"
      >
        <div className="form-page-heading">
          <h1 id="edit-listing-title" className="auth-title">
            {content.editAdvertisementTitle}
          </h1>
        </div>
        <EditListingForm
          id={id}
          categories={content.categories}
          initialEditStatus={initialEditState}
          initialListing={initialListing}
          editOrigin={editOrigin}
        />
      </section>
    </main>
  );
}
