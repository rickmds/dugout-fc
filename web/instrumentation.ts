import * as Sentry from '@sentry/nextjs';

// No-ops safely if NEXT_PUBLIC_SENTRY_DSN is unset — safe to ship before a
// Sentry project exists, and starts reporting the moment the DSN is added.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
