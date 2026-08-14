'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import TrashButton from '@/components/TrashButton';
import {
  CLASSIFICATIONS, STATUSES,
  classificationLabel, statusLabel, langLabel, urgencyLabel,
  deadlineTypeLabel, ddayLabel, ddayTone,
} from '@/lib/labels';

/** 답장에 쓸 수 있는 글꼴 — 상대 메일 클라이언트에 기본 설치된 것만 (없으면 제멋대로 대체된다) */
const FONTS = [
  { value: 'Calibri', label: 'Calibri (기본)' },
  { value: 'Malgun Gothic', label: '맑은 고딕' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Gulim', label: '굴림' },
  { value: 'Batang', label: '바탕' },
];

const inp = {
  padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13, width: '100%',
};

const fmt = (d) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';
const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';

export default function MailDetailPage({ params }) {
  const { id } = use(params);
  const [mail, setMail] = useState(null);
  const [thread, setThread] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [est, setEst] = useState(null);
  // 이 설치에서 켜진 기능 (휴지통 보내기 등)
  const [features, setFeatures] = useState({});

  // 답장
  const [intent, setIntent] = useState('');
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  // 받는 사람 화면에 보일 글꼴·크기. 아웃룩 기본값과 같게 맞춰 둔다.
  const [font, setFont] = useState('Calibri');
  const [fontSize, setFontSize] = useState(10);
  const [lineHeight, setLineHeight] = useState(1.5);
  // 받는 사람·참조는 고칠 수 있어야 한다 — 시험 삼아 내 주소로 보내 보는 일이 잦다
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [files, setFiles] = useState([]);

  async function load() {
    try {
      const r = await fetch(`/api/mails/${id}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMail(r.mail);
      setThread(r.thread || []);
      setTo((prev) => prev || r.mail.from?.address || '');
    } catch (e) { setErr(String(e.message || e)); }
  }

  useEffect(() => {
    load();
    fetch(`/api/mails/${id}/send`).then((x) => x.json()).then((r) => setDryRun(r.dryRun)).catch(() => {});
    // 예상 비용도 로컬 계산이라 API 과금이 없다
    fetch(`/api/estimate?id=${id}`).then((x) => x.json()).then((r) => r.ok && setEst(r.estimate)).catch(() => {});
    fetch('/api/features').then((x) => x.json()).then((r) => r.ok && setFeatures(r.features || {})).catch(() => {});
    // id 는 라우트 파라미터라 마운트 후 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patch(body, okMsg) {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMail(r.mail);
      if (okMsg) setMsg(okMsg);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  async function analyze() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${id}/analyze`, { method: 'POST' }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      await load();
      setMsg('분석을 완료했습니다.');
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  /** 번역만 생성 — 분류·답변필요·기한(analysis)은 건드리지 않는다 */
  async function translate() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${id}/translate`, { method: 'POST' }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      await load();
      setMsg('한글 번역을 저장했습니다.');
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  async function makeDraft() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setDraft(r.draft);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  /**
   * AI 없이 바로 쓰기.
   *
   * 간단한 회신("네, 확인했습니다")까지 AI 를 거칠 이유가 없고,
   * 이미 문안이 머릿속에 있는 경우도 많다. 그럴 때 AI 초안을 기다리는 것은
   * 방해다. 같은 편집 화면을 빈 본문으로 열어 준다.
   */
  function startBlank() {
    const s = mail.subject || '';
    setDraft({
      subject: /^\s*re:/i.test(s) ? s : `Re: ${s}`,
      body: '',
      bodyKo: null,
      notes: null,
    });
    setErr(''); setMsg('');
  }

  /** 첨부 고르기 — 서버 요청 본문 한도가 있어 여기서 크기를 먼저 막는다 */
  const MAX_ATTACH = 3 * 1024 * 1024;
  async function addFiles(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = ''; // 같은 파일을 다시 고를 수 있게
    if (!picked.length) return;

    const read = (f) => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res({
        filename: f.name,
        size: f.size,
        contentType: f.type || 'application/octet-stream',
        content: String(fr.result).split(',')[1] || '',
      });
      fr.onerror = rej;
      fr.readAsDataURL(f);
    });

    try {
      const added = await Promise.all(picked.map(read));
      const next = [...files, ...added];
      const total = next.reduce((s, f) => s + f.size, 0);
      if (total > MAX_ATTACH) {
        setErr(`첨부파일이 너무 큽니다 (${(total / 1048576).toFixed(1)}MB). `
          + '합쳐서 3MB 까지 보낼 수 있습니다. 큰 파일은 링크로 보내시거나 나눠서 보내세요.');
        return;
      }
      setErr('');
      setFiles(next);
    } catch (e2) { setErr(String(e2.message || e2)); }
  }

  async function send() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: draft.subject,
          body: draft.body,
          to: to.trim(),
          cc: cc.trim() || undefined,
          font, fontSize, lineHeight,
          attachments: files,
        }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setConfirm(false);
      setMsg(r.message);
      if (!r.dryRun) { setDraft(null); setIntent(''); setFiles([]); setCc(''); }
      await load();
    } catch (e) { setErr(String(e.message || e)); setConfirm(false); }
    setBusy(false);
  }

  if (err && !mail) return <div className="card" style={{ borderColor: 'var(--bad)' }}>{err}</div>;
  if (!mail) return <div className="empty">불러오는 중…</div>;

  const a = mail.analysis;
  const t = mail.translation;
  const isAi = a?.method === 'ai';
  const isLocal = a?.method === 'local';

  return (
    <>
      <Link href="/mails" className="muted" style={{ fontSize: 12 }}>← 메일함</Link>

      <h1 className="page-title" style={{ marginTop: 8 }}>{t?.subject || mail.subject}</h1>
      <p className="page-sub">
        {mail.from?.name ? `${mail.from.name} ` : ''}&lt;{mail.from?.address}&gt; · {fmt(mail.date)} · {langLabel(mail.lang)}
        {mail.classifiedBy && <> · 분류: {mail.classifiedBy === 'rule' ? `규칙(${mail.ruleReason || ''})` : mail.classifiedBy === 'ai' ? 'AI' : '수동'}</>}
      </p>

      {msg && <div className="card" style={{ borderColor: 'var(--good)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      {/* ── 조작 바 ── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <select style={{ ...inp, width: 'auto' }} value={mail.status} onChange={(e) => patch({ status: e.target.value }, '상태를 변경했습니다.')} disabled={busy}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <select style={{ ...inp, width: 'auto' }} value={mail.classification} onChange={(e) => patch({ classification: e.target.value }, '분류를 변경했습니다.')} disabled={busy}>
            {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{classificationLabel(c)}</option>)}
          </select>
          <button className="btn secondary" onClick={analyze} disabled={busy}>
            {isAi ? 'AI 재분석' : 'AI 번역·요약 실행'}
            {est && ` (≈₩${est.krw.toLocaleString()})`}
          </button>
          <a className="btn secondary" href={`/api/mails/${id}/doc`}>정리 파일 (.md) 다운로드</a>
          {/* 메일함 원본을 건드리는 유일한 버튼이라 오른쪽 끝에 따로 둔다.
              켜 둔 설치(MAIL_TRASH)에서만 보인다. */}
          {features.trash && <div className="grow" />}
          {features.trash && (mail.trashedAt
            ? <span className="badge" title={mail.trashedTo}>휴지통으로 옮김</span>
            : (
              <TrashButton
                mailId={id}
                subject={mail.subject}
                size="md"
                label="🗑 휴지통으로"
                onDone={(r) => { load(); setMsg(r.message); }}
              />
            ))}
        </div>
        {est && (
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            예상 토큰 — 입력 {est.inputTokens.toLocaleString()} / 출력 {est.outputTokens.toLocaleString()}
            {' · '}{est.modelLabel} 기준 · 이 추정은 로컬 계산이라 과금되지 않습니다.
          </div>
        )}
      </div>

      {/* ── 핵심 정리 ── */}
      {a ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>핵심 정리</div>
            <span className="badge" style={isLocal ? undefined : { borderColor: 'var(--accent)', color: '#8fb0ff' }}>
              {isLocal ? '로컬 분석 (무료)' : `AI 분석 · ${a.model || ''}`}
            </span>
          </div>

          {isLocal && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              규칙 기반으로 <b>답변 필요 여부와 기한 후보</b>만 잡은 상태입니다(API 호출 없음).
              한글 번역과 정확한 요약이 필요하면 위의 <b>AI 번역·요약 실행</b>을 누르세요.
            </div>
          )}

          <div className="row" style={{ marginBottom: 12 }}>
            {a.needsReply
              ? <span className="badge reply">답변 필요</span>
              : <span className="badge low">답변 불필요</span>}
            {a.urgency && <span className={`badge ${a.urgency}`}>긴급도 {urgencyLabel(a.urgency)}</span>}
            {a.deadline && (
              <span className={`badge ${ddayTone(a.deadline)}`}>
                {deadlineTypeLabel(a.deadlineType)} {fmtDay(a.deadline)} · {ddayLabel(a.deadline)}
              </span>
            )}
          </div>

          {a.topic && <div style={{ fontWeight: 600, marginBottom: 6 }}>{a.topic}</div>}
          {a.summary && <div style={{ marginBottom: 14 }}>{a.summary}</div>}

          {(a.keyPoints?.length > 0 || a.points?.length > 0) && (
            <>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {isLocal ? '원문에서 뽑은 핵심 문장' : '주요 포인트'}
              </div>
              <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
                {(a.keyPoints || a.points || []).map((p, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{p}</li>
                ))}
              </ul>
            </>
          )}

          <div className="split" style={{ gap: 14 }}>
            <Info label="상대가 원하는 것" value={a.intent} />
            <Info label="다음 조치" value={a.suggestedAction} />
          </div>
          {a.needsReply && a.replyReason && <Info label="답변이 필요한 근거" value={a.replyReason} />}
          {a.deadlineText && <Info label={isLocal ? '기한이 언급된 문장' : '원문의 기한 표현'} value={`"${a.deadlineText}"`} />}

          <div className="muted" style={{ fontSize: 11, marginTop: 14 }}>
            {fmt(a.analyzedAt)}
            {a.usage && ` · 실사용 토큰 in ${a.usage.input}/캐시 ${a.usage.cacheRead} · out ${a.usage.output}`}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="muted">
            분석 결과가 없습니다.
            {(mail.classification === 'ad' || mail.classification === 'system')
              ? ' 규칙 필터에서 광고·자동발송으로 분류되었습니다. 필요하면 위의 [AI 번역·요약 실행]을 누르세요.'
              : ' 위의 [AI 번역·요약 실행]을 눌러 번역·요약을 생성하세요.'}
          </div>
        </div>
      )}

      {/* ── 같은 대화의 다른 메일 ── */}
      {thread.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">
            이 대화의 다른 메일 <span className="badge" style={{ marginLeft: 6 }}>{thread.length}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            제목이 같은 답장·전달을 하나의 대화로 묶었습니다. 오래된 순입니다.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {thread.map((x) => (
              <Link key={x._id} href={`/mails/${x._id}`}
                style={{
                  display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 10px',
                  border: '1px solid var(--border)', borderRadius: 8, textDecoration: 'none',
                }}>
                <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(x.date)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13 }}>{x.topic || x.subject}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                    {x.from?.name || x.from?.address}
                    {!x.analyzed && ' · 요약 없음'}
                  </span>
                </span>
                {x.needsReply && <span className="badge reply">답변</span>}
                {x.deadline && <span className={`badge ${ddayTone(x.deadline)}`}>{ddayLabel(x.deadline)}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 원문 / 번역 2단 ── */}
      <div className="split" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-title">원문</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{mail.subject}</div>
          <div className="mailbody orig">{mail.raw?.text || '(본문 없음)'}</div>
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="card-title" style={{ margin: 0 }}>한글 번역</div>
            {/* 한국어 메일에는 번역 버튼을 띄우지 않는다 — 눌러도 같은 글이 나오고 돈만 든다 */}
            {mail.lang !== 'ko' && (
              <button className="btn sm" onClick={translate} disabled={busy}>
                {busy ? '번역 중…' : t?.body ? '다시 번역' : '한글로 번역'}
              </button>
            )}
          </div>
          {t?.body ? (
            <>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{t.subject}</div>
              <div className="mailbody">{t.body}</div>
            </>
          ) : mail.lang === 'ko' ? (
            <div className="empty">한국어 메일이라 번역이 필요하지 않습니다.</div>
          ) : (
            <div className="empty">
              위의 <b>한글로 번역</b>을 누르면 번역본이 여기 표시되고 저장됩니다.
              <div style={{ fontSize: 12, marginTop: 6 }}>
                번역만 하므로 <b>AI 번역·요약 실행</b>보다 저렴하고, 이미 잡혀 있는
                답변 필요·기한 판정은 그대로 둡니다.
              </div>
            </div>
          )}
        </div>
      </div>

      {mail.attachments?.length > 0 && (() => {
        const files = mail.attachments.filter((x) => !x.inline);
        const inlineCount = mail.attachments.length - files.length;
        if (!files.length && !inlineCount) return null;

        return (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">첨부파일 {files.length}개</div>

            {files.map((x, i) => {
              // filter 로 걸러냈으므로 원본 배열에서의 위치를 다시 찾는다
              const idx = mail.attachments.indexOf(x);
              return (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: 20 }} aria-hidden>{fileIcon(x)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{x.filename}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {fileSize(x.size)} · {x.contentType}
                    </div>
                  </div>
                  {x.partId ? (
                    <a className="btn secondary sm" href={`/api/mails/${id}/attachment?i=${idx}`}>
                      다운로드
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>재수집 필요</span>
                  )}
                </div>
              );
            })}

            {inlineCount > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                본문에 삽입된 이미지 {inlineCount}개는 목록에서 제외했습니다(서명 로고 등).
              </div>
            )}
            <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              파일은 저장해 두지 않고 누를 때 메일 서버에서 바로 받아옵니다.
            </div>
          </div>
        );
      })()}

      {/* ── 답장 작성 ──
          답장이라고 해도 결국은 메일 한 통을 쓰는 일이다. 받는 사람·참조·제목·
          글꼴·첨부까지 여기서 다 끝나야 하고, 각 칸이 무엇인지 알 수 있어야 한다. */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">답장 작성</div>

        {dryRun ? (
          <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 14, background: 'var(--warn-weak)' }}>
            <b style={{ fontSize: 13 }}>지금은 시험 모드입니다 — 발송을 눌러도 메일이 나가지 않습니다</b>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              내용만 서버 기록에 남습니다. 실제로 보내려면 환경변수{' '}
              <code>MAIL_DRY_RUN</code> 을 <code>0</code> 으로 바꾸세요.
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
            발송하기를 누르면 <b>실제로 메일이 나갑니다.</b> 누르기 전에 확인 창에서
            받는 사람과 내용을 다시 보여 드립니다.
          </div>
        )}

        {/* ① 두 갈래 — AI 에게 맡기거나, 직접 쓰거나 */}
        {!draft && (
          <>
            <div style={{ marginBottom: 6 }}>
              <span className="badge b2b">1단계</span>{' '}
              <b style={{ fontSize: 14 }}>어떻게 쓰시겠어요?</b>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.8 }}>
              둘 중 편한 쪽을 고르시면 됩니다. 어느 쪽이든 <b>발송하기를 누르기 전에는 나가지 않고</b>,
              보내기 직전에 확인 창에서 한 번 더 보여 드립니다.
            </div>

            <div className="split" style={{ gap: 12 }}>
              {/* AI 에게 맡기기 */}
              <div className="card" style={{ background: 'var(--panel-2)' }}>
                <b style={{ fontSize: 14 }}>✨ AI 초안 만들기</b>
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 10px', lineHeight: 1.8 }}>
                  전할 내용을 <b>한국어로 요점만</b> 적으면, 원문 맥락과 상대방 언어를 반영해
                  인사말·본론·맺음말을 갖춘 메일로 정리해 줍니다.
                </div>
                <textarea style={{ ...inp, minHeight: 90 }} value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="예) 재고 있고 MOQ는 100개, 샘플은 다음 주 화요일 발송 가능. 단가는 확인 후 내일 회신하겠다고 전달" />
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={makeDraft} disabled={busy || !intent.trim()}>
                    {busy ? '만드는 중…' : '초안 만들기'}
                  </button>
                  {!intent.trim() && (
                    <span className="muted" style={{ fontSize: 12 }}>전할 내용을 먼저 적어 주세요</span>
                  )}
                </div>
              </div>

              {/* 직접 쓰기 */}
              <div className="card" style={{ background: 'var(--panel-2)' }}>
                <b style={{ fontSize: 14 }}>✍️ 직접 작성하기</b>
                <div className="muted" style={{ fontSize: 12, margin: '6px 0 10px', lineHeight: 1.8 }}>
                  AI 없이 빈 화면에서 바로 쓰십니다. 짧은 회신이거나 문안이 이미 정해져 있을 때
                  이쪽이 빠릅니다. 제목은 <b>Re:</b> 를 붙여 채워 둡니다.
                </div>
                <button className="btn secondary" onClick={startBlank} disabled={busy}>
                  빈 메일로 시작하기
                </button>
              </div>
            </div>
          </>
        )}

        {draft && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <span className="badge b2b">2단계</span>{' '}
                <b style={{ fontSize: 14 }}>보내기 전에 확인하고 고치세요</b>
              </div>
              {/* 쓰는 방식을 잘못 골랐을 때 되돌아갈 길 */}
              <button type="button" className="linklike"
                onClick={() => { setDraft(null); setFiles([]); }} disabled={busy}>
                ← 처음부터 다시
              </button>
            </div>

            {draft.notes && draft.notes !== '확인 필요 사항 없음' && (
              <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 12, background: 'var(--panel-2)' }}>
                <b style={{ fontSize: 13 }}>발송 전 확인</b>
                <div style={{ marginTop: 4, fontSize: 13 }}>{draft.notes}</div>
              </div>
            )}

            {/* 받는 사람 — 고칠 수 있어야 한다. 시험 삼아 내 주소로 보내 보는 일이 잦다. */}
            <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label>받는 사람</label>
                <input style={inp} value={to} onChange={(e) => setTo(e.target.value)}
                  placeholder="someone@example.com" />
              </div>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label>참조 (여러 명은 쉼표로)</label>
                <input style={inp} value={cc} onChange={(e) => setCc(e.target.value)}
                  placeholder="비워 두어도 됩니다" />
              </div>
            </div>
            <div className="row" style={{ marginTop: 6, gap: 8 }}>
              {to !== (mail.from?.address || '') && (
                <button type="button" className="linklike" onClick={() => setTo(mail.from?.address || '')}>
                  원래 보낸 사람({mail.from?.address})으로 되돌리기
                </button>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                주소를 바꾸면 원 대화에 묶지 않고 새 메일로 나갑니다 — 시험 발송에 쓰세요.
              </span>
            </div>

            <label style={{ marginTop: 14 }}>제목</label>
            <input style={inp} value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />

            {/* 글꼴 — 받는 사람 화면에 보일 모습 */}
            <label style={{ marginTop: 14 }}>글꼴 · 크기 · 줄간격</label>
            <div className="row" style={{ marginBottom: 8 }}>
              <select style={{ ...inp, width: 'auto' }} value={font} onChange={(e) => setFont(e.target.value)}>
                {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select style={{ ...inp, width: 'auto' }} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
                {[8, 9, 10, 11, 12, 14, 16, 18].map((n) => <option key={n} value={n}>{n} pt</option>)}
              </select>
              <select style={{ ...inp, width: 'auto' }} value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))}>
                {[1, 1.2, 1.5, 1.8, 2].map((n) => <option key={n} value={n}>줄간격 {n}</option>)}
              </select>
              <span className="muted" style={{ fontSize: 12 }}>한글은 자동으로 맑은 고딕으로 표시됩니다</span>
            </div>

            <label>본문 <span className="muted" style={{ fontWeight: 400 }}>— 아래 모습 그대로 나갑니다</span></label>
            <textarea
              style={{
                ...inp, minHeight: 240,
                fontFamily: `'${font}', 'Malgun Gothic', sans-serif`,
                fontSize: `${fontSize}pt`,
                lineHeight,
              }}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />

            {/* 첨부 */}
            <label style={{ marginTop: 14 }}>
              첨부파일 <span className="muted" style={{ fontWeight: 400 }}>— 합쳐서 3MB 까지</span>
            </label>
            <input type="file" multiple onChange={addFiles} style={{ ...inp, padding: 8 }} />
            {files.length > 0 && (
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {files.map((f, i) => (
                  <span key={i} className="chip on">
                    📎 {f.filename} ({Math.round(f.size / 1024).toLocaleString()}KB)
                    <button type="button" className="linklike" style={{ marginLeft: 6 }}
                      onClick={() => setFiles(files.filter((_, n) => n !== i))}>빼기</button>
                  </span>
                ))}
              </div>
            )}

            {draft.bodyKo && (
              <>
                <label style={{ marginTop: 14 }}>
                  한글 확인용 <span className="muted" style={{ fontWeight: 400 }}>— 발송되지 않습니다</span>
                </label>
                <div className="card" style={{ background: 'var(--panel-2)' }}>
                  <div className="mailbody" style={{ maxHeight: 260 }}>{draft.bodyKo}</div>
                </div>
              </>
            )}

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setConfirm(true)} disabled={busy || !to.trim()}>
                발송하기
              </button>
              <button className="btn secondary" onClick={() => setDraft(null)} disabled={busy}>초안 버리기</button>
            </div>
          </div>
        )}

        {mail.drafts?.filter((d) => d.sentAt).length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>발송 이력</div>
            {mail.drafts.filter((d) => d.sentAt).map((d, i) => (
              <div key={i} className="muted" style={{ fontSize: 12 }}>
                {fmt(d.sentAt)} → {d.to} · {d.subject}
                {d.attachments?.length > 0 && ` · 첨부 ${d.attachments.length}개`}
                {d.dryRun && <span className="badge"> 시험</span>}
              </div>
            ))}
          </div>
        )}
      </div>


      {/* ── 발송 확인 모달 ── */}
      {confirm && draft && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-title" style={{ fontSize: 15 }}>이 내용으로 발송합니다</div>
            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>받는 사람</div>
              {/* 화면에서 고친 주소를 그대로 보여 준다 — 원 발신자를 띄우면
                  시험 삼아 내 주소로 바꿔 놓고도 상대에게 가는 줄 알게 된다 */}
              <div style={{ fontWeight: 700, fontSize: 15 }}>{to}</div>
              {to !== (mail.from?.address || '') && (
                <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 2 }}>
                  원래 보낸 사람({mail.from?.address})이 아닌 주소입니다.
                </div>
              )}
            </div>
            {cc.trim() && (
              <div style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>참조</div>
                <div style={{ fontWeight: 600 }}>{cc}</div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>제목</div>
              <div style={{ fontWeight: 600 }}>{draft.subject}</div>
            </div>
            {files.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>첨부 {files.length}개</div>
                <div style={{ fontSize: 13 }}>
                  {files.map((f) => `${f.filename} (${Math.round(f.size / 1024).toLocaleString()}KB)`).join(', ')}
                </div>
              </div>
            )}
            <div className="muted" style={{ fontSize: 12 }}>
              본문 · {font} {fontSize}pt · 줄간격 {lineHeight}
            </div>
            <div className="card" style={{ background: 'var(--panel-2)', marginTop: 4 }}>
              <div className="mailbody" style={{ maxHeight: 300 }}>{draft.body}</div>
            </div>
            {dryRun && (
              <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                시험 모드 — 실제로 발송되지 않습니다.
              </div>
            )}
            <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setConfirm(false)} disabled={busy}>취소</button>
              <button className="btn" onClick={send} disabled={busy}>{busy ? '발송 중…' : dryRun ? '시험 실행' : '발송'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function fileSize(n = 0) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fileIcon(att) {
  const name = (att.filename || '').toLowerCase();
  const type = (att.contentType || '').toLowerCase();
  if (/\.(xlsx?|csv)$/.test(name) || type.includes('spreadsheet')) return '📊';
  if (/\.(docx?|hwpx?)$/.test(name) || type.includes('word')) return '📝';
  if (/\.pptx?$/.test(name) || type.includes('presentation')) return '📽️';
  if (/\.pdf$/.test(name) || type.includes('pdf')) return '📕';
  if (/\.(zip|7z|rar|tar|gz)$/.test(name)) return '🗜️';
  if (type.startsWith('image/')) return '🖼️';
  return '📎';
}

function Info({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}
