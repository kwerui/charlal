import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  const listingDetailT = await getTranslations('ListingDetail');

  return (
    <div className="app-container">
      <section className="category-page">
        <Link href="/" className="page-back-link">
          {listingDetailT('backToHomepage')}
        </Link>

        <h1 className="page-title">{t('title')}</h1>
        <p className="page-description">{t('message')}</p>
      </section>
    </div>
  );
}
