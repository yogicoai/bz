'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  STATUSES, classificationLabel, statusLabel, langLabel,
  ddayLabel, ddayTone, urgencyLabel,
} from '@/lib/labels';

const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

export default function GroupPage({ params }) {
  const { group: raw } = use(params);
  const group = decodeURIComponent(raw);

  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ status: '', needsReply: '', q: '', hideAds: true });

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ group, limit: '200' });
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

  const open = items.filter((m) => ['new', 'reviewing'].includes(m.status));
  const needsReply = open.filter((m) => m.analysis?.needsReply);
  const withDeadline = open.filter((m) => m.analysis?.deadline);

  return (
    <>
      <Link href="/groups" className="muted" style={{ fontSize: 13 }}>← 거래처 전체</Link>

      <h1 className="page-title" style={{ marginTop: 8 }}>📁 {group}</h1>
      <p className="page-sub">
        전체 {count.toLocaleString()}통 · 미처리 {open.length}통
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <div className="cards" style={{ marginBottom: 18 }}>
        <Stat label="미처리" value={open.length} />
        <Stat label="답변 필요" value={needsReply.length} tone={needsReply.length ? 'bad' : null} />
        <Stat label="기한 있음" value={withDeadline.length} tone={withDeadline.length ? 'warn' : null} />
        <Stat label="전체 보관" value={count} />
      </div>

      <div className="card toolbar" style={{ marginBottom: 16 }}>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">상태 전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select value={f.needsReply} onChange={(e) => setF({ ...f, needsReply: e.target.value })}>
          <option value="">답변여부 전체</option>
          <option value="true">답변 필요만</option>
        </select>
        <div className="grow">
          <input placeholder="제목·요약 검색" value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <label className={`chip ${f.hideAds ? 'on' : ''}`}>
          <input type="checkbox" checked={f.hideAds}
            onChange={(e) => setF({ ...f, hideAds: e.target.checked })} />
          광고 숨김
        </label>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {busy && !items.length ? (
          <div className="empty">불러오는 중…</div>
        ) : !items.length ? (
          <div className="empty">조건에 맞는 메일이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 58 }}>날짜</th>
                <th style={{ width: 170 }}>발신</th>
                <th>제목 / 주제</th>
                <th style={{ width: 74 }}>답변</th>
                <th style={{ width: 84 }}>기한</th>
                <th style={{ width: 74 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m._id}>
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
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`card${tone ? ` tone-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi">{value.toLocaleString()}</div>
    </div>
  );
}
