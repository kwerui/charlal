import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ContactPage');

  return {
    title: `${t('title')} | Charlal`,
  };
}

export default async function ContactPage() {
  const t = await getTranslations('ContactPage');

  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="contact-title">
        <p className="hero-kicker">{t('kicker')}</p>
        <h1 id="contact-title">{t('title')}</h1>
        <p className="info-page-intro">{t('intro')}</p>

        <section className="info-section">
          <h2>{t('detailsTitle')}</h2>
          <p>{t('detailsPlaceholder')}</p>
        </section>
      </article>
    </main>
  );
}
