import { content } from '@/content/tyv';
import EditListingForm from './EditListingForm';

type EditListingPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditListingPage({ params }: EditListingPageProps) {
  const { id } = await params;

  return (
    <main className="form-page">
      <section className="form-panel" aria-labelledby="edit-listing-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{content.accountKicker}</p>
          <h2 id="edit-listing-title" className="auth-title">
            {content.editAdvertisementTitle}
          </h2>
        </div>
        <EditListingForm id={id} categories={content.categories} />
      </section>
    </main>
  );
}
