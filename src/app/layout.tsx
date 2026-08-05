import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';
import ToastProvider from '@/components/ToastProvider';

export const metadata: Metadata = {
  title: 'REI Grove Outreach',
  description: 'Cold outreach pipeline for REI Grove partnership and affiliate prospects.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <ToastProvider />
      </body>
    </html>
  );
}
