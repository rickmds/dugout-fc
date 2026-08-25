// Shared timeout-race helper. Wraps a promise so a stalled network call
// (common on flaky/cold-launch or one-bar-of-signal connectivity) doesn't
// hang forever — the call resolves to the TIMEOUT sentinel if `ms` elapses
// before the original promise settles, so a caller can treat "took too
// long" the same way it treats a genuine failure/timeout and retry or
// surface an error from a single terminal state, instead of the request
// just stalling indefinitely.
//
// Originally lived in hooks/useAuth.tsx (session restore) and was
// hand-rolled a second time in lib/authRouting.ts (post-auth routing).
// Promoted here so every caller — auth restore, post-auth routing, Home's
// fetchData — shares one implementation.
export const TIMEOUT = Symbol('timeout');

export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), ms)),
  ]);
}
