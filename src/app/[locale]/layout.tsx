import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { hasLocale } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { AuthProvider } from '@/lib/auth/client';
import { MessagingRealtimeProvider } from '@/lib/messagingRealtime';
import { routing } from '@/i18n/routing';
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Charlal.org",
  description: "",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <NextIntlClientProvider>
          <AuthProvider>
            <MessagingRealtimeProvider>
              <Suspense fallback={null}>
                <SiteHeader />
              </Suspense>
              {children}
              <SiteFooter />
            </MessagingRealtimeProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
