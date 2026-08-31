import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type InfoSection = {
  title: string;
  body: string;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('TermsPage');

  return {
    title: `${t('title')} | Charlal`,
  };
}

export default async function TermsPage() {
  const t = await getTranslations('TermsPage');
  const sections = t.raw('sections') as InfoSection[];

  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="terms-title">
        <p className="hero-kicker">{t('kicker')}</p>
        <h1 id="terms-title">{t('title')}</h1>
        <p className="info-page-intro">{t('intro')}</p>

        <div className="info-section-list">
          {sections.map((section) => (
            <section key={section.title} className="info-section">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
