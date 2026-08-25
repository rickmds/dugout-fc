// Source of truth for which countries a club can be based in, and the
// currency that implies. Country drives currency (not the other way
// around) because a club's Stripe Connect account is created for a
// specific country and its onboarding/payout requirements follow from
// that — letting currency be picked independently of country is what
// caused it to become a purely cosmetic dropdown with no real effect on
// how money actually moved.
//
// Keep this list in sync with the `clubs_country_check` constraint in
// supabase/migrations/20260815000002_clubs_country.sql — adding a country
// here without updating that constraint will make new signups fail to
// save, and vice versa.
export type CountryCode = 'US' | 'GB' | 'CA' | 'AU' | 'IE';

export type CountryInfo = {
  code: CountryCode;
  label: string;
  currency: string;
  symbol: string;
};

export const COUNTRIES: CountryInfo[] = [
  { code: 'US', label: 'United States', currency: 'USD', symbol: '$' },
  { code: 'GB', label: 'United Kingdom', currency: 'GBP', symbol: '£' },
  { code: 'CA', label: 'Canada',         currency: 'CAD', symbol: 'CA$' },
  { code: 'AU', label: 'Australia',      currency: 'AUD', symbol: 'A$' },
  { code: 'IE', label: 'Ireland',        currency: 'EUR', symbol: '€' },
];

export function countryInfo(code: string | null | undefined): CountryInfo {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function currencyForCountry(code: string | null | undefined): string {
  return countryInfo(code).currency;
}

export function symbolForCurrency(currency: string | null | undefined): string {
  return COUNTRIES.find((c) => c.currency === currency)?.symbol ?? '$';
}

// Stripe's published per-transaction fixed fee, in minor currency units
// (cents/pence), for a domestic card charge in each currency. Only an
// approximation — actual rates vary by card type/region — but it's what
// the "pass Stripe's fee on to the payer" math needs as its fixed
// component instead of assuming the US figure (30 cents) everywhere.
export const STRIPE_FIXED_FEE_MINOR: Record<string, number> = {
  USD: 30,
  GBP: 20,
  EUR: 25,
  CAD: 30,
  AUD: 30,
};
