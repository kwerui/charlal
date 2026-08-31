import type { Metadata } from "next";
import { getTranslations } from 'next-intl/server';
import ReactMarkdown from "react-markdown";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AboutPage');

  return {
    title: `${t('title')} | Charlal`,
  };
}

export default async function AboutPage() {
  const t = await getTranslations('AboutPage');
  const body = t.raw('body') as string[];

  return (
    <main className="info-page">
      <article className="info-page-panel" aria-labelledby="about-title">
        <p className="hero-kicker">{t('kicker')}</p>

        <h1 id="about-title">{t('title')}</h1>

        <div className="info-section-list">
          {body.map((paragraph) => (
            <div key={paragraph}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p className="info-page-intro">{children}</p>
                  ),
                }}
              >
                {paragraph}
              </ReactMarkdown>
            </div>
          ))}
        </div>
      </article>
    </main>
  );
}
