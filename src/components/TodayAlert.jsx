'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ddayLabel, ddayTone, deadlineTypeLabel } from '@/lib/labels';

/**
 * 대시보드 진입 시 "오늘 처리할 메일" 알림.
 * 하루에 한 번만 뜨고(닫으면 그날은 다시 안 뜸), 닫아도 대시보드 상단 배너로 남는다.
 */
const dismissKey = (date) => `ed_alert_${date}`;

export default function TodayAlert() {
  const [b, setB] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/briefing')
      .then((r) => r.json())
      .then((r) => {
        if (!r.ok) return;
        setB(r);
        const seen = localStorage.getItem(dismissKey(r.date));
        if (r.total > 0 && !seen) setOpen(true);
      })
      .catch(() => {});
  }, []);

  function close() {
    if (b?.date) localStorage.setItem(dismissKey(b.date), '1');
    setOpen(false);
  }

  async function check(mail) {
    setBusy(true);
    // 낙관적 반영 — 체크 리듬이 끊기지 않게
    setB((p) => ({
      ...p,
      items: p.items.map((m) => (m._id === mail._id ? { ...m, status: 'archived' } : m)),
    }));
    try {
      await fetch(`/api/mails/${mail._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
    } catch { /* 실패해도 알림을 막지 않는다 — 브리핑 화면에서 다시 처리 가능 */ }
    setBusy(false);
  }

  if (!b || !b.total) return null;

  const remaining = b.items.filter((m) => !['replied', 'archived', 'ignored'].includes(m.status));
  const actionable = remaining.filter((m) => m.analysis?.needsReply);

  return (
    <>
      {/* 알림을 닫아도 남는 상단 배너 */}
      {!open && (
        <div className="card" style={{ marginBottom: 18, borderColor: 'var(--accent)', background: 'var(--accent-weak)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b style={{ fontSize: 15 }}>오늘 확인할 메일 {remaining.length}건</b>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                답변 필요 {actionable.length}건 · 기한 있음 {remaining.filter((m) => m.analysis?.deadline).length}건
              </div>
            </div>
            <div className="row">
              <button className="btn secondary sm" onClick={() => setOpen(true)}>알림 다시 보기</button>
              <Link href="/briefing" className="btn sm">브리핑 열기</Link>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
                오늘 처리할 메일 {remaining.length}건
              </div>
              <button className="btn secondary sm" onClick={close}>닫기</button>
            </div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
              {b.date} 기준 · 답변 필요 {actionable.length}건 · 기한 있음{' '}
              {remaining.filter((m) => m.analysis?.deadline).length}건
              <br />
              확인한 건은 체크하면 목록에서 빠집니다.
            </div>

            {remaining.length === 0 ? (
              <div className="empty">모두 확인했습니다. 👍</div>
            ) : (
              remaining.map((m) => {
                const a = m.analysis || {};
                return (
                  <div
                    key={m._id}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '14px 0', borderTop: '1px solid var(--border)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={busy}
                      onChange={() => check(m)}
                      title="확인 완료"
                      style={{ width: 18, height: 18, marginTop: 3, flex: '0 0 auto' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 6, marginBottom: 5 }}>
                        {a.needsReply && <span className="badge reply">답변 필요</span>}
                        {a.deadline && (
                          <span className={`badge ${ddayTone(a.deadline)}`}>
                            {deadlineTypeLabel(a.deadlineType)} {ddayLabel(a.deadline)}
                          </span>
                        )}
                      </div>
                      <Link href={`/mails/${m._id}`} style={{ fontWeight: 700 }} onClick={close}>
                        {m.translation?.subject || m.subject}
                      </Link>
                      <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                        {m.from?.name || m.from?.address}
                      </div>
                      {a.summary ? (
                        <div style={{ fontSize: 13, marginTop: 7, color: 'var(--text-2)' }}>{a.summary}</div>
                      ) : (
                        <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>
                          (AI 요약 없음 — 브리핑 화면에서 생성할 수 있습니다)
                        </div>
                      )}
                      {a.suggestedAction && (
                        <div style={{ fontSize: 13, marginTop: 6, color: 'var(--accent-text)' }}>
                          → {a.suggestedAction}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <div className="row" style={{ marginTop: 22, justifyContent: 'flex-end' }}>
              <Link href="/briefing" className="btn" onClick={close}>브리핑에서 자세히 보기</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
