import { getTranslations } from 'next-intl/server';
import { buildListingFormCategories } from '@/lib/listingFormCategories';
import PostAdForm from './PostAdForm';

export default async function PostAdPage() {
  const t = await getTranslations('PostAd');
  const categoriesT = await getTranslations('Categories');

  return (
    <main className="form-page form-page--listing-editor">
      <section
        className="form-panel form-panel--listing-editor"
        aria-labelledby="post-ad-title"
      >
        <div className="form-page-heading">
          <h1 id="post-ad-title" className="auth-title">
            {t('title')}
          </h1>
        </div>
        <PostAdForm categories={buildListingFormCategories(categoriesT)} />
      </section>
    </main>
  );
}
