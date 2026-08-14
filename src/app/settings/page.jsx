'use client';

import { useEffect, useState } from 'react';
import MailAccounts from '@/components/MailAccounts';

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)',
};

export default function SettingsPage() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // 이 설치에서 여러 메일함을 쓸지 (환경변수 MULTI_ACCOUNT=1 인 프로젝트만)
  const [features, setFeatures] = useState({});
  // 계정별 연결 상태 (마지막 수집이 성공했는지)
  const [status, setStatus] = useState([]);

  const loadStatus = () => fetch('/api/accounts')
    .then((r) => r.json())
    .then((r) => { if (r.ok) setStatus(r.accounts || []); })
    .catch(() => {});

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
        setFeatures(r.features || {});
        const s = r.settings;
        // 계정 목록을 아직 안 쓰던 설치는, 예전 자리(imapHost/imapUser)에 있던
        // 값을 계정 카드 하나로 보여준다. id 를 'main' 으로 두면 이미 쌓인
        // 수집 기준점·메일과 그대로 이어지므로 저장해도 아무것도 달라지지 않는다.
        const seeded = (s.imapAccounts || []).length
          ? s.imapAccounts
          : (s.imapHost || s.imapUser
            ? [{
              id: 'main',
              label: s.imapUser || '메일 계정',
              host: s.imapHost || '', port: s.imapPort || 993, secure: s.imapSecure !== false,
              user: s.imapUser || '', pass: '', passSet: Boolean(s.imapPassSet),
              folders: [s.imapFolder || 'INBOX', ...(s.imapFolders || [])].filter(Boolean),
              enabled: true,
            }]
            : []);

        setF({
          ...s,
          imapPass: '',
          smtpPass: '',
          imapAccounts: seeded,
          blockedDomains: (s.blockedDomains || []).join('\n'),
          blockedKeywords: (s.blockedKeywords || []).join('\n'),
        });
      })
      .catch((e) => setErr(String(e.message || e)));
    loadStatus();
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
      setF((p) => ({
        ...p,
        imapPass: '', smtpPass: '',
        imapPassSet: r.settings.imapPassSet, smtpPassSet: r.settings.smtpPassSet,
        // 서버가 돌려준 계정 목록으로 맞춘다. 비밀번호는 내려오지 않으므로
        // 입력칸을 비우고 '저장됨' 표시만 남긴다. 폴더 선택지는 화면에만 있는
        // 값이라 서버 응답에 없으므로 들고 있던 것을 이어붙인다.
        imapAccounts: (r.settings.imapAccounts || []).map((a) => {
          const prev = (p.imapAccounts || []).find((x) => x.id === a.id);
          return { ...a, pass: '', _preset: prev?._preset, _folders: prev?._folders };
        }),
      }));

      // 저장 직후 각 계정에 실제로 붙어 본다.
      // 비밀번호를 잘못 넣고 저장하면 화면에는 '저장했습니다' 만 뜨고
      // 메일은 조용히 안 들어온다 — 그 자리에서 알려주는 편이 맞다.
      const list = r.settings.imapAccounts || [];
      if (list.length) {
        setMsg(`저장했습니다. 계정 ${list.length}곳 연결을 확인하는 중…`);
        const checks = await Promise.all(list.map(async (a) => {
          try {
            const t = await fetch('/api/test/imap', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ account: { ...a, pass: '' } }),
            }).then((x) => x.json());
            return { label: a.label || a.user, ok: t.ok, error: t.error };
          } catch (e2) {
            return { label: a.label || a.user, ok: false, error: String(e2.message || e2) };
          }
        }));
        const bad = checks.filter((c) => !c.ok);
        if (bad.length) {
          setMsg('');
          setErr(`저장은 됐지만 ${bad.length}곳이 연결되지 않습니다 — `
            + bad.map((c) => `${c.label}: ${c.error}`).join(' / ')
            + '  이 계정은 메일을 가져오지 못합니다. 주소·비밀번호를 다시 확인하세요.');
        } else {
          setMsg(`저장했습니다. 계정 ${checks.length}곳 모두 연결 정상입니다.`);
        }
        loadStatus();
      }
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

      <Section title="메일 계정"
        desc="가져올 메일함입니다. 이카운트·Gmail·네이버를 함께 등록하면 한 화면에서 모아 볼 수 있습니다. 비밀번호는 저장한 뒤 화면으로 다시 나오지 않으니, 계정 주인이 직접 입력하시면 됩니다.">
        <MailAccounts
          accounts={f.imapAccounts || []}
          onChange={(next) => setF((p) => ({ ...p, imapAccounts: next }))}
          allowAdd={Boolean(features.multiAccount)}
          onSave={save}
          saving={busy}
          status={status}
        />
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
