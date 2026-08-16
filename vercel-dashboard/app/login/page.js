'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'تعذّر تسجيل الدخول'); setBusy(false); return; }
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      window.location.href = next;
    } catch {
      setErr('تعذّر الاتصال، حاول مجددًا'); setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 className="serif"><span className="tick" />صالون محمد وعمر</h1>
        <p className="sub">لوحة الحجوزات</p>
        <label htmlFor="pw">كلمة المرور</label>
        <input id="pw" type="password" value={pw} autoFocus autoComplete="current-password"
          onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
        <button type="submit" disabled={busy || !pw}>{busy ? '...' : 'دخول'}</button>
        <div className="login-err">{err}</div>
      </form>
    </div>
  );
}
