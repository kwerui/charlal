import { Link } from '@/i18n/navigation';
import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getListingStatus } from '@/data/listings';
import { getSignInHref, localizePath } from '@/i18n/localePath';
import { getCurrentUserResult } from '@/lib/auth/server';
import {
  findConversationIdForListing,
} from '@/lib/supabase/messagingServer';
import { getPublicDatabaseListingById } from '@/lib/supabase/listingsServer';
import ContactSellerForm from './ContactSellerForm';

type ContactSellerPageProps = {
  params: Promise<{ locale: string; listingId: string }>;
};

export default async function ContactSellerPage({
  params,
}: ContactSellerPageProps) {
  const { locale, listingId } = await params;
  const nextPath = `/contact/${encodeURIComponent(listingId)}`;
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect(getSignInHref(nextPath, locale));
  }

  if (authResult.status !== 'authenticated') {
    return (
      <main className="form-page">
        <section className="form-panel" aria-labelledby="contact-seller-title">
          <div className="empty-results" role="alert">
            <h1 id="contact-seller-title">{content.unableStartConversationMessage}</h1>
            <p>{content.authNetworkFailureMessage}</p>
          </div>
        </section>
      </main>
    );
  }

  const listingResult = await getPublicDatabaseListingById(listingId);

  if (!listingResult.ok || !listingResult.listing) {
    return (
      <main className="form-page">
        <section className="form-panel" aria-labelledby="contact-seller-title">
          <div className="empty-results" role="status">
            <h1 id="contact-seller-title">{content.unableStartConversationMessage}</h1>
            <p>{content.editAdvertisementNotFoundTitle}</p>
          </div>
        </section>
      </main>
    );
  }

  const listing = listingResult.listing;
  const listingStatus = getListingStatus(listing);

  if (listingStatus === 'sold' || listingStatus === 'archived') {
    return (
      <main className="form-page">
        <section className="form-panel" aria-labelledby="contact-seller-title">
          <div className="empty-results" role="status">
            <h1 id="contact-seller-title">{content.messageSellerTitle}</h1>
            <p>
              {listingStatus === 'sold'
                ? content.listingSoldMessagingUnavailableMessage
                : content.listingArchivedMessagingUnavailableMessage}
            </p>
            <Link href={`/listing/${listing.id}`} className="secondary-button edit-listing-state-link">
              {content.backToResults}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (listing.isOwnedByViewer) {
    return (
      <main className="form-page">
        <section className="form-panel" aria-labelledby="contact-seller-title">
          <div className="empty-results" role="status">
            <h1 id="contact-seller-title">{content.messageSellerTitle}</h1>
            <p>{content.messagingCannotMessageSelfMessage}</p>
            <Link href={`/listing/${listing.id}`} className="secondary-button edit-listing-state-link">
              {content.backToResults}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const existingConversation = await findConversationIdForListing(
    listingId,
    authResult.user.id
  );

  if (existingConversation.ok) {
    redirect(localizePath(`/account/messages/${existingConversation.conversationId}`, locale));
  }

  return (
    <main className="form-page">
      <section className="form-panel" aria-labelledby="contact-seller-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{content.messagesTitle}</p>
          <h1 id="contact-seller-title" className="auth-title">
            {content.messageSellerTitle}
          </h1>
        </div>
        <div className="contact-listing-summary">
          <h2>{listing.title}</h2>
          <p>
            <span>{content.listingDetailSellerLabel}</span>
            <strong>{listing.sellerName}</strong>
          </p>
        </div>
        <ContactSellerForm listingId={String(listing.id)} />
      </section>
    </main>
  );
}
