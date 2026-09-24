export type DueType = 'acceptance' | 'date' | 'tbd';
export type Installment = { label: string; amount: number | null; due_type: DueType; due_date: string | null };

// Older saved installments predate due_type — infer it from whatever
// due_date they had so existing plans keep rendering sensibly.
export function normalizeDueType(inst: { due_type?: DueType; due_date: string | null }): DueType {
  if (inst.due_type) return inst.due_type;
  return inst.due_date ? 'date' : 'tbd';
}
export type FeePlanRow = { season_fee: number | null; installments: Installment[] };
export type ResolvedFeePlan = { seasonFee: number | null; installments: Installment[] };

export const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$' };

// tryout_teams.season_fee/deposit_amount are free-form text (e.g. "1,200") —
// strip formatting before treating them as numbers.
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function formatCurrency(n: number | null, currency = 'USD'): string {
  if (n == null) return '';
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  const hasCents = Math.abs(n % 1) > 0.001;
  return `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// Resolution order for a given team's offer:
// 1. The team's own season_fee (tryout_teams) — a full override; if it also
//    has a deposit_amount, that becomes the only known installment (we don't
//    fabricate further installments the club never entered for it).
// 2. The fee plan matching the team's age group.
// 3. The club-wide default plan (age_group === '').
export function resolveFeePlan(
  teamAgeGroup: string | null,
  teamSeasonFeeOverride: string | null,
  teamDepositOverride: string | null,
  plansByAgeGroup: Record<string, FeePlanRow>,
): ResolvedFeePlan {
  const plan = (teamAgeGroup && plansByAgeGroup[teamAgeGroup]) || plansByAgeGroup[''] || null;
  const overrideFee = parseMoney(teamSeasonFeeOverride);
  const seasonFee = overrideFee ?? plan?.season_fee ?? null;

  if (overrideFee != null) {
    const overrideDeposit = parseMoney(teamDepositOverride);
    return { seasonFee, installments: overrideDeposit != null ? [{ label: 'Deposit', amount: overrideDeposit, due_type: 'acceptance', due_date: null }] : [] };
  }
  return { seasonFee, installments: plan?.installments ?? [] };
}

export function renderInstallmentPlanHtml(plan: ResolvedFeePlan, currency = 'USD'): string {
  if (!plan.installments.length) return '';
  const rows = plan.installments.map((inst, i) => {
    const dueType = normalizeDueType(inst);
    const dueTxt = dueType === 'acceptance'
      ? 'Due upon acceptance of roster spot'
      : dueType === 'date' && inst.due_date
        ? new Date(inst.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Date TBD';
    const isLast = i === plan.installments.length - 1;
    return `<div style="display:block;padding:12px 0;${isLast ? '' : 'border-bottom:1px solid #eee;'}"><span style="display:inline-block;width:150px;color:#111827;font-size:13px;font-weight:600;">${inst.label}</span><span style="display:inline-block;width:90px;font-weight:700;">${inst.amount != null ? formatCurrency(inst.amount, currency) : 'TBD'}</span><span style="color:#6b7280;font-size:13px;">${dueTxt}</span></div>`;
  }).join('');
  return `<div style="background:#fafafa;border-radius:8px;margin:8px 0;padding:4px 16px;">${rows}</div>`;
}

// Fans a band's members out into individual lookup keys, so a single row
// covering ['U9','U10','U11'] resolves for any one of those age groups —
// resolveFeePlan() itself needs no change to support merged age groups.
export function plansToMap(rows: { age_groups: string[]; season_fee: number | string | null; installments: Installment[] }[]): Record<string, FeePlanRow> {
  const map: Record<string, FeePlanRow> = {};
  for (const r of rows) {
    const row: FeePlanRow = { season_fee: r.season_fee == null ? null : Number(r.season_fee), installments: r.installments ?? [] };
    if (!r.age_groups || r.age_groups.length === 0) { map[''] = row; continue; }
    for (const ag of r.age_groups) map[ag] = row;
  }
  return map;
}
