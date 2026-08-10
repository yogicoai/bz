'use client';

import { useEffect, useState } from 'react';

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13,
};

export default function AccountPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [envOnly, setEnvOnly] = useState(false);

  useEffect(() => {
    // 아직 DB 에 비밀번호가 없으면(= env 값으로만 로그인 중) 안내를 띄운다
    fetch('/api/login')
      .then((r) => r.json())
      .then((r) => setEnvOnly(Boolean(r.needsSetup)))
      .catch(() => {});
  }, []);

  const strength = (() => {
    const s = next;
    if (!s) return null;
    if (s.length < 8) return { label: '너무 짧음 (8자 이상)', color: 'var(--bad)' };
    let score = 0;
    if (/[a-z]/.test(s)) score++;
    if (/[A-Z]/.test(s)) score++;
    if (/\d/.test(s)) score++;
    if (/[^A-Za-z0-9]/.test(s)) score++;
    if (s.length >= 12) score++;
    if (score <= 2) return { label: '약함', color: 'var(--bad)' };
    if (score === 3) return { label: '보통', color: 'var(--warn)' };
    return { label: '강함', color: 'var(--good)' };
  })();

  async function change(e) {
    e?.preventDefault();
    setErr(''); setMsg('');
    if (next !== confirm) return setErr('새 비밀번호가 서로 다릅니다.');
    if (next === current) return setErr('현재 비밀번호와 다른 값을 입력하세요.');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMsg(r.message);
      setCurrent(''); setNext(''); setConfirm('');
      setEnvOnly(false);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  async function logout() {
    await fetch('/api/login', { method: 'DELETE' });
    window.location.href = '/login';
  }

  return (
    <>
      <h1 className="page-title">계정·보안</h1>
      <p className="page-sub">이 앱에 접속할 때 사용하는 비밀번호를 관리합니다.</p>

      {msg && <div className="card" style={{ borderColor: 'var(--good)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      {envOnly && (
        <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 14 }}>
          <b>환경변수 비밀번호로 접속 중입니다.</b>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            현재 <code>.env.local</code> 의 <code>APP_PASSWORD</code> 값으로 로그인하고 있습니다.
            아래에서 한 번 변경하면 데이터베이스에 암호화(scrypt)되어 저장되고, 이후에는 이 화면에서만 관리됩니다.
          </div>
        </div>
      )}

      <form onSubmit={change} className="card" style={{ marginBottom: 16, maxWidth: 520 }}>
        <div className="card-title">비밀번호 변경</div>

        <label>현재 비밀번호</label>
        <input style={inp} type="password" value={current}
          onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />

        <label style={{ marginTop: 14 }}>새 비밀번호</label>
        <input style={inp} type="password" value={next}
          onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        {strength && (
          <div style={{ fontSize: 11, marginTop: 5, color: strength.color }}>강도: {strength.label}</div>
        )}

        <label style={{ marginTop: 14 }}>새 비밀번호 확인</label>
        <input style={inp} type="password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        {confirm && next !== confirm && (
          <div style={{ fontSize: 11, marginTop: 5, color: 'var(--bad)' }}>일치하지 않습니다.</div>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" disabled={busy || !current || !next || next !== confirm}>
            {busy ? '변경 중…' : '비밀번호 변경'}
          </button>
        </div>

        <div className="muted" style={{ fontSize: 11, marginTop: 14 }}>
          8자 이상. 비밀번호는 원문이 저장되지 않고 scrypt 해시로만 보관됩니다.
        </div>
      </form>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-title">세션</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
          로그인 상태는 14일간 유지됩니다. 공용 PC 에서 사용했다면 반드시 로그아웃하세요.
        </div>
        <button className="btn secondary" onClick={logout}>로그아웃</button>
      </div>
    </>
  );
}
