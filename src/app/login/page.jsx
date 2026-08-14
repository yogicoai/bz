'use client';

import { useEffect, useState, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import Loading, { Spinner } from '@/components/Loading';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [setup, setSetup] = useState(null); // null=확인중, true=최초설정, false=로그인
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/login')
      .then((r) => r.json())
      .then((r) => setSetup(Boolean(r.needsSetup)))
      .catch(() => setSetup(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (setup && password !== confirm) return setErr('두 비밀번호가 서로 다릅니다.');
    setBusy(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup ? { password, setup: true } : { password }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || '로그인 실패');
      // 로그인 직후에는 브리핑으로 보낸다. 이 도구의 하루 시작점이 거기다.
      // 인증이 풀려 튕긴 경우에는 보던 화면으로 돌려준다(next 파라미터).
      const back = params.get('next');
      router.replace(back && back !== '/' ? back : '/briefing');
      router.refresh();
    } catch (e) {
      setErr(String(e.message || e));
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 380 }}>
        <Image
          src="/logo.png"
          alt="YOGI CORPORATION"
          width={1500}
          height={337}
          priority
          // 실제로는 200px 로 그리는데 sizes 가 없으면 3840px 원본을 받아온다
          sizes="200px"
          className="login-logo"
        />

        {setup === null ? (
          <Loading text="확인 중…" size="sm" style={{ padding: '18px 0' }} />
        ) : (
          <>
            {setup && (
              <div className="card" style={{ background: 'var(--panel-2)', marginBottom: 16, fontSize: 12 }}>
                최초 실행입니다. 앞으로 사용할 <b>접근 비밀번호</b>를 정하세요.
                <div className="muted" style={{ marginTop: 4 }}>8자 이상. 설정 화면에서 언제든 변경할 수 있습니다.</div>
              </div>
            )}

            <label>{setup ? '새 비밀번호' : '비밀번호'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoFocus autoComplete={setup ? 'new-password' : 'current-password'} />

            {setup && (
              <>
                <label style={{ marginTop: 12 }}>비밀번호 확인</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </>
            )}

            {err && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 10 }}>{err}</div>}

            <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={busy}>
              {busy ? <><Spinner /> 처리 중…</> : setup ? '비밀번호 설정하고 시작' : '로그인'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
