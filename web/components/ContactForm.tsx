'use client';

import { useState } from 'react';

export default function ContactForm() {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message }),
    });
    setStatus(res.ok ? 'sent' : 'error');
  }

  if (status === 'sent') {
    return (
      <div className="py-12 text-center">
        <div className="w-10 h-10 rounded-full bg-[#0e2016] border border-[#22c55e22] flex items-center justify-center mx-auto mb-4">
          <span className="text-[#22c55e] font-extrabold text-[14px]">✓</span>
        </div>
        <p className="text-white font-bold text-[17px] mb-1.5">Message sent.</p>
        <p className="text-[#444] text-[14px]">We'll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-[#444] mb-1.5 uppercase tracking-widest">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie Walsh" required />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-[#444] mb-1.5 uppercase tracking-widest">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-[#444] mb-1.5 uppercase tracking-widest">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your club…"
          required
          rows={4}
        />
      </div>
      {status === 'error' && (
        <p className="text-[#f87171] text-[13px]">Something went wrong — please try again.</p>
      )}
      <button type="submit" disabled={status === 'sending'}
        className="bg-[#22c55e] text-black font-bold text-[14px] px-6 py-3.5 rounded-xl hover:bg-[#1db954] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {status === 'sending' ? 'Sending…' : 'Send message →'}
      </button>
    </form>
  );
}
