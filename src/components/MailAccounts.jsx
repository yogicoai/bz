'use client';

import { useState } from 'react';
import PasswordField from '@/components/PasswordField';
import { Spinner } from '@/components/Loading';

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

/** 마지막 수집이 어땠는지 — 색과 말로 한눈에 */
function HealthBadge({ h }) {
  if (!h) return null;
  if (h.health === 'fail') {
    return <span className="badge high" title={h.lastError || ''}>연결 실패</span>;
  }
  if (h.health === 'ok') return <span className="badge replied">연결 정상</span>;
  if (!h.passSet) return <span className="badge mid">비밀번호 없음</span>;
  return <span className="badge">아직 수집 전</span>;
}

export default function MailAccounts({
  accounts, onChange, allowAdd = false, onSave, saving = false, status = [], onRemoved,
}) {
  const [testing, setTesting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [result, setResult] = useState({});
  const health = new Map((status || []).map((s) => [s.id, s]));

  const set = (i, patch) => onChange(accounts.map((a, n) => (n === i ? { ...a, ...patch } : a)));

  function add() {
    // 처음 뜨는 서비스와 서버 주소가 어긋나면 안 된다 —
    // 화면은 Gmail 이라고 하는데 서버 칸이 비어 있으면 무엇을 넣어야 할지 알 수 없다.
    const first = 'gmail';
    const p = PRESETS[first];
    onChange([...accounts, {
      id: `acc${Date.now().toString(36)}`,
      label: '', host: p.host, port: p.port, secure: true,
      user: '', pass: '', folders: ['INBOX'], enabled: true, _preset: first,
    }]);
  }

  /**
   * 계정 빼기 — **그 계정으로 가져온 메일도 함께 지운다**.
   *
   * 목록에서만 빼고 메일을 남기면, 더 이상 없는 메일함의 메일이 브리핑·기한·
   * 검색에 계속 섞여 나오고 치울 방법이 없다. 시험 삼아 붙였다 떼는 것이
   * 실제 사용 방식이라, 뗄 때 통째로 사라지는 편이 예상에 맞는다.
   */
  async function remove(i) {
    const a = accounts[i];
    const name = a.label || a.user || '이 계정';

    // 아직 저장하지 않은(서버가 모르는) 계정은 목록에서 빼기만 하면 된다
    if (!a.id || !health.has(a.id)) {
      onChange(accounts.filter((_, n) => n !== i));
      return;
    }

    const n = health.get(a.id)?.total || 0;
    if (!confirm(
      `'${name}' 계정을 뺍니다.\n\n`
      + (n
        ? `이 계정으로 가져온 메일 ${n.toLocaleString()}통도 함께 삭제됩니다.\n`
          + '브리핑·기한·검색에서도 모두 사라지며, 되돌릴 수 없습니다.\n\n'
        : '가져온 메일이 아직 없습니다.\n\n')
      + `원본 메일은 ${name} 메일함에 그대로 있습니다 — 지워지는 것은 이 도구가 가져와 둔 사본입니다.\n`
      + '저장하지 않은 다른 변경 사항은 되돌아갑니다.\n\n계속할까요?',
    )) return;

    setRemoving(a.id);
    try {
      const r = await fetch('/api/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      alert(`'${r.label}' 계정을 뺐습니다. 함께 삭제된 메일 ${(r.deletedMails || 0).toLocaleString()}통.`);
      if (onRemoved) onRemoved();
      else onChange(accounts.filter((_, n2) => n2 !== i));
    } catch (e) {
      alert(`계정을 빼지 못했습니다 — ${String(e.message || e)}`);
    }
    setRemoving(null);
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
      {allowAdd && (
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>
          Gmail·네이버처럼 <b>다른 메일함도 함께</b> 가져오려면 아래 <b>+ 메일 계정 추가</b>를 누르세요.
          여기 등록한 계정들만 수집하므로, <b>지금 쓰시던 메일함도 목록에 남아 있어야 합니다.</b>
          <div style={{ marginTop: 6 }}>
            계정을 <b>빼면 그동안 그 계정에서 가져온 메일도 함께 삭제됩니다</b> — 브리핑·기한·검색에서도
            모두 사라지며 되돌릴 수 없습니다. (원본 메일은 각자의 메일함에 그대로 있습니다.)
            잠깐 멈추기만 하려면 빼지 말고 <b>[수집함]</b> 체크를 끄세요.
          </div>
        </div>
      )}

      {accounts.map((a, i) => {
        const preset = a._preset || guessPreset(a.host);
        const guide = GUIDE[preset];
        const r = result[i];
        return (
          <div key={a.id || i} className="card" style={{ background: 'var(--panel-2)', marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <b style={{ fontSize: 14 }}>{a.label || a.user || `계정 ${i + 1}`}</b>
                <HealthBadge h={health.get(a.id)} />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <label className={`chip ${a.enabled !== false ? 'on' : ''}`}>
                  <input type="checkbox" checked={a.enabled !== false}
                    onChange={(e) => set(i, { enabled: e.target.checked })} />
                  수집함
                </label>
                <button type="button" className="btn secondary sm"
                  onClick={() => remove(i)} disabled={removing === a.id}
                  title="계정을 빼면 이 계정으로 가져온 메일도 함께 삭제됩니다">
                  {removing === a.id ? <><Spinner /> 빼는 중…</> : '빼기'}
                </button>
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
                <label>비밀번호</label>
                <PasswordField
                  value={a.pass}
                  onValueChange={(v) => set(i, { pass: v })}
                  saved={Boolean(a.passSet)}
                  placeholder={preset === 'gmail' ? '앱 비밀번호 16자리' : ''}
                  style={inp}
                  onApply={onSave}
                />
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

            {/* 저장은 이 카드 안에도 둔다.
                비밀번호를 고친 자리에서 저장이 보이지 않으면, 폴더 목록을 한참
                지나 페이지 맨 아래까지 내려가야 한다 — 저장한 줄 알고 나가게 된다. */}
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button type="button" className="btn secondary sm"
                onClick={() => test(i)} disabled={testing === i || !a.host || !a.user}>
                {testing === i ? <><Spinner /> 확인 중…</> : '연결 테스트'}
              </button>
              {onSave && (
                <button type="button" className="btn sm" onClick={onSave} disabled={saving}>
                  {saving ? <><Spinner /> 저장 중…</> : '저장'}
                </button>
              )}
              {r && (
                <span style={{ fontSize: 13, color: r.ok ? 'var(--good)' : 'var(--bad)' }}>
                  {r.ok ? r.message : `실패 — ${r.error}`}
                </span>
              )}
            </div>

            {/* 마지막 수집이 실패했으면 그 자리에서 이유를 보여준다.
                "메일이 안 오네" 하고 한참 뒤에 알아채는 것을 막는다. */}
            {health.get(a.id)?.health === 'fail' && (
              <div className="card" style={{ marginTop: 10, borderColor: 'var(--bad)', background: 'var(--bad-weak)' }}>
                <b style={{ fontSize: 13 }}>이 계정에서 메일을 가져오지 못하고 있습니다</b>
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-2)' }}>
                  {health.get(a.id).lastError}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  비밀번호가 바뀌었거나(Gmail 은 앱 비밀번호), 메일함에서 IMAP 사용이 꺼졌을 수 있습니다.
                  값을 고친 뒤 <b>연결 테스트</b>로 확인하고 저장하세요.
                </div>
              </div>
            )}

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
                  <>
                    {/* 아직 서버 목록을 못 받았을 때. 쉼표로 이어 붙이면 글 덩어리가 되어
                        무엇이 선택돼 있는지 눈에 들어오지 않는다. */}
                    <div className="row" style={{ gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                      {(a.folders || []).map((path) => (
                        <span key={path} className="chip on" style={{ cursor: 'default' }}>{path}</span>
                      ))}
                      {!(a.folders || []).length && <span className="muted" style={{ fontSize: 12 }}>선택된 폴더 없음</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      <b>연결 테스트</b>를 누르면 메일함의 폴더 목록을 불러와 눌러서 고를 수 있습니다.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 저장은 이 자리에도 둔다. 페이지 맨 아래 버튼 하나뿐이면
          계정을 고친 뒤 한참 내려가야 해서 저장한 줄 알고 나가게 된다. */}
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        {allowAdd && (
          <button type="button" className="btn secondary" onClick={add}>+ 메일 계정 추가</button>
        )}
        {onSave && (
          <button type="button" className="btn" onClick={onSave} disabled={saving}>
            {saving ? <><Spinner /> 저장 중…</> : '메일 계정 저장'}
          </button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          바꾼 내용은 저장을 눌러야 반영됩니다.
        </span>
      </div>
    </div>
  );
}
