import Form from 'next/form';
import { content } from '@/content/tyv';
import { getPathname } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';

type Props = {
  defaultQuery?: string;
  sectionClassName?: string;
};

export default async function SearchForm({
  defaultQuery = '',
  sectionClassName = 'search-section',
}: Props) {
  const locale = await getLocale();

  return (
    <section className={sectionClassName}>
      <Form action={getPathname({ href: '/search', locale })} className="search-container">
        <input
          type="search"
          name="q"
          className="search-input"
          placeholder={content.searchPlaceholder}
          aria-label={content.searchInputLabel}
          defaultValue={defaultQuery}
          required
        />
        <button type="submit" className="search-button">
          {content.searchButton}
        </button>
      </Form>
    </section>
  );
}
