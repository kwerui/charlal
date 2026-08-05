import { notFound } from 'next/navigation';
import ListingDetailView from '@/app/components/ListingDetailView';
import { content } from '@/content/tyv';
import { listings } from '@/data/listings';
import { getListingFallbackResultsHref } from '@/lib/listingRoutes';
import { getSafeResultsHref } from '@/lib/resultReturnHref';
import LocalListingDetail from './LocalListingDetail';

type ListingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ListingPage({ params, searchParams }: ListingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const listing = listings.find((item) => String(item.id) === id);
  const safeFromHref = getSafeResultsHref(query.from);

  if (!listing) {
    if (id.startsWith('local-')) {
      return (
        <LocalListingDetail
          id={id}
          safeFromHref={safeFromHref}
          categories={content.categories}
        />
      );
    }

    notFound();
  }

  const backHref = safeFromHref || getListingFallbackResultsHref(listing);

  return (
    <div className="app-container">
      <ListingDetailView
        listing={listing}
        categories={content.categories}
        backHref={backHref}
      />
    </div>
  );
}
