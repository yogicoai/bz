'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  STATUSES, classificationLabel, statusLabel, langLabel,
  ddayLabel, ddayTone, urgencyLabel,
} from '@/lib/labels';

/** 지금 어떤 기간을 보고 있는지 한 줄로 */
function periodLabel(f) {
  if (f.from && f.to) return `${f.from} ~ ${f.to}`;
  if (f.from) return `${f.from} 이후`;
  if (f.to) return `${f.to} 이전`;
  if (f.days === '30') return '최근 한 달';
  if (f.days === '90') return '최근 3개월';
  if (f.days === '365') return '최근 1년';
  return '전체 기간';
}

const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

export default function GroupPage({ params }) {
  const { group: raw } = use(params);
  const group = decodeURIComponent(raw);

  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  // 위 숫자 카드를 눌러 표를 좁힌다 ('all' 이면 전체)
  const [view, setView] = useState('all');
  // 거래처 한 곳에 500통이 넘게 쌓인 곳도 있다. 전부 불러오면 화면이 무거울 뿐
  // 아니라 지금 볼 것을 찾기가 어렵다. 기본은 최근 한 달이고 필요할 때 넓힌다.
  const [f, setF] = useState({
    status: '', needsReply: '', q: '', hideAds: true,
    days: '30',        // 빠른 선택 (달력을 쓰면 비운다)
    from: '', to: '',  // 달력으로 직접 지정
  });

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ group, limit: '200' });
      // 달력으로 직접 지정한 값이 있으면 그것이 우선한다
      if (f.from || f.to) {
        if (f.from) qs.set('since', new Date(`${f.from}T00:00:00+09:00`).toISOString());
        if (f.to) qs.set('until', new Date(`${f.to}T23:59:59+09:00`).toISOString());
      } else if (f.days) {
        qs.set('since', new Date(Date.now() - Number(f.days) * 86400000).toISOString());
      }
      if (f.status) qs.set('status', f.status);
      if (f.needsReply) qs.set('needsReply', 'true');
      if (f.q) qs.set('q', f.q);
      if (f.hideAds) qs.set('classification', 'b2b,inquiry,partner,newsletter,unknown');
      const r = await fetch(`/api/mails?${qs}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setItems(r.items); setCount(r.count);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }, [group, f]);

  useEffect(() => { load(); }, [load]);

  // 기간·검색을 바꾸면 좁혀 둔 카드 필터를 푼다 —
  // 조건이 바뀐 뒤에도 필터가 남아 빈 표를 보고 "메일이 없다"고 오해하지 않도록
  useEffect(() => { setView('all'); }, [f]);

  /**
   * 체크 = 검토 완료. 되돌리면 확인중으로.
   * 브리핑과 같은 동작이라 어느 화면에서 눌러도 같은 결과가 나온다.
   */
  const DONE = ['replied', 'archived', 'ignored'];
  async function toggle(mail) {
    const next = DONE.includes(mail.status) ? 'reviewing' : 'archived';
    // 낙관적 반영 — 여러 건을 연달아 체크할 때 리듬이 끊기지 않도록
    setItems((p) => p.map((m) => (m._id === mail._id ? { ...m, status: next } : m)));
    try {
      const r = await fetch(`/api/mails/${mail._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
    } catch (e) {
      setErr(String(e.message || e));
      load(); // 실패하면 서버 상태로 되돌린다
    }
  }

  const open = items.filter((m) => ['new', 'reviewing'].includes(m.status));
  const needsReply = open.filter((m) => m.analysis?.needsReply);
  const withDeadline = open.filter((m) => m.analysis?.deadline);

  // 위 숫자 카드를 눌러 아래 표를 좁힌다. 숫자만 보여주면
  // "그래서 그 61건이 뭔데" 를 찾으러 표를 훑어야 한다.
  const VIEWS = {
    all: { label: '전체', rows: items },
    open: { label: '아직 볼 것', rows: open },
    reply: { label: '답변 필요', rows: needsReply },
    deadline: { label: '기한 있음', rows: withDeadline },
  };
  const shown = (VIEWS[view] || VIEWS.all).rows;

  return (
    <>
      <Link href="/groups" className="muted" style={{ fontSize: 13 }}>← 거래처 전체</Link>

      <h1 className="page-title" style={{ marginTop: 8 }}>📁 {group}</h1>
      <p className="page-sub">
        {periodLabel(f)} {count.toLocaleString()}통 · 아직 볼 것 {open.length}통
        {' — '}읽고 판단이 끝난 건은 <b>왼쪽 체크박스</b>를 누르면 검토 완료로 표시됩니다.
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <div className="cards" style={{ marginBottom: 12 }}>
        <Stat label="아직 볼 것" value={open.length}
          active={view === 'open'} onClick={() => setView('open')} />
        <Stat label="답변 필요" value={needsReply.length} tone={needsReply.length ? 'bad' : null}
          active={view === 'reply'} onClick={() => setView('reply')} />
        <Stat label="기한 있음" value={withDeadline.length} tone={withDeadline.length ? 'warn' : null}
          active={view === 'deadline'} onClick={() => setView('deadline')} />
        <Stat label={periodLabel(f)} value={count} sub="전체 보기"
          active={view === 'all'} onClick={() => setView('all')} />
      </div>

      {view !== 'all' && (
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <span className="badge b2b">{VIEWS[view].label}만 보는 중 · {shown.length}건</span>
          <button className="linklike" onClick={() => setView('all')}>전체 보기</button>
        </div>
      )}

      <div className="card toolbar" style={{ marginBottom: 16 }}>
        <select value={f.from || f.to ? '' : f.days}
          onChange={(e) => setF({ ...f, days: e.target.value, from: '', to: '' })}
          title="기본은 최근 한 달입니다. 오래된 건을 찾을 때만 넓히세요.">
          <option value="30">최근 한 달</option>
          <option value="90">최근 3개월</option>
          <option value="365">최근 1년</option>
          <option value="">전체 기간</option>
        </select>
        {/* 달력으로 직접 지정 — 특정 시기의 대화를 찾을 때 */}
        <input type="date" value={f.from} max={f.to || undefined} style={{ width: 148 }}
          onChange={(e) => setF({ ...f, from: e.target.value })} title="시작일" />
        <span className="muted" style={{ fontSize: 13 }}>~</span>
        <input type="date" value={f.to} min={f.from || undefined} style={{ width: 148 }}
          onChange={(e) => setF({ ...f, to: e.target.value })} title="종료일" />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">상태 전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select value={f.needsReply} onChange={(e) => setF({ ...f, needsReply: e.target.value })}>
          <option value="">답변여부 전체</option>
          <option value="true">답변 필요만</option>
        </select>
        <div className="grow">
          <input placeholder="발신자·제목·요약으로 검색 (예: Okan, 계약, 샘플)" value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <label className={`chip ${f.hideAds ? 'on' : ''}`}>
          <input type="checkbox" checked={f.hideAds}
            onChange={(e) => setF({ ...f, hideAds: e.target.checked })} />
          광고 숨김
        </label>
        <button type="button" className="btn secondary sm"
          onClick={() => setF({ status: '', needsReply: '', q: '', hideAds: true, days: '30', from: '', to: '' })}>
          초기화
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {busy && !items.length ? (
          <div className="empty">불러오는 중…</div>
        ) : !shown.length ? (
          <div className="empty">
            {view === 'all'
              ? '조건에 맞는 메일이 없습니다.'
              : `${VIEWS[view].label}에 해당하는 메일이 없습니다.`}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th style={{ width: 34 }} title="읽고 판단이 끝났으면 체크하세요"> </th>
                <th style={{ width: 58 }}>날짜</th>
                <th style={{ width: 170 }}>발신</th>
                <th>제목 / 주제</th>
                <th style={{ width: 74 }}>답변</th>
                <th style={{ width: 84 }}>기한</th>
                <th style={{ width: 74 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m._id} style={{ opacity: DONE.includes(m.status) ? 0.45 : 1 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={DONE.includes(m.status)}
                      onChange={() => toggle(m)}
                      title={DONE.includes(m.status) ? '검토 완료 취소' : '검토 완료로 표시'}
                    />
                  </td>
                  <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDay(m.date)}</td>
                  <td style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    <div>{m.from?.name || m.from?.address}</div>
                    {m.from?.name && <div className="muted" style={{ fontSize: 11 }}>{m.from.address}</div>}
                  </td>
                  <td>
                    <Link href={`/mails/${m._id}`} style={{ fontWeight: 600 }}>
                      {m.translation?.subject || m.subject}
                    </Link>
                    {m.analysis?.topic ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.analysis.topic}</div>
                    ) : (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {langLabel(m.lang)} · {classificationLabel(m.classification)}
                        {m.groupBy && m.groupBy !== 'folder' && ` · 자동분류(${m.groupBy})`}
                      </div>
                    )}
                  </td>
                  <td>
                    {m.analysis?.needsReply
                      ? <span className="badge reply">필요</span>
                      : <span className="muted" style={{ fontSize: 12 }}>-</span>}
                  </td>
                  <td>
                    {m.analysis?.deadline
                      ? <span className={`badge ${ddayTone(m.analysis.deadline)}`}>{ddayLabel(m.analysis.deadline)}</span>
                      : m.analysis?.urgency && m.analysis.urgency !== 'low'
                        ? <span className={`badge ${m.analysis.urgency}`}>{urgencyLabel(m.analysis.urgency)}</span>
                        : <span className="muted" style={{ fontSize: 12 }}>-</span>}
                  </td>
                  <td><span className={`badge ${m.status}`}>{statusLabel(m.status)}</span></td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** 숫자 카드. 누르면 아래 표가 그 항목만 남는다. */
function Stat({ label, value, sub, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card stat-btn${tone ? ` tone-${tone}` : ''}${active ? ' is-active' : ''}`}
      aria-pressed={active}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi">{value.toLocaleString()}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </button>
  );
}
