import { content } from '@/content/tyv';
import PostAdForm from './PostAdForm';

export default function PostAdPage() {
  return (
    <main className="form-page form-page--listing-editor">
      <section
        className="form-panel form-panel--listing-editor"
        aria-labelledby="post-ad-title"
      >
        <div className="form-page-heading">
          <h1 id="post-ad-title" className="auth-title">
            {content.postAdTitle}
          </h1>
        </div>
        <PostAdForm categories={content.categories} />
      </section>
    </main>
  );
}
