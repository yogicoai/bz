'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 메일을 못 가져오고 있는 계정이 있으면 알린다.
 *
 * 비밀번호가 바뀌거나 메일함에서 IMAP 을 끄면 수집이 조용히 멈춘다.
 * 화면에는 "새 제안 0건" 으로만 보여서 "요즘 메일이 없네" 로 읽히는데,
 * 실제로는 들어오고 있고 이 도구만 못 보고 있는 것이다.
 * 이 도구에서 가장 나쁜 실패라 눈에 띄는 자리에 띄운다.
 */
export default function AccountAlert() {
  const [bad, setBad] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((r) => {
        if (!alive || !r.ok) return;
        setBad((r.accounts || []).filter((a) => a.enabled && a.health === 'fail'));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!bad.length) return null;

  return (
    <div className="card" style={{ borderColor: 'var(--bad)', background: 'var(--bad-weak)', marginBottom: 14 }}>
      <b>⚠️ 메일을 가져오지 못하는 계정이 {bad.length}곳 있습니다</b>
      <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.8, color: 'var(--text-2)' }}>
        {bad.map((a) => (
          <div key={a.id}>
            <b>{a.label}</b> ({a.user}) — {a.lastError}
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        이 계정의 새 메일은 지금 화면에 올라오지 않습니다.
        비밀번호가 바뀌었거나 메일함에서 IMAP 사용이 꺼졌을 수 있습니다.{' '}
        <Link href="/settings" style={{ color: 'var(--accent)', fontWeight: 700 }}>설정에서 확인하기 →</Link>
      </div>
    </div>
  );
}
