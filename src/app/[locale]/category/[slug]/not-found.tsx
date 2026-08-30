import { Link } from '@/i18n/navigation';
import { content } from '@/content/tyv';

export default function CategoryNotFound() {
  return (
    <div className="app-container">
      <section className="category-page">
        <Link href="/" className="page-back-link">
          {content.backToHome}
        </Link>

        <h2 className="page-title">{content.notFoundTitle}</h2>
        <p className="page-description">{content.notFoundMessage}</p>
      </section>
    </div>
  );
}
