'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import {
  CLASSIFICATIONS, STATUSES,
  classificationLabel, statusLabel, langLabel, ddayLabel, ddayTone,
} from '@/lib/labels';
// 대화 묶어보기가 기본값이라 이 함수는 목록의 모든 행에서 불린다.
// import 가 빠져 있어 화면이 통째로 죽었다 — thread.js 는 순수 함수만 있어 클라이언트에서 안전하다.
import { displaySubject } from '@/lib/mail/thread';
import AccountTag, { useAccountTags } from '@/components/AccountTag';
import Loading, { Spinner } from '@/components/Loading';

const inp = {
  padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13,
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

function MailsInner() {
  // 메일함이 둘 이상일 때만 '어디서 온 메일인지' 를 행마다 붙인다
  const { show: showAccount, accounts } = useAccountTags();
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  // 광고는 기본으로 숨긴다 — 필요할 때만 켜서 오분류를 확인한다
  // 대화 묶어보기가 기본 — 답장이 20번 오간 건이 20줄로 늘어나면 진행 상황을 볼 수 없다
  const [f, setF] = useState({ classification: '', status: '', needsReply: '', q: '', group: '', hideAds: true, threaded: true });
  const [est, setEst] = useState(null);
  const [groups, setGroups] = useState([]);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams();
      if (f.classification) qs.set('classification', f.classification);
      else if (f.hideAds) {
        // 분류를 따로 고르지 않았을 때만 광고·자동발송을 제외
        qs.set('classification', 'b2b,inquiry,partner,newsletter,unknown');
      }
      if (f.status) qs.set('status', f.status);
      if (f.needsReply) qs.set('needsReply', 'true');
      if (f.group) qs.set('group', f.group);
      if (f.q) qs.set('q', f.q);
      if (f.threaded) qs.set('threaded', 'true');
      qs.set('limit', '100');
      const r = await fetch(`/api/mails?${qs}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setItems(r.items); setCount(r.count);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }, [f]);

  const loadEstimate = useCallback(async () => {
    try {
      const r = await fetch('/api/estimate').then((x) => x.json());
      if (r.ok) setEst(r);
    } catch { /* 추정 실패는 화면을 막지 않는다 */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** 체크 = 검토 완료. 브리핑·거래처 화면과 같은 동작. */
  const DONE = ['replied', 'archived', 'ignored'];
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
  useEffect(() => { loadEstimate(); }, [loadEstimate]);
  useEffect(() => {
    fetch('/api/groups').then((r) => r.json()).then((r) => r.ok && setGroups(r.groups)).catch(() => {});
  }, []);

  async function analyzeBatch(limit) {
    setBusy(true); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/analyze-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMsg(`AI 분석 완료 — ${r.stats.analyzed}/${r.stats.total}통` +
        (r.stats.errors?.length ? ` · 실패 ${r.stats.errors.length}` : ''));
      await load();
      await loadEstimate();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  async function ingest(recent) {
    setBusy(true); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recent ? { recent } : {}),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      const s = r.stats;
      setMsg(
        `수집 완료 (무료) — 조회 ${s.fetched} · 신규 ${s.inserted} · 중복 ${s.duplicate} · ` +
        `광고필터 ${s.ruleFiltered} · 로컬분석 ${s.localAnalyzed}` +
        (s.analyzed ? ` · AI분석 ${s.analyzed}` : '') +
        (s.errors?.length ? ` · 실패 ${s.errors.length}` : ''),
      );
      await load();
      await loadEstimate();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">메일함</h1>
          <p className="page-sub">
            {/* 데이터가 오기 전에 '0건'을 보여주면 비어 있는 것처럼 읽힌다 */}
            {busy && !items.length
              ? <Loading inline text="불러오는 중…" size="sm" />
              : (f.threaded ? `대화 ${count.toLocaleString()}건` : `총 ${count.toLocaleString()}통`)}
          </p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => ingest(20)} disabled={busy}>최근 20통 가져오기</button>
          <button className="btn" onClick={() => ingest()} disabled={busy}>{busy ? <><Spinner /> 수집 중…</> : '새 메일 수집'}</button>
        </div>
      </div>

      {msg && <div className="card" style={{ borderColor: 'var(--good)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      {/* 키가 없는 동안은 비용·버튼 대신 현재 운용 방식을 안내한다 */}
      {est && est.pending > 0 && !est.apiKeySet && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            요약 대기 {est.pending.toLocaleString()}통
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            지금은 <b>Claude Code 세션에서 직접 요약해 DB 에 넣는 방식</b>으로 운용 중입니다.
            답변 필요 여부와 기한은 이미 무료 로컬 분석으로 잡혀 있고, 한글 번역과 정밀 요약만 이 방식으로 채워집니다.
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            터미널에서 <code>npm run export-pending 10</code> → Claude Code 에 요약 요청 → <code>npm run apply-summaries</code>
          </div>
        </div>
      )}

      {/* 수집은 무료(로컬 규칙 분석). AI 번역·요약만 유료이므로 비용을 먼저 보여준다. */}
      {est && est.pending > 0 && est.apiKeySet && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--warn)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                AI 번역·요약 대기 {est.pending}통
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                예상 비용 · 1통 약 <b style={{ color: 'var(--text)' }}>₩{est.perMailKrw.toLocaleString()}</b>
                {' · '}전체 <b style={{ color: 'var(--text)' }}>₩{est.totalKrw.toLocaleString()}</b>
                {' '}({est.modelLabel} 기준, ${est.pricing?.in}/${est.pricing?.out} per MTok · ₩{est.usdKrw}/USD)
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                답변 필요·기한은 이미 <b>무료 로컬 분석</b>으로 잡혀 있습니다. AI 는 번역과 정밀 요약이 필요할 때만 돌리세요.
              </div>
            </div>
            <div className="row">
              <button className="btn secondary sm" onClick={() => analyzeBatch(5)} disabled={busy}>
                5통 분석 (≈₩{(est.perMailKrw * Math.min(5, est.pending)).toLocaleString()})
              </button>
              <button className="btn sm" onClick={() => analyzeBatch(20)} disabled={busy}>
                20통 분석 (≈₩{(est.perMailKrw * Math.min(20, est.pending)).toLocaleString()})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card toolbar" style={{ marginBottom: 16 }}>
        <select value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })}>
          <option value="">분류 전체</option>
          {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{classificationLabel(c)}</option>)}
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">상태 전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select value={f.needsReply} onChange={(e) => setF({ ...f, needsReply: e.target.value })}>
          <option value="">답변여부 전체</option>
          <option value="true">답변 필요만</option>
        </select>
        {groups.length > 0 && (
          <select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>
            <option value="">거래처 전체</option>
            {groups.map((g) => <option key={g.group} value={g.group}>{g.group} ({g.count})</option>)}
            <option value="__none__">거래처 미지정</option>
          </select>
        )}

        <div className="grow">
          <input placeholder="제목·발신·요약 검색" value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>

        <label className={`chip ${f.threaded ? 'on' : ''}`}
          title="같은 대화(Re:/Fw: 답장들)를 한 줄로 묶어 봅니다.">
          <input type="checkbox" checked={f.threaded}
            onChange={(e) => setF({ ...f, threaded: e.target.checked })} />
          대화 묶기
        </label>

        <label className={`chip ${f.hideAds && !f.classification ? 'on' : ''}`}
          title="광고·자동발송을 목록에서 숨깁니다. 삭제되는 것은 아닙니다.">
          <input type="checkbox" checked={f.hideAds} disabled={Boolean(f.classification)}
            onChange={(e) => setF({ ...f, hideAds: e.target.checked })} />
          광고 숨김
        </label>

        <button className="btn secondary sm"
          onClick={() => setF({ classification: '', status: '', needsReply: '', q: '', group: '', hideAds: true, threaded: true })}>
          초기화
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {busy && !items.length ? (
          <Loading />
        ) : !items.length ? (
          <div className="empty">
            메일이 없습니다. 우측 상단의 <b>최근 20통 가져오기</b>로 시작하세요.
            <br />
            <span style={{ fontSize: 12 }}>먼저 <Link href="/settings" style={{ color: 'var(--accent)' }}>설정</Link>에서 IMAP 연결을 확인해야 합니다.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th style={{ width: 34 }} title="읽고 판단이 끝났으면 체크하세요"> </th>
                <th style={{ width: 60 }}>날짜</th>
                <th style={{ width: 180 }}>발신</th>
                <th>제목 / 주제</th>
                <th style={{ width: 130 }}>거래처</th>
                <th style={{ width: 84 }}>분류</th>
                <th style={{ width: 74 }}>답변</th>
                <th style={{ width: 84 }}>기한</th>
                <th style={{ width: 74 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m._id} style={{ opacity: DONE.includes(m.status) ? 0.45 : 1 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={DONE.includes(m.status)}
                      onChange={() => toggle(m)}
                      title={DONE.includes(m.status) ? '검토 완료 취소' : '검토 완료로 표시'}
                    />
                  </td>
                  <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
                  <td style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    <div>{m.from?.name || m.from?.address}</div>
                    {m.from?.name && <div className="muted" style={{ fontSize: 11 }}>{m.from.address}</div>}
                    {showAccount && (
                      <div style={{ marginTop: 3 }}>
                        <AccountTag accountId={m.accountId} accounts={accounts} show={showAccount} />
                      </div>
                    )}
                  </td>
                  <td>
                    <Link href={`/mails/${m._id}`} style={{ fontWeight: 600 }}>
                      {/* 묶어 볼 때는 "SV: Re: SV: Re:" 가 겹겹이 쌓인 제목 대신 원래 제목을 쓴다 */}
                      {m.translation?.subject
                        || (f.threaded ? displaySubject(m.subject) : m.subject)}
                    </Link>
                    {m.threadCount > 1 && (
                      <span className="badge" style={{ marginLeft: 6 }} title="이 대화에서 오간 메일 수">
                        {m.threadCount}
                      </span>
                    )}
                    {m.analysis?.topic ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.analysis.topic}</div>
                    ) : m.analysis?.method === 'local' ? (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        로컬 분석만 · {langLabel(m.lang)} · 번역·요약은 AI 분석 필요
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {m.group
                      ? <span className="badge b2b" title={m.groupBy ? `근거: ${m.groupBy}` : ''}>{m.group}</span>
                      : <span className="muted" style={{ fontSize: 12 }}>-</span>}
                  </td>
                  <td><span className={`badge ${m.classification}`}>{classificationLabel(m.classification)}</span></td>
                  <td>{m.analysis?.needsReply ? <span className="badge reply">필요</span> : <span className="muted" style={{ fontSize: 12 }}>-</span>}</td>
                  <td>
                    {(m.threadDeadline || m.analysis?.deadline)
                      ? (() => {
                          // 묶어 볼 때는 대화 안에서 아직 안 지난 기한을 쓴다
                          const dl = m.threadDeadline || m.analysis.deadline;
                          return <span className={`badge ${ddayTone(dl)}`}>{ddayLabel(dl)}</span>;
                        })()
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

export default function MailsPage() {
  return <Suspense fallback={<Loading />}><MailsInner /></Suspense>;
}
