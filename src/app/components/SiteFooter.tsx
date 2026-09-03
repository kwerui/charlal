import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function SiteFooter() {
  const t = useTranslations('Footer');
  const currentYear = new Date().getFullYear();
  const footerLinks = [
    { href: '/about', label: t('aboutLink') },
    { href: '/terms', label: t('termsLink') },
    { href: '/privacy', label: t('privacyLink') },
    { href: '/contact', label: t('contactLink') },
  ];

  return (
    <footer className="site-footer" aria-label={t('label')}>
      <nav className="site-footer-nav" aria-label={t('navLabel')}>
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
