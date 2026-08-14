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

  const total = d.overdue.length + (d.longOverdue?.length || 0) + d.soon.length + d.later.length;

  return (
    <>
      <h1 className="page-title">기한·답변 관리</h1>
      <p className="page-sub">
        <b>날짜가 걸린 건만</b> 마감이 급한 순서로 모아 놓은 화면입니다.
        브리핑이 하루 단위로 훑는 곳이라면, 여기는 &ldquo;언제까지 뭘 해야 하나&rdquo;를 보는 자리입니다.
      </p>

      {/* 이 화면이 무엇을 기준으로 나뉘어 있는지 — 처음 보면 알 수 없다 */}
      <div className="card" style={{ marginBottom: 18, background: 'var(--panel-2)' }}>
        <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-2)' }}>
          기한은 메일 본문에서 <b>&ldquo;○일까지 회신 부탁&rdquo;, &ldquo;견적 마감 ○월 ○일&rdquo;</b> 같은 표현을 찾아 자동으로 잡습니다.
          기한이 없더라도 상대가 답을 기다리는 건은 맨 아래 <b>답변 필요</b>에 모입니다.<br />
          <span className="muted">
            아직 처리하지 않은(신규·확인중) 메일만 나옵니다 — 답장을 보내거나 <b>검토 완료</b>로 체크하면 이 목록에서 빠집니다.
          </span>
        </div>
      </div>

      <Group
        title="기한 지남 — 아직 대응할 수 있는 건 (30일 이내)"
        tone="bad"
        items={d.overdue}
        empty="최근 한 달 안에 기한을 넘긴 건이 없습니다. 👍"
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
      {/* 오래 지난 기한은 접어 둔다. 목록에 섞으면 D+500 이 맨 위를 차지해
          정작 지금 손대야 할 건이 묻힌다. 기록으로는 남기되 기본은 숨긴다. */}
      {(d.longOverdue?.length || 0) > 0 && (
        <details className="card" style={{ marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            한 달 넘게 지난 기한 {d.longOverdue.length}건
            <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
              — 지금 대응하기엔 늦은 건입니다. 확인만 하고 넘기셔도 됩니다.
            </span>
          </summary>
          <div className="table-wrap">
            <table style={{ marginTop: 12 }}>
            <tbody>
              {d.longOverdue.map((m) => (
                <MailRow key={m._id} mail={m} show={{ deadline: true }} />
              ))}
            </tbody>
            </table>
          </div>
        </details>
      )}

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
        <div className="table-wrap">
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
    </div>
  );
}
