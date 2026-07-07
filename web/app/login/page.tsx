'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Profile = {
  role: string;
};

function OAuthButton({
  label,
  logo,
  onPress,
  provider,
}: {
  label: string;
  logo: string;
  onPress: () => void;
  provider: 'google' | 'apple';
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '11px 16px',
        background: hover ? '#F8FAFC' : '#fff',
        border: `1.5px solid ${hover ? '#CBD5E1' : '#E2E8F0'}`,
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: '600',
        color: '#0F172A',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {provider === 'google' ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2a10.3 10.3 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9.01 9.01 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A8.997 8.997 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" fill="#EA4335"/>
        </svg>
      ) : (
        <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
          <path d="M13.15 9.53c-.02-2.07 1.69-3.07 1.77-3.12-1-1.45-2.5-1.62-3.02-1.63-1.27-.13-2.5.76-3.15.76-.66 0-1.65-.75-2.72-.73-1.38.02-2.67.81-3.38 2.04C.89 9.43 1.97 13.2 3.58 15.26c.81 1.14 1.76 2.42 3.01 2.37 1.21-.05 1.67-.77 3.13-.77 1.46 0 1.88.77 3.15.74 1.3-.02 2.13-1.15 2.93-2.3.93-1.3 1.3-2.58 1.32-2.64-.03-.01-2.51-.96-2.53-3.81l-.44-.32ZM10.97 2.9c.65-.8 1.1-1.9 1.97-2.9-.9.07-2 .6-2.65 1.38C9.67 2.14 9.16 3.26 9.27 4.28c.97.07 1.97-.48 2.7-1.38Z" fill="#000"/>
        </svg>
      )}
      {label}
    </button>
  );
}

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard');
    });
  }, [router]);

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [emailFocus, setEmailFocus]     = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [btnHover, setBtnHover]         = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if ((profile as Profile | null)?.role === 'player') {
        setError('This dashboard is for coaches and admins only. Please use the Dugout FC mobile app.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
    }

    router.push('/dashboard');
  }

  function inputBorder(focused: boolean) {
    if (error) return '1.5px solid #ef4444';
    if (focused) return '1.5px solid #22C55E';
    return '1.5px solid #2a2a2a';
  }

  const baseInput: React.CSSProperties = {
    width: '100%',
    background: '#1a1a1a',
    borderRadius: '10px',
    padding: '11px 14px',
    fontSize: '15px',
    color: '#f0f0f0',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#080808',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo lockup */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '8px 16px', display: 'inline-flex', alignItems: 'center' }}>
              <img src="/Signature.jpg" alt="Dugout FC" style={{ height: '32px', width: 'auto' }} />
            </div>
          </a>
        </div>

        {/* Card */}
        <div style={{
          background: '#111',
          borderRadius: '20px',
          border: '1px solid #1e1e1e',
          padding: '36px',
        }}>
          <h1 style={{
            fontSize: '20px', fontWeight: '800', color: '#fff',
            marginBottom: '4px', letterSpacing: '-0.2px',
          }}>
            Coach &amp; Admin Sign In
          </h1>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '28px', lineHeight: 1.5 }}>
            Manage your teams from your desktop
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Email */}
            <div>
              <label style={{
                fontSize: '11px', fontWeight: '700', color: '#555',
                letterSpacing: '0.07em', textTransform: 'uppercase',
                display: 'block', marginBottom: '7px',
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@yourclub.com"
                autoComplete="email"
                style={{ ...baseInput, border: inputBorder(emailFocus) }}
                onFocus={() => setEmailFocus(true)}
                onBlur={() => setEmailFocus(false)}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                fontSize: '11px', fontWeight: '700', color: '#555',
                letterSpacing: '0.07em', textTransform: 'uppercase',
                display: 'block', marginBottom: '7px',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ ...baseInput, border: inputBorder(passwordFocus) }}
                onFocus={() => setPasswordFocus(true)}
                onBlur={() => setPasswordFocus(false)}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: '#1a0808',
                border: '1px solid #ef444430',
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '13px',
                color: '#f87171',
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#166534' : btnHover ? '#16A34A' : '#22C55E',
                color: loading ? '#4ade80' : '#000',
                fontWeight: '700',
                fontSize: '15px',
                padding: '13px',
                borderRadius: '10px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, box-shadow 0.15s, transform 0.1s',
                fontFamily: 'inherit',
                transform: btnHover && !loading ? 'translateY(-1px)' : 'none',
                boxShadow: btnHover && !loading ? '0 4px 12px rgba(34,197,94,0.3)' : 'none',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, height: '1px', background: '#222' }} />
              <span style={{ fontSize: '12px', color: '#444', fontWeight: '500' }}>or continue with</span>
              <div style={{ flex: 1, height: '1px', background: '#222' }} />
            </div>

            {/* OAuth */}
            <OAuthButton
              provider="google"
              label="Continue with Google"
              logo="G"
              onPress={() => supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/dashboard` },
              })}
            />
            <OAuthButton
              provider="apple"
              label="Continue with Apple"
              logo=""
              onPress={() => supabase.auth.signInWithOAuth({
                provider: 'apple',
                options: { redirectTo: `${window.location.origin}/dashboard` },
              })}
            />
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#555', marginTop: '20px' }}>
          New club?{' '}
          <a href="/onboarding" style={{ color: '#22C55E', textDecoration: 'none', fontWeight: '600' }}>
            Get started →
          </a>
        </p>
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#444', marginTop: '8px' }}>
          For parents &amp; players — download the{' '}
          <a href="/" style={{ color: '#555', textDecoration: 'none', fontWeight: '500' }}>
            Dugout FC app
          </a>
        </p>
      </div>
    </div>
  );
}
