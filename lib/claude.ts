const AI_ENDPOINT = `${process.env.NEXT_PUBLIC_APP_URL}/api/ai`;

export type AIAction =
  | 'parse_schedule'
  | 'import_roster'
  | 'suggest_lineup'
  | 'plan_subs';

export async function callAI<T>(action: AIAction, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI request failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
