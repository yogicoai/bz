'use client';

import { useState } from 'react';

/**
 * 메일 계정 관리 — 여러 메일함(이카운트·Gmail·네이버)을 함께 수집할 때 쓴다.
 *
 * 비밀번호는 저장 후 화면으로 다시 내려오지 않는다(`passSet` 만 온다).
 * 그래서 빈 칸으로 두고 저장하면 기존 비밀번호가 유지되고, 값을 넣었을 때만 바뀐다.
 * 계정 주인이 직접 입력하고 다른 사람은 볼 수 없다 — 비번을 사람 손으로
 * 주고받지 않아도 되는 것이 이 화면의 목적이다.
 */

/** 자주 쓰는 메일 서비스 — 고르면 서버 주소가 자동으로 채워진다 */
const PRESETS = {
  ecount: { label: '이카운트 웹메일', host: 'wmbox4.ecount.com', port: 993 },
  gmail: { label: 'Gmail', host: 'imap.gmail.com', port: 993 },
  naver: { label: '네이버 메일', host: 'imap.naver.com', port: 993 },
  daum: { label: '다음 메일', host: 'imap.daum.net', port: 993 },
  outlook: { label: 'Outlook / Hotmail', host: 'outlook.office365.com', port: 993 },
  custom: { label: '직접 입력', host: '', port: 993 },
};

/** 서비스별로 먼저 켜야 하는 것 — 이걸 모르면 비번이 맞아도 로그인이 거부된다 */
const GUIDE = {
  gmail: {
    title: 'Gmail 은 일반 비밀번호로 접속되지 않습니다',
    steps: [
      'Google 계정 → 보안 → 2단계 인증을 먼저 켭니다 (앱 비밀번호의 전제조건입니다).',
      '같은 화면에서 앱 비밀번호를 만들어 16자리를 발급받습니다.',
      'Gmail 설정 → 전달 및 POP/IMAP → IMAP 사용을 켭니다.',
      '아래 비밀번호 칸에는 계정 비밀번호가 아니라 그 16자리를 넣습니다.',
    ],
  },
  naver: {
    title: '네이버는 IMAP 사용을 먼저 켜야 합니다',
    steps: [
      '네이버 메일 → 환경설정 → POP3/IMAP 설정 → IMAP/SMTP 사용을 켭니다.',
      '2단계 인증을 쓰신다면 네이버에서 애플리케이션 비밀번호를 발급받아 넣습니다.',
      '그렇지 않으면 네이버 로그인 비밀번호를 그대로 넣으시면 됩니다.',
    ],
  },
  ecount: {
    title: '이카운트는 계정마다 메일 클라이언트 사용을 켜야 합니다',
    steps: [
      '웹메일 로그인 → 개인기능설정 → 외부연동설정으로 들어갑니다.',
      '메일 클라이언트 사용을 "사용"으로 바꿉니다.',
      '해외 로그인 차단을 "사용안함"으로 바꿉니다 — 이 서비스는 해외 서버에서 돌아가므로 켜져 있으면 수집이 막힙니다.',
      '수신 서버 주소는 같은 화면의 IMAP/SMTP 설정에서 확인해 아래에 넣습니다.',
    ],
  },
  daum: {
    title: '다음 메일도 IMAP 사용을 먼저 켜야 합니다',
    steps: ['다음 메일 → 환경설정 → IMAP/POP3 설정에서 IMAP 사용을 켭니다.'],
  },
};

const inp = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13, width: '100%',
};

const guessPreset = (host = '') => {
  const h = host.toLowerCase();
  if (h.includes('gmail')) return 'gmail';
  if (h.includes('naver')) return 'naver';
  if (h.includes('daum')) return 'daum';
  if (h.includes('ecount')) return 'ecount';
  if (h.includes('outlook') || h.includes('office365')) return 'outlook';
  return 'custom';
};

export default function MailAccounts({ accounts, onChange }) {
  const [testing, setTesting] = useState(null);
  const [result, setResult] = useState({});

  const set = (i, patch) => onChange(accounts.map((a, n) => (n === i ? { ...a, ...patch } : a)));

  function add() {
    onChange([...accounts, {
      id: `acc${Date.now().toString(36)}`,
      label: '', host: '', port: 993, secure: true,
      user: '', pass: '', folders: ['INBOX'], enabled: true, _preset: 'gmail',
    }]);
  }

  function remove(i) {
    const a = accounts[i];
    if (!confirm(`'${a.label || a.user || '이 계정'}' 을 목록에서 뺍니다.\n`
      + '이미 수집된 메일은 지워지지 않고, 앞으로 이 계정에서 새로 가져오지 않습니다.')) return;
    onChange(accounts.filter((_, n) => n !== i));
  }

  async function test(i) {
    const a = accounts[i];
    setTesting(i); setResult((p) => ({ ...p, [i]: null }));
    try {
      const r = await fetch('/api/test/imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: a }),
      }).then((x) => x.json());
      setResult((p) => ({ ...p, [i]: r }));
      // 연결에 성공하면 폴더 목록을 받아 두어 바로 고를 수 있게 한다
      if (r.ok && r.folders?.length) set(i, { _folders: r.folders });
    } catch (e) {
      setResult((p) => ({ ...p, [i]: { ok: false, error: String(e.message || e) } }));
    }
    setTesting(null);
  }

  function toggleFolder(i, path) {
    const cur = accounts[i].folders || [];
    set(i, { folders: cur.includes(path) ? cur.filter((f) => f !== path) : [...cur, path] });
  }

  return (
    <div>
      {!accounts.length && (
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>
          아직 등록한 계정이 없습니다. 지금은 위쪽 <b>메일 수신(IMAP)</b> 에 적힌
          계정 한 곳만 가져옵니다.<br />
          Gmail·네이버처럼 <b>다른 메일함도 함께 보고 싶으시면</b> 아래에서 계정을 추가하세요.
          하나라도 추가하면 그때부터는 <b>여기 등록한 계정들만</b> 수집합니다 —
          지금 쓰시던 메일함도 반드시 함께 등록해 주세요.
        </div>
      )}

      {accounts.map((a, i) => {
        const preset = a._preset || guessPreset(a.host);
        const guide = GUIDE[preset];
        const r = result[i];
        return (
          <div key={a.id || i} className="card" style={{ background: 'var(--panel-2)', marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>{a.label || a.user || `계정 ${i + 1}`}</b>
              <div className="row" style={{ gap: 8 }}>
                <label className={`chip ${a.enabled !== false ? 'on' : ''}`}>
                  <input type="checkbox" checked={a.enabled !== false}
                    onChange={(e) => set(i, { enabled: e.target.checked })} />
                  수집함
                </label>
                <button type="button" className="btn secondary sm" onClick={() => remove(i)}>빼기</button>
              </div>
            </div>

            <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
              <div style={{ flex: '0 0 160px' }}>
                <label>메일 서비스</label>
                <select style={inp} value={preset}
                  onChange={(e) => {
                    const p = PRESETS[e.target.value];
                    set(i, { _preset: e.target.value, host: p.host, port: p.port });
                  }}>
                  {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label>이름 (화면에 표시됩니다)</label>
                <input style={inp} value={a.label || ''} placeholder="예) 네이버 개인메일"
                  onChange={(e) => set(i, { label: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
              <div style={{ flex: '2 1 220px' }}>
                <label>수신 서버</label>
                <input style={inp} value={a.host || ''} placeholder="imap.gmail.com"
                  onChange={(e) => set(i, { host: e.target.value })} />
              </div>
              <div style={{ flex: '0 0 90px' }}>
                <label>포트</label>
                <input style={inp} value={a.port || 993}
                  onChange={(e) => set(i, { port: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
              <div style={{ flex: '1 1 220px' }}>
                <label>메일 주소</label>
                <input style={inp} value={a.user || ''} placeholder="you@gmail.com"
                  onChange={(e) => set(i, { user: e.target.value })} />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <label>
                  비밀번호
                  {a.passSet && <span className="muted" style={{ fontWeight: 400 }}> · 저장되어 있음 (바꿀 때만 입력)</span>}
                </label>
                <input style={inp} type="password" value={a.pass || ''}
                  placeholder={a.passSet ? '변경하지 않으려면 비워 두세요' : preset === 'gmail' ? '앱 비밀번호 16자리' : ''}
                  onChange={(e) => set(i, { pass: e.target.value })} />
              </div>
            </div>

            {guide && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--accent)' }}>
                  {guide.title} — 눌러서 방법 보기
                </summary>
                <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.9, color: 'var(--text-2)' }}>
                  {guide.steps.map((s, n) => <li key={n}>{s}</li>)}
                </ol>
              </details>
            )}

            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button type="button" className="btn secondary sm"
                onClick={() => test(i)} disabled={testing === i || !a.host || !a.user}>
                {testing === i ? '확인 중…' : '연결 테스트'}
              </button>
              {r && (
                <span style={{ fontSize: 13, color: r.ok ? 'var(--good)' : 'var(--bad)' }}>
                  {r.ok ? r.message : `실패 — ${r.error}`}
                </span>
              )}
            </div>

            {/* 연결에 성공하면 이 계정에서 가져올 폴더를 고른다 */}
            {(a._folders?.length > 0 || a.folders?.length > 0) && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <label>가져올 폴더 ({(a.folders || []).length}개 선택됨)</label>
                {a._folders?.length ? (
                  <div className="row" style={{ gap: 6, maxHeight: 190, overflowY: 'auto' }}>
                    {a._folders.map((p) => (
                      <label key={p} className={`chip ${(a.folders || []).includes(p) ? 'on' : ''}`}>
                        <input type="checkbox" checked={(a.folders || []).includes(p)}
                          onChange={() => toggleFolder(i, p)} />
                        {p}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    현재 선택: {(a.folders || []).join(', ') || '없음'} —
                    <b> 연결 테스트</b>를 누르면 폴더 목록을 불러와 고를 수 있습니다.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="btn secondary" onClick={add}>+ 메일 계정 추가</button>
    </div>
  );
}
