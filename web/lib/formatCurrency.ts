// Shared money formatter — every dollar amount in the dashboard should go
// through this instead of a hardcoded `$` prefix, so it actually reflects
// the club's real currency (see lib/countries.ts) instead of just looking
// like it does. `en-US` as the locale is intentional even for non-USD
// currencies — it controls digit grouping/decimal punctuation, not which
// currency symbol appears, and the whole product is English-only today.
export function formatCurrency(
  amount: number,
  currency: string | null | undefined,
  opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number },
): string {
  const cur = (currency ?? 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: opts?.minimumFractionDigits ?? 2,
      maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(opts?.maximumFractionDigits ?? 2)}`;
  }
}

// Whole-number variant for summary cards/totals where cents are noise.
export function formatCurrencyRounded(amount: number, currency: string | null | undefined): string {
  return formatCurrency(amount, currency, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}
