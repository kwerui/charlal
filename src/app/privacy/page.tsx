import type { Metadata } from 'next';
import { content } from '@/content/tyv';

export const metadata: Metadata = {
  title: `${content.privacyPageTitle} | Charlal`,
};

export default function PrivacyPage() {
  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="privacy-title">
        <p className="hero-kicker">{content.legalPageKicker}</p>
        <h1 id="privacy-title">{content.privacyPageTitle}</h1>
        <p className="info-page-intro">{content.privacyPageIntro}</p>

        <div className="info-section-list">
          {content.privacyPolicySections.map((section) => (
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
