'use client';

import { useRef, useState } from 'react';

/**
 * 저장된 비밀번호를 '채워진 것처럼' 보여 주는 입력칸.
 *
 * 비밀번호는 설계상 서버에서 화면으로 다시 내려오지 않는다. 그래서 저장을 했는데도
 * 입력칸이 비어 보이고, 라벨의 '(저장됨)' 글씨는 눈에 잘 들어오지 않는다.
 * 실제로 "저장이 안 된 건가?" 하는 문의가 나왔다.
 *
 * 저장돼 있으면 ●●●●●●●● 를 보여 주고, [변경] 을 눌러야 입력칸이 열린다.
 * 그 ●●● 는 화면에만 있는 글자라 폼 값에는 절대 들어가지 않는다 — 저장 시
 * 빈 문자열로 나가고, 서버는 빈 값이면 기존 비밀번호를 그대로 둔다.
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
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  // 저장돼 있고 아직 바꾸려 하지 않은 상태 — 채워진 모습만 보여 준다.
  // type 을 password 가 아니라 text 로 두는 이유: 브라우저 비밀번호 자동완성이
  // 이 가짜 값을 진짜로 착각해 저장을 제안하는 것을 막기 위해서다.
  if (saved && !editing) {
    return (
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
        <button
          type="button"
          className="btn secondary sm"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => { setEditing(true); setTimeout(() => ref.current?.focus(), 0); }}
        >
          변경
        </button>
      </div>
    );
  }

  return (
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
      />
      {saved && (
        <button
          type="button"
          className="btn secondary sm"
          style={{ whiteSpace: 'nowrap' }}
          // 되돌리면 입력값을 비운다 — 빈 값으로 저장해야 기존 비밀번호가 유지된다
          onClick={() => { setEditing(false); onValueChange(''); }}
        >
          취소
        </button>
      )}
    </div>
  );
}
