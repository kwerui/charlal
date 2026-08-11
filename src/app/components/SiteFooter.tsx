import Link from 'next/link';
import { content } from '@/content/tyv';

const footerLinks = [
  { href: '/about', label: content.footerAboutLink },
  { href: '/terms', label: content.footerTermsLink },
  { href: '/privacy', label: content.footerPrivacyLink },
  { href: '/contact', label: content.footerContactLink },
];

export default function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer" aria-label={content.siteFooterLabel}>
      <nav className="site-footer-nav" aria-label={content.siteFooterNavLabel}>
        {footerLinks.map((link) => (
          <Link key={link.href} href={link.href} className="site-footer-link">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="site-footer-copyright">
        © {currentYear} Charlal
      </p>
    </footer>
  );
}
