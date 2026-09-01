'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Loading, { Spinner } from '@/components/Loading';
import { classificationLabel, langLabel } from '@/lib/labels';

/**
 * 휴지통 — 메일함의 휴지통으로 보낸 것이 쌓이는 자리.
 *
 * 버린 것이 어디로 갔는지 볼 자리가 없으면 버리기를 망설이게 된다.
 * 실제 메일은 메일함(웹메일)의 휴지통에 있고, 여기서는 '무엇을 언제 버렸는지'를
 * 되짚는다.
 *
 * **아무것도 지우지 않는다.** 목록이 길어지는 것은 기간으로 좁혀서 본다 —
 * 영구삭제를 이 화면에 두면 되돌릴 방법이 없어지고, 실수 한 번이 그대로 끝난다.
 * 정말 없앨 것은 웹메일에서 지우는 편이 맞다.
 */

/** 기간은 '받은 날짜' 기준이다.
 *  버린 시각으로 좁히면 아무 소용이 없다 — 웹메일에서 지운 것을 뒤늦게 한꺼번에
 *  알아차리므로 몇 년 치가 전부 같은 날 버린 것으로 기록된다(실측: 387건이 같은 날). */
const PERIODS = [
  { key: '30', label: '최근 한 달' },
  { key: '90', label: '최근 3개월' },
  { key: '365', label: '최근 1년' },
  { key: '', label: '전체 기간' },
];

const fmt = (d) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';
const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

export default function TrashPage() {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  // 기간을 걸기 전 전체 건수 — '숨겨진 N건' 을 정확히 알려주기 위해 따로 센다
  const [total, setTotal] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [restoring, setRestoring] = useState(null);
  const [q, setQ] = useState('');
  // 기본은 최근 한 달 — 오래된 것은 숨겨 두고 필요할 때 펼친다
  const [days, setDays] = useState('30');

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ trashed: 'true', limit: '200', sort: '-date' });
      if (q) qs.set('q', q);
      if (days) qs.set('since', new Date(Date.now() - Number(days) * 86400000).toISOString());

      // 기간 밖에 몇 건이 있는지 함께 센다. 숫자를 보여주지 않으면
      // '지워진 건가?' 로 읽힌다 — 이 화면은 아무것도 지우지 않는다.
      const allQs = new URLSearchParams({ trashed: 'true', limit: '1' });
      if (q) allQs.set('q', q);

      const [r, all] = await Promise.all([
        fetch(`/api/mails?${qs}`).then((x) => x.json()),
        fetch(`/api/mails?${allQs}`).then((x) => x.json()),
      ]);
      if (!r.ok) throw new Error(r.error);
      setItems(r.items); setCount(r.count);
      setTotal(all.ok ? all.count : null);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }, [q, days]);

  useEffect(() => { load(); }, [load]);

  /**
   * 되살리기 — **화면에서만** 다시 보이게 한다.
   * 휴지통에서 사라진 것이 '되돌린 것'인지 '영구삭제된 것'인지 IMAP 으로는
   * 구분할 수 없어 자동 복구를 없앴다. 대신 사람이 판단해 누른다.
   */
  async function restore(mail) {
    if (!confirm(`'${(mail.subject || '').slice(0, 50)}'

이 화면에서 다시 보이게 합니다.
메일함 원본은 건드리지 않으므로, 웹메일 휴지통에 있다면 그쪽에서도 원래 폴더로 옮겨 주세요.

계속할까요?`)) return;
    setRestoring(mail._id); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${mail._id}/trash`, { method: 'DELETE' }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMsg(r.message);
      await load();
    } catch (e) { setErr(String(e.message || e)); }
    setRestoring(null);
  }

  const hidden = total != null && days ? Math.max(0, total - count) : 0;
  const periodLabel = PERIODS.find((p) => p.key === days)?.label || '전체 기간';

  return (
    <>
      <h1 className="page-title">🗑 휴지통</h1>
      <p className="page-sub">
        메일함의 휴지통으로 보낸 메일입니다. <b>실제 메일은 웹메일 휴지통에 그대로 있고</b>,
        여기서는 무엇을 언제 버렸는지 확인하실 수 있습니다.
        잘못 버리셨으면 <b>[되살리기]</b>를 누르면 화면에 다시 나옵니다.
      </p>

      {msg && <div className="card" style={{ borderColor: 'var(--good)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <div className="card toolbar" style={{ marginBottom: 16 }}>
        <select value={days} onChange={(e) => setDays(e.target.value)} title="받은 날짜 기준">
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <div className="grow">
          <input placeholder="발신자·제목으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {periodLabel} {count.toLocaleString()}건
        </span>
      </div>

      {/* 숨긴 것은 지운 것이 아니다 — 몇 건이 어디 있는지 반드시 알려준다 */}
      {hidden > 0 && (
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {periodLabel}보다 오래 받은 <b>{hidden.toLocaleString()}건</b>은 숨겨져 있습니다.
            지워진 것이 아닙니다.
          </span>
          <button className="linklike" onClick={() => setDays('')}>전체 기간 보기</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {busy && !items.length ? (
          <Loading />
        ) : !items.length ? (
          <div className="empty">
            {days && hidden > 0
              ? `${periodLabel} 안에는 버린 메일이 없습니다. 오래된 ${hidden.toLocaleString()}건은 위에서 [전체 기간]으로 보실 수 있습니다.`
              : '휴지통으로 보낸 메일이 없습니다.'}
            {!hidden && (
              <div style={{ fontSize: 12, marginTop: 6 }}>
                메일 목록이나 상세 화면의 <b>🗑</b> 을 누르면 여기로 옵니다.
              </div>
            )}
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
                  <th style={{ width: 92 }}> </th>
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
                    <td className="muted" style={{ fontSize: 12 }}>
                      {fmt(m.trashedAt)}
                      <div style={{ fontSize: 10, marginTop: 2 }}>
                        {m.trashedBy === 'webmail' ? '웹메일에서' : '이 화면에서'}
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn secondary sm"
                        onClick={() => restore(m)} disabled={restoring === m._id}
                        title="화면에서 다시 보이게 합니다 (메일함은 건드리지 않습니다)">
                        {restoring === m._id ? <><Spinner /> 되살리는 중…</> : '되살리기'}
                      </button>
                    </td>
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
