'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { classificationLabel, statusLabel, langLabel, ddayLabel, ddayTone } from '@/lib/labels';

/**
 * 검토 완료 — 체크해서 처리한 메일이 모이는 곳.
 *
 * 브리핑에서 체크하면 목록에서 사라지는데, 그것이 어디로 갔는지 볼 자리가
 * 없으면 "지운 건가?" 싶어 체크를 망설이게 된다. 체크가 이 도구의 핵심
 * 동작이므로, 처리한 것이 쌓이는 자리를 따로 둔다.
 * 여기서 체크를 풀면 다시 처리 대기로 돌아간다.
 */

const DONE = ['replied', 'archived', 'ignored'];

const periodLabel = (f) => {
  if (f.from && f.to) return `${f.from} ~ ${f.to}`;
  if (f.days === '7') return '최근 7일';
  if (f.days === '30') return '최근 한 달';
  if (f.days === '90') return '최근 3개월';
  return '전체 기간';
};

const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

export default function DonePage() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState('all');
  const [f, setF] = useState({ q: '', days: '30', from: '', to: '' });

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ status: DONE.join(','), limit: '200' });
      if (f.from || f.to) {
        if (f.from) qs.set('since', new Date(`${f.from}T00:00:00+09:00`).toISOString());
        if (f.to) qs.set('until', new Date(`${f.to}T23:59:59+09:00`).toISOString());
      } else if (f.days) {
        qs.set('since', new Date(Date.now() - Number(f.days) * 86400000).toISOString());
      }
      if (f.q) qs.set('q', f.q);
      const r = await fetch(`/api/mails?${qs}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setItems(r.items); setCount(r.count);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }, [f]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setView('all'); }, [f]);

  /** 체크를 풀면 다시 처리 대기로 — 잘못 체크했을 때 되돌리는 길 */
  async function undo(mail) {
    setItems((p) => p.filter((m) => m._id !== mail._id));
    try {
      const r = await fetch(`/api/mails/${mail._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewing' }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
    } catch (e) { setErr(String(e.message || e)); load(); }
  }

  const archived = items.filter((m) => m.status === 'archived');
  const replied = items.filter((m) => m.status === 'replied');
  const ignored = items.filter((m) => m.status === 'ignored');

  const VIEWS = {
    all: { label: '전체', rows: items },
    archived: { label: '검토 완료', rows: archived },
    replied: { label: '답변완료', rows: replied },
    ignored: { label: '무시', rows: ignored },
  };
  const shown = (VIEWS[view] || VIEWS.all).rows;

  return (
    <>
      <h1 className="page-title">검토 완료</h1>
      <p className="page-sub">
        체크해서 처리하신 메일입니다. <b>지워진 것이 아니라</b> 여기 쌓입니다 —
        잘못 체크했다면 왼쪽 체크박스를 풀어 다시 처리 목록으로 되돌릴 수 있습니다.
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <div className="cards" style={{ marginBottom: 12 }}>
        <Stat label="검토 완료" value={archived.length}
          active={view === 'archived'} onClick={() => setView('archived')} />
        <Stat label="답변완료" value={replied.length} tone={replied.length ? 'good' : null}
          active={view === 'replied'} onClick={() => setView('replied')} />
        <Stat label="무시" value={ignored.length}
          active={view === 'ignored'} onClick={() => setView('ignored')} />
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
          <option value="7">최근 7일</option>
          <option value="30">최근 한 달</option>
          <option value="90">최근 3개월</option>
          <option value="">전체 기간</option>
        </select>
        <input type="date" value={f.from} max={f.to || undefined} style={{ width: 148 }}
          onChange={(e) => setF({ ...f, from: e.target.value })} title="시작일" />
        <span className="muted" style={{ fontSize: 13 }}>~</span>
        <input type="date" value={f.to} min={f.from || undefined} style={{ width: 148 }}
          onChange={(e) => setF({ ...f, to: e.target.value })} title="종료일" />
        <div className="grow">
          <input placeholder="발신자·제목·요약으로 검색" value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <button type="button" className="btn secondary sm"
          onClick={() => setF({ q: '', days: '30', from: '', to: '' })}>초기화</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {busy && !items.length ? (
          <div className="empty">불러오는 중…</div>
        ) : !shown.length ? (
          <div className="empty">
            {view === 'all'
              ? '아직 검토 완료로 처리한 메일이 없습니다.'
              : `${VIEWS[view].label}에 해당하는 메일이 없습니다.`}
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <Link href="/briefing" style={{ color: 'var(--accent)' }}>오늘의 브리핑</Link>
              {' '}에서 왼쪽 체크박스를 누르면 여기로 넘어옵니다.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }} title="체크를 풀면 다시 처리 목록으로 돌아갑니다"> </th>
                  <th style={{ width: 58 }}>날짜</th>
                  <th style={{ width: 160 }}>발신</th>
                  <th>제목 / 주제</th>
                  <th style={{ width: 90 }}>거래처</th>
                  <th style={{ width: 84 }}>기한</th>
                  <th style={{ width: 80 }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m._id}>
                    <td>
                      <input type="checkbox" checked readOnly={false}
                        onChange={() => undo(m)}
                        title="체크를 풀면 다시 처리 목록으로" />
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
                    <td>
                      {m.analysis?.deadline && (
                        <span className={`badge ${ddayTone(m.analysis.deadline)}`}>
                          {ddayLabel(m.analysis.deadline)}
                        </span>
                      )}
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
