import Link from 'next/link';
import { content } from '@/content/tyv';

export default function NotFound() {
  return (
    <div className="app-container">
      <section className="category-page">
        <Link href="/" className="page-back-link">
          {content.backToHome}
        </Link>

        <h1 className="page-title">{content.notFoundTitle}</h1>
        <p className="page-description">{content.notFoundMessage}</p>
      </section>
    </div>
  );
}
