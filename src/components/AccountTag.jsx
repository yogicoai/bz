'use client';

import { useEffect, useState } from 'react';

/**
 * "이 메일 어디서 온 거야" — 목록에서 메일 옆에 붙는 출처 표시.
 *
 * 메일함을 하나만 쓰면 답이 하나뿐이라 표시가 잡음이 된다. 그래서
 * **계정이 둘 이상일 때만** 나온다. 계정을 더하는 순간 저절로 생기고,
 * 빼서 하나가 되면 저절로 사라진다 — 설정할 것이 없다.
 */

/** 서버 주소로 어느 서비스인지 알아본다 (계정 목록에 서비스 종류가 따로 없다) */
function serviceOf(host = '', label = '') {
  const h = `${host} ${label}`.toLowerCase();
  if (h.includes('gmail') || h.includes('google')) return { key: 'gmail', short: 'Gmail', color: '#e2725b' };
  if (h.includes('naver')) return { key: 'naver', short: '네이버', color: '#2db400' };
  if (h.includes('daum') || h.includes('hanmail')) return { key: 'daum', short: '다음', color: '#3d7cf4' };
  if (h.includes('outlook') || h.includes('office365') || h.includes('hotmail')) return { key: 'outlook', short: 'Outlook', color: '#0f6cbd' };
  if (h.includes('ecount')) return { key: 'ecount', short: '회사', color: '#8b7fd4' };
  return { key: 'other', short: '', color: '#8892a0' };
}

/**
 * 계정 목록을 한 번만 받아 화면 전체가 나눠 쓴다.
 * 목록이 200줄이면 행마다 부르는 것은 200번 부르는 것이다.
 */
let cached = null;
let inflight = null;

export function useAccountTags() {
  const [accounts, setAccounts] = useState(cached || []);

  useEffect(() => {
    if (cached) return;
    if (!inflight) {
      inflight = fetch('/api/accounts')
        .then((r) => r.json())
        .then((r) => { cached = r.ok ? (r.accounts || []) : []; return cached; })
        .catch(() => { cached = []; return cached; });
    }
    let alive = true;
    inflight.then((list) => { if (alive) setAccounts(list); });
    return () => { alive = false; };
  }, []);

  const byId = new Map(accounts.map((a) => [a.id, a]));
  return {
    // 메일함이 하나뿐이면 출처를 물을 일이 없다
    show: accounts.length > 1,
    accounts,
    accountOf: (id) => byId.get(id || 'main') || null,
  };
}

export default function AccountTag({ accountId, accounts, show = true, style }) {
  if (!show) return null;
  const list = accounts || [];
  const a = list.find((x) => x.id === (accountId || 'main'));
  if (!a) return null;

  const svc = serviceOf(a.host, a.label);
  const text = svc.short || a.label || a.user;

  return (
    <span
      title={`${a.label} · ${a.user}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, lineHeight: 1.6, whiteSpace: 'nowrap',
        padding: '1px 7px 1px 5px', borderRadius: 999,
        border: '1px solid var(--border)', background: 'var(--panel-2)',
        color: 'var(--text-2)',
        ...style,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: svc.color, flex: '0 0 auto',
      }} />
      {text}
    </span>
  );
}
