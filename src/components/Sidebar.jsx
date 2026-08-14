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

  // 오늘 처리할 제안 건수 — 브리핑 메뉴 배지.
  //
  // 브리핑 화면과 **같은 기준**으로 물어야 한다. 날짜를 빼고 부르면 서버가
  // '지금부터 24시간'을 보는데, 화면은 '오늘 하루(00시~24시)'를 봐서
  // 배지 4 / 화면 0 처럼 어긋나 보였다.
  useEffect(() => {
    let alive = true;
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    fetch(`/api/briefing?countOnly=true&date=${today}&days=1`)
      .then((r) => r.json())
      // 오늘 것 + 아직 손대지 않은 지난 건. 오늘 온 게 0통이어도 밀린 것이 있으면
      // 배지가 0 이 되어 "할 일 없음" 으로 읽히면 안 된다.
      .then((r) => { if (alive && r.ok) setTodayCount((r.total || 0) + (r.missedTotal || 0)); })
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

          {/* 메일 계정 → 그 안의 폴더.
              계정이 하나뿐이어도 같은 구조로 둔다 — 나중에 Gmail·네이버를 더해도
              화면 모양이 달라지지 않고, 폴더가 어느 메일함 것인지가 늘 드러난다.
              계정이 하나면 기본으로 펼쳐 두어 클릭이 늘지 않게 한다. */}
          {gi === 0 && accounts.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="nav-group-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>메일 계정 <span style={{ fontWeight: 400 }}>· 최근 한 달</span></span>
                <Link href="/groups" className="muted" style={{ fontSize: 11, fontWeight: 600 }}>전체</Link>
              </div>
              <nav className="nav">
                {accounts.map((a) => {
                  const href = `/accounts/${encodeURIComponent(a.id)}`;
                  const mine = byAccount[a.id] || [];
                  // 처음에는 접어 둔다. 폴더가 20개가 넘는 계정도 있어서
                  // 펼친 채로 시작하면 사이드바가 폴더 목록으로만 가득 찬다.
                  // 그 계정 화면에 들어가 있을 때만 자동으로 열린다.
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
        </div>
      ))}

      <div className="sidebar-foot">
        <ThemeToggle />
      </div>
    </aside>
  );
}
