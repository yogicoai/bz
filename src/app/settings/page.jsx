'use client';

import { useEffect, useState } from 'react';

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)',
};

export default function SettingsPage() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
        setF({
          ...r.settings,
          imapPass: '',
          smtpPass: '',
          blockedDomains: (r.settings.blockedDomains || []).join('\n'),
          blockedKeywords: (r.settings.blockedKeywords || []).join('\n'),
        });
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((p) => ({ ...p, [k]: v }));
  };

  async function save() {
    setBusy(true); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setMsg('저장했습니다.');
      setF((p) => ({ ...p, imapPass: '', smtpPass: '', imapPassSet: r.settings.imapPassSet, smtpPassSet: r.settings.smtpPassSet }));
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  async function runTest() {
    setBusy(true); setMsg(''); setErr(''); setTest(null);
    try {
      const r = await fetch('/api/test/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setTest(r);
      setMsg(r.message);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  if (err && !f) return <div className="card" style={{ borderColor: 'var(--bad)' }}>{err}</div>;
  if (!f) return <div className="empty">불러오는 중…</div>;

  return (
    <>
      <h1 className="page-title">설정</h1>
      <p className="page-sub">메일 수신(IMAP)·발신(SMTP)·AI 모델과 광고 필터 규칙을 관리합니다.</p>

      {msg && <div className="card" style={{ borderColor: 'var(--good)', marginBottom: 14 }}>{msg}</div>}
      {err && <div className="card" style={{ borderColor: 'var(--bad)', marginBottom: 14 }}>{err}</div>}

      <Section title="메일 수신 (IMAP)"
        desc="이카운트 웹메일 → 환경설정 → IMAP/POP 설정 에서 수신 서버 주소와 포트를 확인해 입력하세요.">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="IMAP 서버" flex={2}>
            <input style={inp} value={f.imapHost || ''} onChange={set('imapHost')} placeholder="예: imap.ecount.com" />
          </Field>
          <Field label="포트">
            <input style={inp} value={f.imapPort || ''} onChange={set('imapPort')} placeholder="993" />
          </Field>
          <Field label="SSL">
            <select style={inp} value={String(f.imapSecure)} onChange={(e) => setF((p) => ({ ...p, imapSecure: e.target.value === 'true' }))}>
              <option value="true">사용 (993)</option>
              <option value="false">미사용 (143)</option>
            </select>
          </Field>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <Field label="계정(이메일)" flex={2}>
            <input style={inp} value={f.imapUser || ''} onChange={set('imapUser')} autoComplete="off" />
          </Field>
          <Field label={f.imapPassSet ? '비밀번호 (저장됨 · 변경 시만 입력)' : '비밀번호'} flex={2}>
            <input style={inp} type="password" value={f.imapPass || ''} onChange={set('imapPass')} autoComplete="new-password" />
          </Field>
          <Field label="수집 폴더">
            <input style={inp} value={f.imapFolder || ''} onChange={set('imapFolder')} placeholder="INBOX" />
          </Field>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn secondary" onClick={runTest} disabled={busy}>연결 테스트</button>
          <span className="muted" style={{ fontSize: 12 }}>저장 전에도 입력값 그대로 테스트합니다.</span>
        </div>

        {test?.folders && <FolderPicker folders={test.folders} f={f} setF={setF} />}
      </Section>

      <Section title="거래처 자동 분류"
        desc="메일함의 '내 메일함' 하위 폴더를 거래처 분류로 씁니다. 이미 분류해 두신 폴더를 함께 수집하면 '이 발신자는 이 거래처' 를 학습해, 새로 들어온 메일을 AI 없이(무료로) 같은 거래처로 자동 분류합니다.">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="발신자 이력으로 자동 분류" flex={2}>
            <select style={inp} value={String(f.autoGroup !== false)}
              onChange={(e) => setF((p) => ({ ...p, autoGroup: e.target.value === 'true' }))}>
              <option value="true">사용 — 이전에 같은 곳에서 온 메일과 같은 거래처로 지정 (권장)</option>
              <option value="false">미사용 — 폴더에서 온 메일만 거래처 지정</option>
            </select>
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          자동 지정된 거래처는 메일 상세에서 언제든 바꿀 수 있고, 사람이 바꾼 것은 이후 자동 분류가 덮어쓰지 않습니다.
          Gmail·네이버 같은 개인 메일 주소는 회사를 특정할 수 없어 도메인 추론에서 제외합니다.
        </div>
      </Section>

      <Section title="메일 발신 (SMTP)" desc="답장 발송에 사용합니다. 이카운트 발신 서버는 wsmtp.ecount.com 입니다.">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="SMTP 서버" flex={2}>
            <input style={inp} value={f.smtpHost || ''} onChange={set('smtpHost')} placeholder="wsmtp.ecount.com" />
          </Field>
          <Field label="포트">
            <input style={inp} value={f.smtpPort || ''} onChange={set('smtpPort')} placeholder="465" />
          </Field>
          <Field label="SSL">
            <select style={inp} value={String(f.smtpSecure)} onChange={(e) => setF((p) => ({ ...p, smtpSecure: e.target.value === 'true' }))}>
              <option value="true">사용 (465)</option>
              <option value="false">미사용 (587)</option>
            </select>
          </Field>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <Field label="계정" flex={2}>
            <input style={inp} value={f.smtpUser || ''} onChange={set('smtpUser')} autoComplete="off" />
          </Field>
          <Field label={f.smtpPassSet ? '비밀번호 (저장됨 · 변경 시만 입력)' : '비밀번호'} flex={2}>
            <input style={inp} type="password" value={f.smtpPass || ''} onChange={set('smtpPass')} autoComplete="new-password" />
          </Field>
        </div>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <Field label="발신자 이름">
            <input style={inp} value={f.mailFromName || ''} onChange={set('mailFromName')} />
          </Field>
          <Field label="발신 주소" flex={2}>
            <input style={inp} value={f.mailFromAddress || ''} onChange={set('mailFromAddress')} placeholder="비우면 SMTP 계정 사용" />
          </Field>
        </div>
      </Section>

      <Section title="AI 분석 (유료)"
        desc="수집·광고필터·기한 추출까지는 로컬에서 무료로 처리합니다. 한글 번역과 정밀 요약만 이 모델을 씁니다. 자동 분석을 켜면 수집한 모든 메일에 대해 비용이 발생하니, 평소에는 꺼두고 메일함에서 필요한 것만 골라 돌리는 편이 저렴합니다.">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="모델" flex={2}>
            <select style={inp} value={f.claudeModel || 'claude-haiku-4-5'} onChange={set('claudeModel')}>
              <option value="claude-haiku-4-5">claude-haiku-4-5 (기본 · 가장 저렴)</option>
              <option value="claude-sonnet-5">claude-sonnet-5 (중간)</option>
              <option value="claude-opus-5">claude-opus-5 (최고 품질 · 가장 비쌈)</option>
            </select>
          </Field>
          <Field label="1회 수집 최대 통수">
            <input style={inp} value={f.fetchLimit || ''} onChange={set('fetchLimit')} />
          </Field>
          <Field label="수집 후 자동 AI 분석">
            <select style={inp} value={String(f.autoAnalyze)} onChange={(e) => setF((p) => ({ ...p, autoAnalyze: e.target.value === 'true' }))}>
              <option value="false">끔 — 필요한 메일만 수동 분석 (권장)</option>
              <option value="true">켬 — 수집한 모든 메일 자동 분석 (비용 발생)</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="일일 브리핑"
        desc="하루 한 번(평일 오전 9시) 자동으로 메일을 수집하고, 제안 메일만 골라 요약한 뒤 브리핑을 만듭니다. 광고·자동발송은 요약 대상에서 빠지므로 하루 비용이 제안 건수만큼으로 묶입니다.">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="브리핑 받을 메일 주소" flex={2}>
            <input style={inp} value={f.briefingEmail || ''} onChange={set('briefingEmail')}
              placeholder="비우면 메일 발송 없이 화면에서만 확인" />
          </Field>
          <Field label="브리핑 기간">
            <select style={inp} value={f.briefingDays || 1} onChange={set('briefingDays')}>
              <option value={1}>하루치</option>
              <option value={3}>최근 3일 (월요일에 주말치까지)</option>
              <option value={7}>최근 7일</option>
            </select>
          </Field>
          <Field label="하루 요약 상한">
            <input style={inp} value={f.dailyAnalyzeLimit || ''} onChange={set('dailyAnalyzeLimit')} />
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          하루 요약 상한은 비용 안전장치입니다. 제안이 갑자기 몰려도 이 통수를 넘겨 과금되지 않으며,
          남은 건은 다음 날로 넘어가거나 브리핑 화면에서 직접 실행할 수 있습니다.
        </div>
      </Section>

      <Section title="광고 필터 규칙"
        desc="여기 걸리면 AI 분석 없이 '광고'로 분류합니다 (비용 절감). 삭제되지 않으므로 메일함에서 언제든 다시 볼 수 있습니다.">
        <div className="split">
          <Field label="차단 발신 도메인 (한 줄에 하나)">
            <textarea style={{ ...inp, minHeight: 110 }} value={f.blockedDomains || ''} onChange={set('blockedDomains')}
              placeholder={'mailchimp.com\nsendgrid.net'} />
          </Field>
          <Field label="차단 제목 키워드 (한 줄에 하나)">
            <textarea style={{ ...inp, minHeight: 110 }} value={f.blockedKeywords || ''} onChange={set('blockedKeywords')}
              placeholder={'(광고)\n[광고]'} />
          </Field>
        </div>
      </Section>

      <div className="row" style={{ marginTop: 20, marginBottom: 24 }}>
        <button className="btn" onClick={save} disabled={busy}>{busy ? '처리 중…' : '저장'}</button>
      </div>
    </>
  );
}

/**
 * 서버 폴더 선택 — 새 메일이 들어오는 폴더 1개 + 함께 수집할 거래처 폴더 여러 개.
 * 거래처 폴더는 이미 분류된 메일이라 발신자→거래처 학습 데이터가 된다.
 */
function FolderPicker({ folders, f, setF }) {
  const inboxLike = /^(INBOX|Sent|Drafts|Junk|Trash)$/i;
  const groupFolders = folders.filter((p) => !inboxLike.test(p));
  const selected = f.imapFolders || [];

  const toggle = (p) =>
    setF((s) => {
      const cur = s.imapFolders || [];
      return { ...s, imapFolders: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] };
    });

  const label = (p) => p.replace(/^INBOX[./]/i, '');

  return (
    <div className="card" style={{ marginTop: 14, background: 'var(--panel-2)' }}>
      <div className="card-title">서버 폴더 {folders.length}개</div>

      <label>새 메일이 들어오는 폴더 (분류 대상)</label>
      <div className="row" style={{ gap: 6, marginBottom: 18 }}>
        {folders.filter((p) => inboxLike.test(p)).map((p) => (
          <button key={p} type="button"
            className={`chip ${f.imapFolder === p ? 'on' : ''}`}
            onClick={() => setF((s) => ({ ...s, imapFolder: p }))}>
            {p}
          </button>
        ))}
      </div>

      {groupFolders.length > 0 && (
        <>
          <label>
            함께 수집할 거래처 폴더 ({selected.length}/{groupFolders.length} 선택)
          </label>
          <div className="row" style={{ gap: 6 }}>
            {groupFolders.map((p) => (
              <button key={p} type="button"
                className={`chip ${selected.includes(p) ? 'on' : ''}`}
                onClick={() => toggle(p)}>
                {label(p)}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn secondary sm"
              onClick={() => setF((s) => ({ ...s, imapFolders: groupFolders }))}>
              전체 선택
            </button>
            <button type="button" className="btn secondary sm"
              onClick={() => setF((s) => ({ ...s, imapFolders: [] }))}>
              전체 해제
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              선택한 폴더의 메일이 거래처 학습 데이터가 됩니다.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">{title}</div>
      {desc && <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 14 }}>{desc}</div>}
      {children}
    </div>
  );
}

function Field({ label, flex = 1, children }) {
  return (
    <div style={{ flex, minWidth: 140 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
