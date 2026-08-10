import Link from 'next/link';
import { getDeadlines } from '@/lib/stats';
import MailRow from '@/components/MailRow';

export const dynamic = 'force-dynamic';

export default async function DeadlinesPage() {
  const d = await getDeadlines();

  if (!d.connected) {
    return (
      <>
        <h1 className="page-title">기한·답변 관리</h1>
        <div className="card" style={{ borderColor: 'var(--bad)' }}>
          <div className="card-title">MongoDB 미연결</div>
          <div className="muted" style={{ fontSize: 12 }}>{d.error}</div>
        </div>
      </>
    );
  }

  const total = d.overdue.length + d.soon.length + d.later.length;

  return (
    <>
      <h1 className="page-title">기한·답변 관리</h1>
      <p className="page-sub">
        처리하지 않은(신규·확인중) 메일만 표시합니다. 답변을 보내거나 상태를 <b>답변완료·보관</b>으로 바꾸면 목록에서 사라집니다.
      </p>

      <Group
        title="기한 지남"
        tone="bad"
        items={d.overdue}
        empty="기한을 넘긴 건이 없습니다. 👍"
      />
      <Group
        title="이번 주 마감 (7일 이내)"
        tone="warn"
        items={d.soon}
        empty="일주일 내 마감 건이 없습니다."
      />
      <Group
        title="이후 예정"
        items={d.later}
        empty="예정된 기한이 없습니다."
      />
      <Group
        title="기한은 없지만 답변이 필요한 메일"
        items={d.noDeadlineReply}
        empty="답변 대기 중인 메일이 없습니다."
        showDeadline={false}
      />

      {total === 0 && d.noDeadlineReply.length === 0 && (
        <div className="card">
          <div className="empty">
            관리할 건이 없습니다.
            <br />
            <Link href="/mails" style={{ color: 'var(--accent)' }}>메일함</Link>에서 메일을 수집해 보세요.
          </div>
        </div>
      )}
    </>
  );
}

function Group({ title, items, empty, tone, showDeadline = true }) {
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : undefined;
  if (!items.length) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{title}</div>
        <div className="empty" style={{ padding: '14px 0' }}>{empty}</div>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 16, padding: 0, borderColor: color }}>
      <div className="card-title" style={{ padding: '16px 18px 6px', color }}>
        {title} <span className="muted" style={{ fontWeight: 400 }}>({items.length})</span>
      </div>
      <div style={{ padding: '0 8px 8px' }}>
        <table>
          <tbody>
            {items.map((m) => (
              <MailRow
                key={m._id}
                mail={m}
                show={{ deadline: showDeadline, urgency: true, action: true, classification: !showDeadline }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
