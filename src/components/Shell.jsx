'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

/** 로그인 화면에서는 사이드바를 감춘다 */
export default function Shell({ children }) {
  const path = usePathname();
  if (path === '/login') return <>{children}</>;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}
