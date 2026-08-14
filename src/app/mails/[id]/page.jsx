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

  // 답장
  const [intent, setIntent] = useState('');
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  // 받는 사람 화면에 보일 글꼴·크기. 아웃룩 기본값과 같게 맞춰 둔다.
  const [font, setFont] = useState('Calibri');
  const [fontSize, setFontSize] = useState(10);

  async function load() {
    try {
      const r = await fetch(`/api/mails/${id}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMail(r.mail);
      setThread(r.thread || []);
    } catch (e) { setErr(String(e.message || e)); }
  }

  useEffect(() => {
    load();
    fetch(`/api/mails/${id}/send`).then((x) => x.json()).then((r) => setDryRun(r.dryRun)).catch(() => {});
    // 예상 비용도 로컬 계산이라 API 과금이 없다
    fetch(`/api/estimate?id=${id}`).then((x) => x.json()).then((r) => r.ok && setEst(r.estimate)).catch(() => {});
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

  async function send() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch(`/api/mails/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draft.subject, body: draft.body, font, fontSize }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setConfirm(false);
      setMsg(r.message);
      if (!r.dryRun) { setDraft(null); setIntent(''); }
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
          <div className="grow" />
          {/* 메일함 원본을 건드리는 유일한 버튼이라 오른쪽 끝에 따로 둔다 */}
          {mail.trashedAt
            ? <span className="badge" title={mail.trashedTo}>휴지통으로 옮김</span>
            : (
              <TrashButton
                mailId={id}
                subject={mail.subject}
                size="md"
                label="🗑 휴지통으로"
                onDone={(r) => { load(); setMsg(r.message); }}
              />
            )}
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

      {/* ── 답장 ── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">답장</div>
        {dryRun && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            현재 <b>DRY RUN</b> 모드입니다 — 발송 버튼을 눌러도 실제로 나가지 않고 서버 콘솔에만 기록됩니다.
            실제 발송하려면 <code>.env.local</code> 의 <code>MAIL_DRY_RUN</code> 을 <code>0</code> 으로 바꾸세요.
          </div>
        )}

        <label>전달할 내용 (한국어로 편하게 쓰세요 — 상대 언어로 변환됩니다)</label>
        <textarea style={{ ...inp, minHeight: 90 }} value={intent} onChange={(e) => setIntent(e.target.value)}
          placeholder="예) 재고 있고 MOQ는 100개, 샘플은 다음 주 화요일 발송 가능. FOB 부산 기준 단가는 확인 후 내일 회신하겠다고 전달" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn secondary" onClick={makeDraft} disabled={busy || !intent.trim()}>
            {busy ? '생성 중…' : '초안 생성'}
          </button>
        </div>
        {/* 버튼만 있으면 무엇이 일어나는지 몰라 누르기를 망설이게 된다 */}
        <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>
          <b>초안 생성</b>을 누르면 위에 적으신 내용으로 <b>AI가 답장 초안을 만들어 줍니다.</b><br />
          원문 메일의 맥락과 상대방이 쓰는 언어를 반영해, 인사말·본론·맺음말을 갖춘
          메일 양식으로 정리됩니다. 만들어진 초안은 <b>발송 전에 직접 고칠 수 있고</b>,
          발송하기를 누르기 전에는 나가지 않습니다.
        </div>

        {draft && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            {draft.notes && draft.notes !== '확인 필요 사항 없음' && (
              <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: 12, background: 'var(--panel-2)' }}>
                <b>발송 전 확인</b>
                <div style={{ marginTop: 4 }}>{draft.notes}</div>
              </div>
            )}
            <label>받는 사람</label>
            <input style={inp} value={mail.from?.address || ''} readOnly />
            <label style={{ marginTop: 10 }}>제목</label>
            <input style={inp} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            <label style={{ marginTop: 10 }}>글꼴 · 크기 (받는 사람 화면에 이렇게 보입니다)</label>
            <div className="row" style={{ marginBottom: 10 }}>
              <select style={{ ...inp, width: 'auto' }} value={font} onChange={(e) => setFont(e.target.value)}>
                {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select style={{ ...inp, width: 'auto' }} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
                {[8, 9, 10, 11, 12, 14, 16, 18].map((n) => <option key={n} value={n}>{n} pt</option>)}
              </select>
              <span className="muted" style={{ fontSize: 12 }}>
                한글은 자동으로 맑은 고딕으로 표시됩니다
              </span>
            </div>

            <label>본문 (실제 발송 내용 — 직접 수정 가능)</label>
            <textarea
              style={{
                ...inp, minHeight: 220,
                // 편집 중에도 발송될 모습 그대로 보이게 한다
                fontFamily: `'${font}', 'Malgun Gothic', sans-serif`,
                fontSize: `${fontSize}pt`,
                lineHeight: 1.5,
              }}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />

            {draft.bodyKo && (
              <>
                <label style={{ marginTop: 10 }}>본문 한글 확인용 (발송되지 않음)</label>
                <div className="card" style={{ background: 'var(--panel-2)' }}>
                  <div className="mailbody" style={{ maxHeight: 260 }}>{draft.bodyKo}</div>
                </div>
              </>
            )}

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => setConfirm(true)} disabled={busy}>발송하기</button>
              <button className="btn secondary" onClick={() => setDraft(null)} disabled={busy}>초안 버리기</button>
            </div>
          </div>
        )}

        {mail.drafts?.filter((d) => d.sentAt).length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>발송 이력</div>
            {mail.drafts.filter((d) => d.sentAt).map((d, i) => (
              <div key={i} className="muted" style={{ fontSize: 12 }}>
                {fmt(d.sentAt)} → {d.to} · {d.subject} {d.dryRun && <span className="badge">DRY RUN</span>}
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
              <div style={{ fontWeight: 600 }}>{mail.from?.address}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>제목</div>
              <div style={{ fontWeight: 600 }}>{draft.subject}</div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>본문</div>
            <div className="card" style={{ background: 'var(--panel-2)', marginTop: 4 }}>
              <div className="mailbody" style={{ maxHeight: 300 }}>{draft.body}</div>
            </div>
            {dryRun && (
              <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                DRY RUN 모드 — 실제로 발송되지 않습니다.
              </div>
            )}
            <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setConfirm(false)} disabled={busy}>취소</button>
              <button className="btn" onClick={send} disabled={busy}>{busy ? '발송 중…' : dryRun ? 'DRY RUN 실행' : '발송'}</button>
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
