import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dugout FC — Soccer club management for coaches',
  description: 'Schedules, RSVPs, lineups, and parent communication — one app for soccer coaches. Free for founding clubs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${jakarta.variable}`}>
      <body className="min-h-full flex flex-col bg-[#080808] text-[#f0f0f0]">{children}</body>
    </html>
  );
}
