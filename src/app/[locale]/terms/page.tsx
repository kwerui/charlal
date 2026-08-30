import type { Metadata } from 'next';
import { content } from '@/content/tyv';

export const metadata: Metadata = {
  title: `${content.termsPageTitle} | Charlal`,
};

export default function TermsPage() {
  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="terms-title">
        <p className="hero-kicker">{content.legalPageKicker}</p>
        <h1 id="terms-title">{content.termsPageTitle}</h1>
        <p className="info-page-intro">{content.termsPageIntro}</p>

        <div className="info-section-list">
          {content.termsSections.map((section) => (
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
