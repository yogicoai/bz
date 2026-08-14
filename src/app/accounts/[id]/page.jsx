'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import Loading from '@/components/Loading';
import TrashButton from '@/components/TrashButton';
import {
  STATUSES, classificationLabel, statusLabel, langLabel,
  ddayLabel, ddayTone,
} from '@/lib/labels';

/**
 * 메일 계정 하나만 보는 화면.
 *
 * 여러 메일함을 등록한 경우, 사람의 머릿속 구분은 거래처보다 먼저
 * "이건 회사 메일이고 이건 네이버로 온 것" 이다. 그 축을 그대로 화면에 둔다.
 * 안에서 다시 답변 필요·기한·검색으로 좁힌다.
 */

function periodLabel(f) {
  if (f.from && f.to) return `${f.from} ~ ${f.to}`;
  if (f.days === '30') return '최근 한 달';
  if (f.days === '90') return '최근 3개월';
  if (f.days === '365') return '최근 1년';
  return '전체 기간';
}

const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

const DONE = ['replied', 'archived', 'ignored'];

export default function AccountPage({ params }) {
  const { id } = use(params);

  const [account, setAccount] = useState(null);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState('all');
  // 휴지통 기능이 켜진 설치에서만 삭제 열을 띄운다
  const [canTrash, setCanTrash] = useState(false);

  useEffect(() => {
    fetch('/api/features').then((r) => r.json())
      .then((r) => r.ok && setCanTrash(Boolean(r.features?.trash))).catch(() => {});
  }, []);
  const [f, setF] = useState({ status: '', needsReply: '', q: '', hideAds: true, days: '30', from: '', to: '' });

  useEffect(() => {
    fetch('/api/accounts').then((r) => r.json())
      .then((r) => r.ok && setAccount((r.accounts || []).find((a) => a.id === id) || null))
      .catch(() => {});
  }, [id]);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ accountId: id, limit: '200' });
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
  }, [id, f]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setView('all'); }, [f]);

  async function toggle(mail) {
    const next = DONE.includes(mail.status) ? 'reviewing' : 'archived';
    setItems((p) => p.map((m) => (m._id === mail._id ? { ...m, status: next } : m)));
    try {
      const r = await fetch(`/api/mails/${mail._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
    } catch (e) { setErr(String(e.message || e)); load(); }
  }

  const open = items.filter((m) => ['new', 'reviewing'].includes(m.status));
  const needsReply = open.filter((m) => m.analysis?.needsReply);
  const withDeadline = open.filter((m) => m.analysis?.deadline);

  const VIEWS = {
    all: { label: '전체', rows: items },
    open: { label: '아직 볼 것', rows: open },
    reply: { label: '답변 필요', rows: needsReply },
    deadline: { label: '기한 있음', rows: withDeadline },
  };
  const shown = (VIEWS[view] || VIEWS.all).rows;

  return (
    <>
      <Link href="/briefing" className="muted" style={{ fontSize: 13 }}>← 오늘의 브리핑</Link>

      <h1 className="page-title" style={{ marginTop: 8 }}>
        ✉️ {account?.label || '메일 계정'}
      </h1>
      <p className="page-sub">
        {account?.user}{account ? ' · ' : ''}{periodLabel(f)} {count.toLocaleString()}통 · 아직 볼 것 {open.length}통
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
          onChange={(e) => setF({ ...f, days: e.target.value, from: '', to: '' })}>
          <option value="30">최근 한 달</option>
          <option value="90">최근 3개월</option>
          <option value="365">최근 1년</option>
          <option value="">전체 기간</option>
        </select>
        <input type="date" value={f.from} max={f.to || undefined} style={{ width: 148 }}
          onChange={(e) => setF({ ...f, from: e.target.value })} title="시작일" />
        <span className="muted" style={{ fontSize: 13 }}>~</span>
        <input type="date" value={f.to} min={f.from || undefined} style={{ width: 148 }}
          onChange={(e) => setF({ ...f, to: e.target.value })} title="종료일" />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">상태 전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <div className="grow">
          <input placeholder="발신자·제목·요약으로 검색" value={f.q}
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

      <div className="card" style={{ padding: 0 }}>
        {busy && !items.length ? (
          <Loading />
        ) : !shown.length ? (
          <div className="empty">
            {view === 'all' ? '조건에 맞는 메일이 없습니다.' : `${VIEWS[view].label}에 해당하는 메일이 없습니다.`}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}> </th>
                  <th style={{ width: 58 }}>날짜</th>
                  <th style={{ width: 170 }}>발신</th>
                  <th>제목 / 주제</th>
                  <th style={{ width: 90 }}>거래처</th>
                  <th style={{ width: 74 }}>답변</th>
                  <th style={{ width: 84 }}>기한</th>
                  {canTrash && <th style={{ width: 44 }}> </th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m._id} style={{ opacity: DONE.includes(m.status) ? 0.45 : 1 }}>
                    <td>
                      <input type="checkbox" checked={DONE.includes(m.status)} onChange={() => toggle(m)} />
                    </td>
                    <td className="muted">{fmtDay(m.date)}</td>
                    <td>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.from?.name || m.from?.address}
                      </div>
                    </td>
                    <td>
                      <Link href={`/mails/${m._id}`} style={{ fontWeight: 600 }}>
                        {m.analysis?.topic || m.translation?.subject || m.subject}
                      </Link>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {classificationLabel(m.classification)} · {langLabel(m.lang)}
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{m.group || '-'}</td>
                    <td>{m.analysis?.needsReply && <span className="badge reply">필요</span>}</td>
                    <td>
                      {m.analysis?.deadline && (
                        <span className={`badge ${ddayTone(m.analysis.deadline)}`}>
                          {ddayLabel(m.analysis.deadline)}
                        </span>
                      )}
                    </td>
                    {canTrash && (
                      <td>
                        <TrashButton mailId={m._id} subject={m.subject} onDone={load} />
                      </td>
                    )}
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

function Stat({ label, value, sub, tone, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`card stat-btn${tone ? ` tone-${tone}` : ''}${active ? ' is-active' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi">{value.toLocaleString()}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </button>
  );
}
