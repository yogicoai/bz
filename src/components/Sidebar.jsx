'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

const NAV = [
  {
    group: '관리',
    items: [
      { href: '/briefing', label: '오늘의 브리핑', icon: '📋', badge: 'briefing' },
      { href: '/dashboard', label: '대시보드', icon: '📊' },
      // '전체 메일함'(/mails) 은 메뉴에서 뺐다 — 수천 통을 통째로 보는 화면이라
      // 오히려 브리핑 동선을 흐린다. 화면 자체는 남아 있어 대시보드의 숫자나
      // 거래처 목록에서 들어갈 수 있다.
      { href: '/deadlines', label: '기한·답변', icon: '⏰' },
    ],
  },
  {
    group: '설정',
    items: [
      { href: '/guide', label: '사용 설명서', icon: '📖' },
      { href: '/settings', label: '설정', icon: '⚙️' },
      { href: '/account', label: '계정·보안', icon: '🔐' },
    ],
  },
];

export default function Sidebar({ open = false, onClose }) {
  const path = usePathname();
  const [todayCount, setTodayCount] = useState(null);
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [byAccount, setByAccount] = useState({});
  // 계정 아래 폴더를 펼쳐 둔 계정 id (한 번에 하나만)
  const [expanded, setExpanded] = useState(null);

  // 오늘 처리할 제안 건수 — 브리핑 메뉴 배지
  useEffect(() => {
    let alive = true;
    fetch('/api/briefing?countOnly=true')
      .then((r) => r.json())
      .then((r) => { if (alive && r.ok) setTodayCount(r.total); })
      .catch(() => {});
    return () => { alive = false; };
  }, [path]); // 화면 이동 시 갱신 (체크 처리하면 줄어들도록)

  // 거래처 목록 — 메일함의 '내 메일함' 폴더 구조를 그대로 옮겨 놓는다
  useEffect(() => {
    let alive = true;
    fetch('/api/groups')
      .then((r) => r.json())
      .then((r) => { if (alive && r.ok) { setGroups(r.groups); setByAccount(r.byAccount || {}); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [path]);

  // 메일 계정 — 여러 메일함을 등록한 경우에만 나온다.
  // 계정이 여럿이면 사람의 머릿속 첫 구분은 거래처가 아니라
  // "이건 회사 메일, 이건 네이버로 온 것" 이라서 거래처보다 위에 둔다.
  useEffect(() => {
    let alive = true;
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((r) => { if (alive && r.ok) setAccounts(r.accounts || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [path]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      {/* 폰에서 서랍을 닫는 버튼 — 넓은 화면에서는 CSS 로 숨긴다 */}
      <button type="button" className="nav-close" onClick={onClose} aria-label="메뉴 닫기">
        <span aria-hidden>✕</span>
      </button>

      <Link href="/briefing" className="brand">
        {/* 원본이 검은색 단색이라 다크 테마에서만 흰색으로 반전한다 (--logo-filter) */}
        <Image
          src="/logo.png"
          alt="YOGI CORPORATION"
          width={1500}
          height={337}
          priority
          className="brand-logo"
        />
        <small>메일 관리</small>
      </Link>

      {NAV.map((g, gi) => (
        <div className="nav-group" key={g.group}>
          <div className="nav-group-title">{g.group}</div>
          <nav className="nav">
            {g.items.map((it) => {
              const active = it.exact ? path === it.href : path.startsWith(it.href);
              const badge = it.badge === 'briefing' && todayCount > 0 ? todayCount : null;
              return (
                <Link key={it.href} href={it.href} className={active ? 'active' : ''}>
                  <span className="label">
                    <span aria-hidden style={{ marginRight: 8 }}>{it.icon}</span>
                    {it.label}
                  </span>
                  {badge && <span className="nav-badge">{badge}</span>}
                </Link>
              );
            })}
          </nav>

          {/* 메일 계정 → 그 안의 폴더. 계정을 여러 개 등록했을 때만 2단이 된다.
              한 곳만 쓰면 계정 줄이 군더더기라 아래의 평평한 목록을 그대로 쓴다. */}
          {gi === 0 && accounts.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <div className="nav-group-title">메일 계정</div>
              <nav className="nav">
                {accounts.map((a) => {
                  const href = `/accounts/${encodeURIComponent(a.id)}`;
                  const mine = byAccount[a.id] || [];
                  const open = expanded === a.id || decodeURIComponent(path).startsWith(href);
                  return (
                    <div key={a.id}>
                      <div style={{ display: 'flex', alignItems: 'stretch' }}>
                        {/* 펼치기는 이름과 분리한다 — 이름을 누르면 그 계정 전체가 열려야 한다 */}
                        <button type="button" className="nav-caret"
                          onClick={() => setExpanded(open ? null : a.id)}
                          aria-label={open ? '폴더 접기' : '폴더 펼치기'}
                          aria-expanded={open}>
                          {open ? '▾' : '▸'}
                        </button>
                        <Link href={href} style={{ flex: 1, minWidth: 0 }}
                          className={decodeURIComponent(path) === decodeURIComponent(href) ? 'active' : ''}>
                          <span className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span aria-hidden style={{ marginRight: 8 }}>✉️</span>
                            {a.label}
                          </span>
                          {a.fresh > 0
                            ? <span className="nav-badge" title={`최근 한 달 확인하지 않은 메일 ${a.fresh}건`}>{a.fresh}</span>
                            : <span className="nav-count" title={`최근 한 달 ${a.recent}통 · 전체 ${a.total.toLocaleString()}통`}>{a.recent}</span>}
                        </Link>
                      </div>

                      {open && (
                        mine.length ? (
                          <div className="nav-sub">
                            {mine.map((g) => {
                              const gh = `/groups/${encodeURIComponent(g.group)}?account=${encodeURIComponent(a.id)}`;
                              return (
                                <Link key={g.group} href={gh}>
                                  <span className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span aria-hidden style={{ marginRight: 6 }}>📁</span>
                                    {g.group}
                                  </span>
                                  {g.fresh > 0
                                    ? <span className="nav-badge">{g.fresh}</span>
                                    : <span className="nav-count">{g.count}</span>}
                                </Link>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="nav-sub nav-sub-empty">아직 폴더가 없습니다</div>
                        )
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          )}

          {/* '관리' 바로 아래에 거래처 목록을 붙인다 — 웹메일의 '내 메일함' 과 같은 위치감.
              계정을 여러 개 쓰면 위에서 계정별로 이미 나눠 보여주므로 여기서는 생략한다. */}
          {gi === 0 && accounts.length <= 1 && groups.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="nav-group-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>거래처 <span style={{ fontWeight: 400 }}>· 최근 한 달</span></span>
                <Link href="/groups" className="muted" style={{ fontSize: 11, fontWeight: 600 }}>전체</Link>
              </div>
              <nav className="nav">
                {groups.map((g2) => {
                  const href = `/groups/${encodeURIComponent(g2.group)}`;
                  return (
                    <Link key={g2.group} href={href}
                      className={decodeURIComponent(path) === decodeURIComponent(href) ? 'active' : ''}>
                      <span className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span aria-hidden style={{ marginRight: 8 }}>📁</span>
                        {g2.group}
                      </span>
                      {/* 아직 손대지 않은 건이 있으면 그 수를 강조하고, 없으면 누적 통수만 흐리게.
                          누적만 보여주면 확인해도 숫자가 그대로라 '볼 것이 있다'는 신호가 되지 않는다. */}
                      {/* 숫자는 모두 최근 한 달 기준. 빨간색은 아직 안 본 것,
                          회색은 최근 한 달에 오간 통수(다 봤거나 볼 것이 없을 때). */}
                      {g2.fresh > 0
                        ? (
                          <span className="nav-badge"
                            title={`최근 한 달 확인하지 않은 메일 ${g2.fresh}건 · 최근 한 달 ${g2.count}통 · 전체 ${(g2.total ?? g2.count).toLocaleString()}통`}>
                            {g2.fresh}
                          </span>
                        )
                        : (
                          <span className="nav-count"
                            title={`최근 한 달 ${g2.count}통 · 전체 ${(g2.total ?? g2.count).toLocaleString()}통 · 볼 것 없음`}>
                            {g2.count}
                          </span>
                        )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </div>
      ))}

      <div className="sidebar-foot">
        <ThemeToggle />
      </div>
    </aside>
  );
}
