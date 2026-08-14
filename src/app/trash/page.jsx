'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Loading from '@/components/Loading';
import { classificationLabel, langLabel } from '@/lib/labels';

/**
 * 휴지통 — 메일함의 휴지통으로 보낸 것이 쌓이는 자리.
 *
 * 버린 것이 어디로 갔는지 볼 자리가 없으면 버리기를 망설이게 된다.
 * 실제 메일은 메일함(웹메일)의 휴지통에 있고, 여기서는 '무엇을 언제 버렸는지'를
 * 되짚는다. 되살리려면 웹메일 휴지통에서 원래 폴더로 옮기면 된다.
 */

const fmt = (d) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';
const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

export default function TrashPage() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ trashed: 'true', limit: '200', sort: '-date' });
      if (q) qs.set('q', q);
      const r = await fetch(`/api/mails?${qs}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setItems(r.items); setCount(r.count);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }, [q]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h1 className="page-title">🗑 휴지통</h1>
      <p className="page-sub">
        메일함의 휴지통으로 보낸 메일입니다. <b>실제 메일은 웹메일 휴지통에 그대로 있고</b>,
        여기서는 무엇을 언제 버렸는지 확인하실 수 있습니다.
        되살리시려면 웹메일 휴지통에서 원래 폴더로 옮기신 뒤 다시 수집하세요.
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <div className="card toolbar" style={{ marginBottom: 16 }}>
        <div className="grow">
          <input placeholder="발신자·제목으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{count.toLocaleString()}건</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {busy && !items.length ? (
          <Loading />
        ) : !items.length ? (
          <div className="empty">
            휴지통으로 보낸 메일이 없습니다.
            <div style={{ fontSize: 12, marginTop: 6 }}>
              메일 목록이나 상세 화면의 <b>🗑</b> 을 누르면 여기로 옵니다.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 58 }}>받은날</th>
                  <th style={{ width: 160 }}>발신</th>
                  <th>제목 / 주제</th>
                  <th style={{ width: 90 }}>거래처</th>
                  <th style={{ width: 130 }}>버린 시각</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m._id}>
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
                    <td className="muted" style={{ fontSize: 12 }}>{fmt(m.trashedAt)}</td>
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
