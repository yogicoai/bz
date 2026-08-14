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
  // 이 설치가 여러 메일함 방식인지 (MULTI_ACCOUNT=1)
  const [multiUi, setMultiUi] = useState(false);
  // 휴지통 기능이 켜진 설치에서만 휴지통 줄을 띄운다
  const [trashOn, setTrashOn] = useState(false);
  // 계정 아래 폴더를 펼쳐 둔 계정 id (한 번에 하나만). 화살표로만 바뀐다.
  const [expanded, setExpanded] = useState(null);

  // 그 계정 화면으로 들어가면 한 번 펼쳐 준다.
  // 경로가 바뀔 때만 손대므로, 같은 화면에서 접으면 접힌 채로 남는다.
  useEffect(() => {
    const cur = accounts.find(
      (a) => decodeURIComponent(path).startsWith(`/accounts/${encodeURIComponent(a.id)}`),
    );
    if (cur) setExpanded(cur.id);
  }, [path, accounts]);

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
      // 오늘 들어온 것만 센다. 밀린 것까지 합치면 오늘 할 일이 없는 날에도
      // 숫자가 남아 "오늘도 산더미" 로 읽힌다. 밀린 것은 브리핑 화면의
      // '처리 전' 카드에서 따로 보여준다.
      .then((r) => { if (alive && r.ok) setTodayCount(r.total || 0); })
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

  // 이 설치에서 켜진 기능
  useEffect(() => {
    let alive = true;
    fetch('/api/features')
      .then((r) => r.json())
      .then((r) => { if (alive && r.ok) setTrashOn(Boolean(r.features?.trash)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 메일 계정 — 여러 메일함을 등록한 경우에만 나온다.
  // 계정이 여럿이면 사람의 머릿속 첫 구분은 거래처가 아니라
  // "이건 회사 메일, 이건 네이버로 온 것" 이라서 거래처보다 위에 둔다.
  useEffect(() => {
    let alive = true;
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((r) => {
        if (!alive || !r.ok) return;
        setAccounts(r.accounts || []);
        setMultiUi(Boolean(r.multiAccountUi));
      })
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
        {/* 어느 메일함의 화면인지 늘 보이게 한다.
            대표님·이사님 화면이 거의 같아서, 주소가 없으면 어느 쪽을 보고 있는지
            헷갈린다 — 그 상태에서 답장을 보내면 엉뚱한 계정으로 나간다. */}
        <small>
          메일 관리
          {accounts[0]?.user && (
            <span style={{ display: 'block', marginTop: 3, color: 'var(--accent-text)', fontWeight: 700 }}>
              {accounts[0].user}
            </span>
          )}
        </small>
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

          {/* 메일 계정 → 그 안의 폴더. **메일함을 두 곳 이상 등록했을 때만** 2단이 된다.
              한 곳만 쓰면 계정 줄은 늘 같은 주소 하나라 알려주는 것이 없고,
              폴더를 보려면 한 번 더 눌러야 해서 손해만 난다. */}
          {gi === 0 && multiUi && accounts.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="nav-group-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>메일 계정 <span style={{ fontWeight: 400 }}>· 최근 한 달</span></span>
                <Link href="/groups" className="muted" style={{ fontSize: 11, fontWeight: 600 }}>전체</Link>
              </div>
              <nav className="nav">
                {accounts.map((a) => {
                  const href = `/accounts/${encodeURIComponent(a.id)}`;
                  const mine = byAccount[a.id] || [];
                  // 펼침 여부는 오직 이 상태만 본다.
                  // 예전엔 "현재 경로가 이 계정이면 열림" 조건을 함께 걸었는데,
                  // 그 계정 화면에 있는 동안에는 접어도 곧바로 다시 열려서
                  // 화살표를 눌러도 안 닫히는 것처럼 보였다.
                  const open = expanded === a.id;
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

                            {/* 폴더 맨 아래에 휴지통 — 웹메일과 같은 자리감.
                                버린 것이 어디로 갔는지 보이지 않으면 버리기를 망설이게 된다. */}
                            {trashOn && (
                              <Link href="/trash" className={path === '/trash' ? 'active' : ''}>
                                <span className="label">
                                  <span aria-hidden style={{ marginRight: 6 }}>🗑</span>
                                  휴지통
                                </span>
                              </Link>
                            )}
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

          {/* 메일함이 한 곳뿐이면 예전처럼 거래처를 바로 펼쳐 놓는다.
              계정 줄을 한 겹 씌워 봐야 늘 같은 주소 하나라 알려주는 것이 없다. */}
          {gi === 0 && !multiUi && groups.length > 0 && (
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
                      {/* 빨간 숫자는 아직 안 본 것, 회색은 최근 한 달에 오간 통수.
                          누적만 보여주면 확인해도 숫자가 그대로라 신호가 되지 않는다. */}
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

                {/* 폴더 맨 아래에 휴지통 — 켜 둔 설치에서만 */}
                {trashOn && (
                  <Link href="/trash" className={path === '/trash' ? 'active' : ''}>
                    <span className="label">
                      <span aria-hidden style={{ marginRight: 8 }}>🗑</span>
                      휴지통
                    </span>
                  </Link>
                )}
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
