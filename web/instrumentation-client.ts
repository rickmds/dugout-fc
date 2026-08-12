import * as Sentry from '@sentry/nextjs';

// No-ops safely if NEXT_PUBLIC_SENTRY_DSN is unset.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
