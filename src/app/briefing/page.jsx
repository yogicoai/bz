'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import {
  classificationLabel, deadlineTypeLabel, urgencyLabel, ddayLabel, ddayTone, langLabel,
} from '@/lib/labels';

const inp = {
  padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13,
};

/** 위쪽 숫자 카드가 거는 필터 — 카드 라벨과 같은 말을 쓴다 */
const VIEW_LABEL = {
  all: '전체',
  reply: '답변 필요',
  deadline: '기한 있음',
  pending: '요약 대기',
};

const VIEW_FILTER = {
  all: () => true,
  reply: (m) => Boolean(m.analysis?.needsReply),
  deadline: (m) => Boolean(m.analysis?.deadline),
  pending: (m) => m.analysis?.method !== 'ai',
};

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

function BriefingInner() {
  const [date, setDate] = useState(kstToday());
  const [days, setDays] = useState(1);
  const [includeDone, setIncludeDone] = useState(false);
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');
  const [apiKeySet, setApiKeySet] = useState(true);
  // 위쪽 숫자 카드를 눌러 목록을 좁힌다 ('all' 이면 전체)
  const [view, setView] = useState('all');
  // 지난 미처리 건 펼침 여부 (기본은 접어 둔다 — 오늘 것에 먼저 집중)
  const [showMissed, setShowMissed] = useState(false);

  useEffect(() => {
    fetch('/api/estimate').then((r) => r.json())
      .then((r) => r.ok && setApiKeySet(Boolean(r.apiKeySet))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const qs = new URLSearchParams({ date, days: String(days), includeDone: String(includeDone) });
      const r = await fetch(`/api/briefing?${qs}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setB(r);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }, [date, days, includeDone]);

  useEffect(() => { load(); }, [load]);

  // 날짜·기간을 바꾸면 좁혀 둔 필터를 푼다 — 새 날짜에서 빈 화면을 보고
  // "메일이 없다"고 오해하는 것을 막는다
  useEffect(() => { setView('all'); }, [date, days]);

  const shown = (b?.items || []).filter(VIEW_FILTER[view] || VIEW_FILTER.all);

  /** 체크 = 처리완료(보관). 되돌리면 확인중으로. */
  async function toggle(mail) {
    const done = ['replied', 'archived', 'ignored'].includes(mail.status);
    const next = done ? 'reviewing' : 'archived';
    // 낙관적 반영 — 체크 리듬이 끊기지 않도록
    // 오늘 목록과 '지난 미처리' 목록 어느 쪽에서 눌러도 즉시 반영되어야 한다
    const flip = (list) => (list || []).map((m) => (m._id === mail._id ? { ...m, status: next } : m));
    setB((p) => ({ ...p, items: flip(p.items), missed: flip(p.missed) }));
    try {
      const r = await fetch(`/api/mails/${mail._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
    } catch (e) {
      setErr(String(e.message || e));
      load(); // 실패 시 서버 상태로 되돌린다
    }
  }

  async function analyzeAll() {
    if (!b?.unanalyzed) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/analyze-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: Math.min(b.unanalyzed, 20) }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMsg(`요약 생성 완료 — ${r.stats.analyzed}건`);
      await load();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  const shift = (n) => {
    const d = new Date(`${date}T00:00:00+09:00`);
    setDate(new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10));
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">오늘의 제안 브리핑</h1>
          <p className="page-sub">
            들어온 제안 메일을 하루 단위로 묶어 보여줍니다. 위에서부터 확인하고 체크해 내려가세요.
          </p>
        </div>
      </div>

      {msg && <div className="card" style={{ borderColor: 'var(--good)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <div className="card toolbar" style={{ marginBottom: 16 }}>
        <div className="seg">
          <button onClick={() => shift(-1)} title="이전날">←</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={() => shift(1)} disabled={date >= kstToday()} title="다음날">→</button>
        </div>

        <button className="btn secondary sm" onClick={() => setDate(kstToday())} disabled={date === kstToday()}>
          오늘
        </button>

        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>하루치</option>
          <option value={3}>최근 3일</option>
          <option value={7}>최근 7일</option>
        </select>

        <label className={`chip ${includeDone ? 'on' : ''}`}>
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          처리한 것도 보기
        </label>

        <div className="grow" />
        {b && <span className="muted" style={{ fontSize: 13 }}>{b.total}건</span>}
      </div>

      {busy && !b ? (
        <div className="empty">불러오는 중…</div>
      ) : !b ? null : (
        <>
          {/* 숫자를 보여주기만 하면 "그래서 그 4건이 뭔데" 를 찾으러 목록을 훑어야 한다.
              눌러서 그 4건만 남기는 것이 이 화면에서 가장 자주 하는 동작이다. */}
          <div className="cards" style={{ marginBottom: 16 }}>
            <Stat label="새 제안" value={b.total}
              active={view === 'all'} onClick={() => setView('all')} />
            <Stat label="답변 필요" value={b.needsReply} tone={b.needsReply ? 'bad' : null}
              active={view === 'reply'} onClick={() => setView('reply')} />
            <Stat label="기한 있음" value={b.withDeadline} tone={b.withDeadline ? 'warn' : null}
              active={view === 'deadline'} onClick={() => setView('deadline')} />
            <Stat label="요약 대기" value={b.unanalyzed}
              sub={b.unanalyzed ? 'AI 요약 미생성' : '모두 요약됨'}
              active={view === 'pending'} onClick={() => setView('pending')} />
          </div>

          {view !== 'all' && (
            <div className="row" style={{ marginBottom: 12, gap: 8 }}>
              <span className="badge b2b">{VIEW_LABEL[view]}만 보는 중 · {shown.length}건</span>
              <button className="linklike" onClick={() => setView('all')}>전체 보기</button>
            </div>
          )}

          {b.unanalyzed > 0 && !apiKeySet && (
            <div className="card" style={{ marginBottom: 14 }}>
              <b>{b.unanalyzed}건의 요약이 아직 없습니다.</b>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                현재는 Claude Code 세션에서 직접 요약해 넣는 방식으로 운용 중입니다.
                답변 필요 여부와 기한은 이미 잡혀 있으니 그대로 확인하실 수 있습니다.
              </div>
            </div>
          )}

          {b.unanalyzed > 0 && apiKeySet && (
            <div className="card" style={{ marginBottom: 14, borderColor: 'var(--warn)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <b>{b.unanalyzed}건의 요약이 아직 없습니다.</b>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    한글 번역과 내용 요약을 만들려면 AI 분석이 필요합니다(유료).
                  </div>
                </div>
                <button className="btn" onClick={analyzeAll} disabled={busy}>
                  {busy ? '생성 중…' : `${Math.min(b.unanalyzed, 20)}건 요약 생성`}
                </button>
              </div>
            </div>
          )}

          {!shown.length ? (
            <div className="card">
              <div className="empty">
                {view !== 'all'
                  ? `${VIEW_LABEL[view]}에 해당하는 메일이 없습니다.`
                  : '이 날짜에 새로 들어온 제안 메일이 없습니다.'}
                {view === 'all' && !includeDone && (
                  <><br /><span style={{ fontSize: 12 }}>처리 완료한 건을 보려면 위의 체크박스를 켜세요.</span></>
                )}
              </div>
            </div>
          ) : (
            shown.map((m, i) => <Item key={m._id} mail={m} index={i + 1} onToggle={() => toggle(m)} />)
          )}

          {/* 아직 손대지 않은 지난 건.
              하루치만 보여주면 어제 온 것을 오늘 열었을 때 화면이 비어
              "처리할 게 없다"로 읽힌다. 실제로는 밀려 있는데도 그렇다. */}
          {view === 'all' && b.missedTotal > 0 && (
            <div style={{ marginTop: 22 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <b style={{ fontSize: 15 }}>아직 처리하지 않은 지난 제안 {b.missedTotal}건</b>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    최근 한 달 안에 왔지만 아직 체크하지 않은 건입니다
                    {b.missedNeedsReply > 0 && <> · 그중 답변 필요 {b.missedNeedsReply}건</>}
                  </div>
                </div>
                <button className="btn secondary sm" onClick={() => setShowMissed((v) => !v)}>
                  {showMissed ? '접기' : '펼쳐 보기'}
                </button>
              </div>
              {showMissed && b.missed.map((m, i) => (
                <Item key={m._id} mail={m} index={i + 1} onToggle={() => toggle(m)} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Item({ mail, index, onToggle }) {
  const a = mail.analysis || {};
  const done = ['replied', 'archived', 'ignored'].includes(mail.status);

  return (
    <div className="card" style={{ marginBottom: 10, opacity: done ? 0.5 : 1 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          title={done ? '처리 취소' : '처리 완료로 표시'}
          style={{ width: 18, height: 18, marginTop: 3, flex: '0 0 auto', cursor: 'pointer' }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, marginBottom: 5 }}>
            <span className="muted" style={{ fontSize: 12 }}>{index}.</span>
            {a.needsReply && <span className="badge reply">답변 필요</span>}
            {a.deadline && (
              <span className={`badge ${ddayTone(a.deadline)}`}>
                {deadlineTypeLabel(a.deadlineType)} {ddayLabel(a.deadline)}
              </span>
            )}
            {a.urgency && a.urgency !== 'low' && (
              <span className={`badge ${a.urgency}`}>긴급 {urgencyLabel(a.urgency)}</span>
            )}
            {mail.group && <span className="badge b2b">{mail.group}</span>}
            <span className={`badge ${mail.classification}`}>{classificationLabel(mail.classification)}</span>
            {a.method !== 'ai' && <span className="badge">요약 없음</span>}
          </div>

          <Link href={`/mails/${mail._id}`}
            style={{ fontWeight: 600, fontSize: 15, textDecoration: done ? 'line-through' : 'none' }}>
            {mail.translation?.subject || mail.subject}
          </Link>

          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
            {mail.from?.name || ''} &lt;{mail.from?.address}&gt; · {fmtDay(mail.date)} · {langLabel(mail.lang)}
          </div>

          {a.summary ? (
            <div style={{ marginTop: 8, fontSize: 13 }}>{a.summary}</div>
          ) : (
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              (AI 요약이 아직 없습니다 — 위의 [요약 생성]을 누르거나 메일을 열어 개별 실행하세요)
            </div>
          )}

          {a.keyPoints?.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {a.keyPoints.slice(0, 3).map((p, i) => <li key={i} style={{ marginBottom: 2 }}>{p}</li>)}
            </ul>
          )}

          {a.suggestedAction && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>→ {a.suggestedAction}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 숫자 카드. 누르면 아래 목록이 그 항목만 남는다. */
function Stat({ label, value, sub, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card stat-btn${tone ? ` tone-${tone}` : ''}${active ? ' is-active' : ''}`}
      aria-pressed={active}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </button>
  );
}

export default function BriefingPage() {
  return <Suspense fallback={<div className="empty">불러오는 중…</div>}><BriefingInner /></Suspense>;
}
