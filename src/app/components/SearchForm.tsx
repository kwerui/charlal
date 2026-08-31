import Form from 'next/form';
import { getPathname } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

type Props = {
  defaultQuery?: string;
  sectionClassName?: string;
};

export default async function SearchForm({
  defaultQuery = '',
  sectionClassName = 'search-section',
}: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Search');

  return (
    <section className={sectionClassName}>
      <Form action={getPathname({ href: '/search', locale })} className="search-container">
        <input
          type="search"
          name="q"
          className="search-input"
          placeholder={t('placeholder')}
          aria-label={t('inputLabel')}
          defaultValue={defaultQuery}
          required
        />
        <button type="submit" className="search-button">
          {t('button')}
        </button>
      </Form>
    </section>
  );
}
