import type { Metadata } from 'next';
import { content } from '@/content/tyv';

export const metadata: Metadata = {
  title: `${content.aboutPageTitle} | Charlal`,
};

export default function AboutPage() {
  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="about-title">
        <p className="hero-kicker">{content.aboutPageKicker}</p>
        <h1 id="about-title">{content.aboutPageTitle}</h1>
        <div className="info-section-list">
          {content.aboutPageBody.map((paragraph) => (
            <p key={paragraph} className="info-page-intro">
              {paragraph}
            </p>
          ))}
        </div>
      </article>
    </main>
  );
}
