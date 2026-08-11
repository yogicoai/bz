'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

/**
 * 화면 껍데기.
 *
 * 넓은 화면에서는 사이드바가 늘 보이고, 좁은 화면(폰)에서는 서랍으로 접힌다.
 * 폰 대응이 중요한 이유는 동선이 그렇기 때문이다 — 아침 8시 브리핑 메일을
 * 폰에서 열고 링크를 눌러 들어오시므로, 첫 화면이 폰인 경우가 오히려 잦다.
 */
export default function Shell({ children }) {
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // 메뉴를 눌러 화면이 바뀌면 서랍을 닫는다 (안 닫으면 이동한 화면이 가려진다)
  useEffect(() => { setNavOpen(false); }, [path]);

  // 서랍이 열린 동안 뒤쪽 본문이 같이 스크롤되지 않도록 잠근다
  useEffect(() => {
    if (!navOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [navOpen]);

  // 넓은 화면으로 바뀌면(태블릿을 가로로 돌리는 등) 서랍 상태를 푼다.
  // 그러지 않으면 사이드바는 원래대로 돌아오는데 본문 스크롤 잠금만 남는다.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 861px)');
    const sync = () => { if (mq.matches) setNavOpen(false); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (path === '/login') return <>{children}</>;

  return (
    <div className="layout">
      {/* 폰에서만 보이는 상단 바 — 서랍을 여는 유일한 입구 */}
      <header className="mobile-bar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setNavOpen(true)}
          aria-label="메뉴 열기"
          aria-expanded={navOpen}
        >
          <span aria-hidden>☰</span>
        </button>
        <span className="mobile-bar-title">메일 관리</span>
      </header>

      {/* 서랍 뒤를 덮는 막 — 아무 데나 눌러 닫을 수 있어야 한다 */}
      {navOpen && (
        <div
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="main">{children}</main>
    </div>
  );
}
