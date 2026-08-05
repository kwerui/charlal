import { content } from '@/content/tyv';
import AccountDashboard from './AccountDashboard';

export default function AccountPage() {
  return (
    <main className="account-page">
      <section className="account-panel" aria-labelledby="account-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{content.accountKicker}</p>
          <h2 id="account-title" className="auth-title">
            {content.accountTitle}
          </h2>
        </div>
        <AccountDashboard />
      </section>
    </main>
  );
}
