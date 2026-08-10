'use client';

import { useEffect, useState } from 'react';

const KEY = 'ed_theme'; // 'light' | 'dark' | 'system'

/**
 * 고르지 않았을 때의 기본값은 **어둡게** 다.
 * OS 설정을 따르게 두면 밝은 화면을 쓰는 PC 에서 흰 배경으로 열리는데,
 * 이 도구는 종일 띄워두고 목록을 훑는 화면이라 어두운 쪽이 기본이어야 한다.
 * '자동' 을 직접 고르면 그때부터 OS 설정을 따른다.
 */
const DEFAULT_MODE = 'dark';

/** 저장된 선택을 <html data-theme> 에 반영. system 이면 속성을 지워 OS 설정을 따르게 한다. */
function apply(mode) {
  const el = document.documentElement;
  if (mode === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState(null); // 서버·클라이언트 불일치를 피하려고 null 로 시작

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    setMode(saved || DEFAULT_MODE);
    if (!saved) apply(DEFAULT_MODE);
  }, []);

  function pick(next) {
    setMode(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  if (mode === null) return <div style={{ height: 38 }} />; // 레이아웃 흔들림 방지

  const opts = [
    { v: 'light', label: '밝게', icon: '☀️' },
    { v: 'dark', label: '어둡게', icon: '🌙' },
    { v: 'system', label: '자동', icon: '🖥️' },
  ];

  return (
    <div
      role="group"
      aria-label="화면 테마"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 3,
        padding: 3,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {opts.map((o) => {
        const on = mode === o.v;
        return (
          <button
            key={o.v}
            onClick={() => pick(o.v)}
            title={o.label}
            aria-pressed={on}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '7px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '-0.02em',
              background: on ? 'var(--panel)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--muted)',
              boxShadow: on ? 'var(--shadow)' : 'none',
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 첫 페인트 전에 테마를 적용하는 인라인 스크립트.
 * 이게 없으면 다크 사용자에게 흰 화면이 한 번 번쩍인다.
 */
export const themeInitScript = `
(function(){
  try {
    var m = localStorage.getItem('${KEY}');
    // 고른 적이 없으면 어둡게. 첫 방문에 흰 화면이 번쩍이지 않도록 여기서 정한다.
    if (!m) m = '${DEFAULT_MODE}';
    if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${DEFAULT_MODE}');
  }
})();
`;
