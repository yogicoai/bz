'use client';

import { useState } from 'react';

/**
 * 목록에서 바로 '검토 완료' 처리.
 *
 * 이 버튼이 없으면 답변필요·기한 목록에 뜬 건을 치우려고 메일을 열어
 * 드롭다운을 바꿔야 한다. 그래서 다 본 건이 계속 목록에 남고,
 * 숫자가 줄지 않으니 화면을 믿지 않게 된다.
 *
 * 실수로 눌렀을 때를 위해 되돌리기를 같이 둔다.
 */
export default function ReviewDone({ id }) {
  const [state, setState] = useState('idle'); // idle | done | busy
  const [err, setErr] = useState('');

  async function set(status) {
    setState('busy'); setErr('');
    try {
      const r = await fetch(`/api/mails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setState(status === 'archived' ? 'done' : 'idle');
    } catch (e) {
      setErr(String(e.message || e));
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        <span className="badge archived">검토 완료</span>{' '}
        <button type="button" className="linklike" onClick={() => set('reviewing')}>되돌리기</button>
      </span>
    );
  }

  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <button
        type="button"
        className="btn secondary sm"
        disabled={state === 'busy'}
        onClick={() => set('archived')}
        title="읽고 판단이 끝났습니다. 목록에서 빠지고 숫자에서도 제외됩니다."
      >
        {state === 'busy' ? '처리 중…' : '검토 완료'}
      </button>
      {err && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{err}</div>}
    </span>
  );
}
