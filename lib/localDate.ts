// `Date.prototype.toISOString()` always renders in UTC, so converting
// "today" (or any locally-constructed midnight Date) through it silently
// rolls to the wrong calendar day whenever the local clock and UTC
// disagree on what day it is — which is any evening in a negative-UTC
// timezone (all of North America, from roughly 7-8pm local onward). Every
// event_date/date-of-birth column in this app is a plain local calendar
// date, so comparisons/storage must go through these, not toISOString().
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayLocalStr(): string {
  return toLocalDateStr(new Date());
}
