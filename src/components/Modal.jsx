'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 확인 창.
 *
 * **반드시 body 밑에 그린다.** 목록의 행은 처리 끝난 건을 흐리게 보이려고
 * opacity 를 걸어 두는데, 그 안에서 모달을 그리면 position:fixed 라도
 * 부모의 opacity 를 그대로 물려받는다. 창이 반투명해져 뒤 글씨가 비쳐
 * 무엇을 묻는 창인지 읽을 수 없게 된다 (실제로 그렇게 보였다).
 * transform·filter 를 쓴 조상 안에서 fixed 가 어긋나는 문제도 같이 막아 준다.
 *
 * Esc 로 닫히고, 열려 있는 동안 뒤 화면은 스크롤되지 않는다.
 */
export default function Modal({ open, onClose, width = 460, children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={() => onClose?.()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
