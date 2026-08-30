import type { Metadata } from 'next';
import { content } from '@/content/tyv';

export const metadata: Metadata = {
  title: `${content.contactPageTitle} | Charlal`,
};

export default function ContactPage() {
  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="contact-title">
        <p className="hero-kicker">{content.contactPageKicker}</p>
        <h1 id="contact-title">{content.contactPageTitle}</h1>
        <p className="info-page-intro">{content.contactPageIntro}</p>

        <section className="info-section">
          <h2>{content.contactDetailsTitle}</h2>
          <p>{content.contactDetailsPlaceholder}</p>
        </section>
      </article>
    </main>
  );
}
