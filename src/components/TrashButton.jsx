'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { Spinner } from '@/components/Loading';

/**
 * 메일을 메일함의 휴지통으로 옮기는 버튼.
 *
 * 이 앱이 메일함 원본을 건드리는 유일한 동작이라 세 가지를 지킨다.
 *   1) 반드시 한 번 물어본다 — 목록에서 옆칸 누르다 잘못 누르기 쉽다.
 *   2) 영구 삭제가 아니라 이동이다 — 웹메일 휴지통에서 되돌릴 수 있다.
 *   3) 어느 메일함의 휴지통인지는 서버가 정한다 — 메일이 속한 계정의
 *      휴지통(specialUse=\Trash)으로 간다. Gmail·네이버를 함께 써도
 *      각자 자기 휴지통으로 들어간다.
 */
export default function TrashButton({ mailId, subject, size = 'sm', label = '🗑', onDone }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/mails/${mailId}/trash`, { method: 'POST' }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setAsk(false);
      onDone?.(r);
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        className={`btn secondary${size === 'sm' ? ' sm' : ''}`}
        title="메일함의 휴지통으로 옮깁니다 (웹메일에서 되돌릴 수 있습니다)"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAsk(true); }}
      >
        {label}
      </button>

      {/* 창은 Modal 이 body 밑에 그린다 — 목록 행의 opacity 를 물려받아
          창이 비쳐 보이던 문제를 막는다 */}
      <Modal open={ask} onClose={() => !busy && setAsk(false)}>
        <div className="card-title" style={{ fontSize: 15 }}>휴지통으로 옮길까요?</div>

        {subject && (
          <div className="card" style={{ background: 'var(--panel-2)', marginBottom: 12 }}>
            <div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{subject}</div>
          </div>
        )}

        <div style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--text-2)' }}>
          메일함에서도 <b>휴지통으로 이동</b>합니다.
          지우는 것이 아니라 옮기는 것이라, <b>웹메일 휴지통에서 되돌릴 수 있습니다.</b>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            이 화면에서는 목록에서 빠지고, 무엇을 옮겼는지는 기록으로 남습니다.
          </div>
        </div>

        {err && (
          <div className="card" style={{ borderColor: 'var(--bad)', marginTop: 12 }}>
            <div style={{ fontSize: 13 }}>{err}</div>
          </div>
        )}

        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={() => setAsk(false)} disabled={busy}>취소</button>
          <button className="btn danger" onClick={run} disabled={busy}>
            {busy ? <><Spinner /> 옮기는 중…</> : '휴지통으로 옮기기'}
          </button>
        </div>
      </Modal>
    </>
  );
}
