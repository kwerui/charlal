import { content } from '@/content/tyv';
import PostAdForm from './PostAdForm';

export default function PostAdPage() {
  return (
    <main className="form-page">
      <section className="form-panel" aria-labelledby="post-ad-title">
        <div className="form-page-heading">
          <p className="hero-kicker">{content.postAdKicker}</p>
          <h2 id="post-ad-title" className="auth-title">
            {content.postAdTitle}
          </h2>
        </div>
        <PostAdForm categories={content.categories} />
      </section>
    </main>
  );
}
