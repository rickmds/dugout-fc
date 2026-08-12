'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full flex flex-col items-center justify-center bg-[#080808] text-[#f0f0f0] p-8">
        <div className="text-center max-w-sm">
          <p className="text-2xl mb-2">⚽</p>
          <h1 className="text-lg font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-[#9ca3af] mb-6">We&apos;ve been notified and are looking into it.</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-[#22c55e] text-black text-sm font-bold hover:bg-[#1ea34e] transition-all"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
