import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NativeHistoryIntentMarker from './components/NativeHistoryIntentMarker';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import { AuthProvider } from '@/lib/auth/client';
import { MessagingRealtimeProvider } from '@/lib/messagingRealtime';
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AuthProvider>
          <MessagingRealtimeProvider>
            <NativeHistoryIntentMarker />
            <SiteHeader />
            {children}
            <SiteFooter />
          </MessagingRealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
