'use client';

import { useRef, useState } from 'react';
import { Spinner } from '@/components/Loading';

/**
 * 저장된 비밀번호를 '채워진 것처럼' 보여 주고, 바꿀 때만 열리는 입력칸.
 *
 * 비밀번호는 설계상 서버에서 화면으로 다시 내려오지 않는다. 그래서 저장을
 * 마친 뒤에도 칸이 텅 비어 보이고, 라벨의 '(저장됨)' 글씨는 눈에 들어오지 않는다.
 * 실제로 "저장이 안 된 건가?" 하는 문의가 나왔다.
 *
 * 흐름은 [변경] → 입력 → [확인] 세 걸음이다. 새 비밀번호를 쳐 놓고 [취소] 만
 * 보이면 무엇을 눌러야 반영되는지 알 수 없다 — 바꾸는 동작을 끝맺는 버튼이
 * 그 자리에 있어야 한다. 끝나면 '비밀번호가 변경되었습니다' 를 남긴다.
 *
 * 화면에 보이는 ●●● 는 표시용 글자일 뿐 폼 값에는 들어가지 않는다.
 * 저장은 빈 문자열로 나가고, 서버는 빈 값이면 기존 비밀번호를 그대로 둔다.
 */
const MASK = '••••••••••';

export default function PasswordField({
  value,
  onValueChange,
  /** 이미 저장된 비밀번호가 있는가 */
  saved = false,
  placeholder = '',
  style,
  autoComplete = 'new-password',
  id,
  /**
   * [확인] 을 눌렀을 때 실제 저장을 수행한다 (부모가 서버에 보낸다).
   * false 를 돌려주면 실패로 보고 입력칸을 닫지 않는다.
   */
  onApply,
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ref = useRef(null);

  function open() {
    setDone(false);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  }

  function cancel() {
    setEditing(false);
    onValueChange(''); // 빈 값으로 저장해야 기존 비밀번호가 유지된다
  }

  async function apply() {
    if (!value) return; // 빈 칸이면 바꿀 것이 없다
    if (!onApply) { setEditing(false); setDone(true); return; }
    setBusy(true);
    try {
      const ok = await onApply();
      if (ok === false) return; // 실패 — 고치던 값을 그대로 두고 다시 시도하게 한다
      setEditing(false);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  // 저장돼 있고 아직 바꾸려 하지 않은 상태 — 채워진 모습만 보여 준다.
  // type 을 password 가 아니라 text 로 두는 이유: 브라우저 비밀번호 자동완성이
  // 이 가짜 값을 진짜로 착각해 저장을 제안하는 것을 막기 위해서다.
  if (saved && !editing) {
    return (
      <div>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input
            id={id}
            style={{ ...style, flex: 1, letterSpacing: '0.18em', color: 'var(--text-2)' }}
            type="text"
            value={MASK}
            readOnly
            tabIndex={-1}
            aria-label="저장된 비밀번호"
          />
          <button type="button" className="btn secondary sm"
            style={{ whiteSpace: 'nowrap' }} onClick={open}>
            변경
          </button>
        </div>
        {done && (
          <div style={{ fontSize: 12, marginTop: 5, color: 'var(--good)' }} role="status">
            비밀번호가 변경되었습니다.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <input
          id={id}
          ref={ref}
          style={{ ...style, flex: 1 }}
          type="password"
          value={value || ''}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
        />
        {saved && (
          <>
            <button type="button" className="btn sm" style={{ whiteSpace: 'nowrap' }}
              onClick={apply} disabled={!value || busy}>
              {busy ? <><Spinner /> 확인 중…</> : '확인'}
            </button>
            <button type="button" className="btn secondary sm"
              style={{ whiteSpace: 'nowrap' }} onClick={cancel} disabled={busy}>
              취소
            </button>
          </>
        )}
      </div>
      {saved && (
        <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
          새 비밀번호를 넣고 <b>확인</b>을 누르면 바뀝니다. 취소하면 쓰던 비밀번호가 그대로 남습니다.
        </div>
      )}
    </div>
  );
}
