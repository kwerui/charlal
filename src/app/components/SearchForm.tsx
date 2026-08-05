import Form from 'next/form';
import { content } from '@/content/tyv';

type Props = {
  defaultQuery?: string;
  sectionClassName?: string;
};

export default function SearchForm({
  defaultQuery = '',
  sectionClassName = 'search-section',
}: Props) {
  return (
    <section className={sectionClassName}>
      <Form action="/search" className="search-container">
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
