import { redirect } from 'next/navigation';
import { content } from '@/content/tyv';
import { getCurrentUserResult } from '@/lib/auth/server';
import { countCurrentUserUnreadConversations } from '@/lib/supabase/messagingServer';
import { listOwnedDatabaseListingsForOwner } from '@/lib/supabase/listingsServer';
import AccountDashboard from './AccountDashboard';

export default async function AccountPage() {
  const authResult = await getCurrentUserResult();

  if (authResult.status === 'signed-out') {
    redirect('/sign-in?next=/account');
  }

  const ownedListingsResult =
    authResult.status === 'authenticated'
      ? await listOwnedDatabaseListingsForOwner(authResult.user.id)
      : null;
  const unreadCountResult =
    authResult.status === 'authenticated'
      ? await countCurrentUserUnreadConversations()
      : null;

  return (
    <main className="account-page">
      <section className="account-panel" aria-labelledby="account-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{content.accountKicker}</p>
          <h2 id="account-title" className="auth-title">
            {content.accountTitle}
          </h2>
        </div>
        <AccountDashboard
          initialAuthStatus={
            authResult.status === 'authenticated' ? 'signed-in' : 'unresolved'
          }
          initialUser={
            authResult.status === 'authenticated' ? authResult.user : null
          }
          initialOwnedListings={
            ownedListingsResult?.ok ? ownedListingsResult.listings : []
          }
          initialListingsLoaded={Boolean(ownedListingsResult)}
          initialListingsError={Boolean(
            ownedListingsResult && !ownedListingsResult.ok
          )}
          initialUnreadConversationCount={
            unreadCountResult?.ok ? unreadCountResult.count : 0
          }
        />
      </section>
    </main>
  );
}
