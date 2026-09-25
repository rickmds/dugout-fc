// Shared NCSA (ncsanj.com) authenticated-session helper — used by
// ncsa-connect-account (to verify a coach's credentials before saving them)
// and ncsa-opposing-coach (to use an already-saved credential for a live
// contact-info lookup). Nothing in this codebase handled cross-request
// cookies before this — Deno's fetch() has no automatic cookie jar across
// separate calls the way a browser does, so the session cookie from login
// has to be captured and forwarded manually.

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

const LOGIN_URL = 'https://www.ncsanj.com/loginAction.cfm';
// Any ordinary nav page works for the post-login "did it actually work"
// check — clubTeams.cfm happens to be one this codebase already fetches
// elsewhere (ncsa-opposing-coach uses it directly for the real lookup too).
const VERIFY_URL = 'https://www.ncsanj.com/clubTeams.cfm';

export interface NcsaSession {
  cookie: string;
}

function mergeSetCookies(res: Response, jar: Map<string, string>) {
  // Deno's fetch supports the (non-standard-but-widely-adopted)
  // getSetCookie() to get every Set-Cookie header individually — a plain
  // headers.get('set-cookie') only ever returns one value even when the
  // server sent several, which NCSA's login does (CFID/CFTOKEN/JSESSIONID
  // as three separate headers).
  const raw: string[] = typeof (res.headers as any).getSetCookie === 'function'
    ? (res.headers as any).getSetCookie()
    : [];
  for (const line of raw) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// Follows redirects manually (rather than letting fetch() auto-follow) so
// that Set-Cookie headers from every hop get captured — an intermediate
// redirect response setting a cookie the final response doesn't repeat
// would otherwise be silently lost.
async function fetchAccumulatingCookies(
  url: string,
  init: RequestInit,
  jar: Map<string, string>,
  maxHops = 5,
): Promise<Response> {
  let currentUrl = url;
  let currentInit = init;
  for (let hop = 0; hop < maxHops; hop++) {
    const res = await fetch(currentUrl, { ...currentInit, redirect: 'manual' });
    mergeSetCookies(res, jar);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      currentUrl = new URL(location, currentUrl).toString();
      currentInit = { method: 'GET', headers: { 'User-Agent': USER_AGENT, Cookie: cookieHeader(jar) } };
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects following NCSA login');
}

// Logs into NCSA and confirms it actually worked — the login response
// itself always sets session cookies whether or not the credentials were
// valid (ColdFusion issues CFID/CFTOKEN to every visitor), so success can
// only be confirmed by a follow-up authenticated request and checking for
// the "Logout" link that only appears when actually signed in.
export async function ncsaLogin(username: string, password: string): Promise<NcsaSession | null> {
  const jar = new Map<string, string>();
  await fetchAccumulatingCookies(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `lm=&uname=${encodeURIComponent(username)}&pword=${encodeURIComponent(password)}`,
  }, jar).then((res) => res.text().catch(() => ''));

  if (!jar.size) return null;
  const cookie = cookieHeader(jar);

  const verifyRes = await fetch(VERIFY_URL, { headers: { 'User-Agent': USER_AGENT, Cookie: cookie } });
  const html = await verifyRes.text();
  if (!/href="logout\.cfm"/i.test(html)) return null;

  return { cookie };
}

export async function ncsaFetch(url: string, session: NcsaSession, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), 'User-Agent': USER_AGENT, Cookie: session.cookie },
  });
}
