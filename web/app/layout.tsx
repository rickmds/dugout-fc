import type { Metadata } from 'next';
import { Fredoka, Inter } from 'next/font/google';
import './globals.css';

// Display face for headlines — warm, rounded, friendly (the "approachable
// SaaS" direction) rather than a sharp/technical sans.
const displayFont = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

// Body copy — kept to a clean, highly-legible sans so long paragraphs of
// marketing copy stay easy to read at small sizes.
const bodyFont = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pulse FC — Soccer club management for coaches',
  description: 'Schedules, RSVPs, lineups, and parent communication — one app for soccer coaches. Free for founding clubs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${displayFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-full flex flex-col bg-[#FAF7F1] text-[#2B2420]">{children}</body>
    </html>
  );
}
