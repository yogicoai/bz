import Link from 'next/link';
import {
  classificationLabel, deadlineTypeLabel, urgencyLabel, ddayLabel, ddayTone,
} from '@/lib/labels';

const fmtDay = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : '-';

/** 대시보드·기한 화면에서 공통으로 쓰는 메일 한 줄 */
export default function MailRow({ mail, show = {} }) {
  const a = mail.analysis || {};
  return (
    <tr>
      <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', width: 58 }}>{fmtDay(mail.date)}</td>
      <td style={{ fontSize: 12, width: 150, wordBreak: 'break-all' }}>
        {mail.from?.name || mail.from?.address}
      </td>
      <td>
        <Link href={`/mails/${mail._id}`} style={{ fontWeight: 600 }}>
          {mail.translation?.subject || mail.subject}
        </Link>
        {a.topic && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.topic}</div>}
        {show.action && a.suggestedAction && (
          <div style={{ fontSize: 12, marginTop: 3, color: 'var(--accent)' }}>→ {a.suggestedAction}</div>
        )}
      </td>
      {show.classification && (
        <td style={{ width: 84 }}>
          <span className={`badge ${mail.classification}`}>{classificationLabel(mail.classification)}</span>
        </td>
      )}
      {show.urgency && (
        <td style={{ width: 62 }}>
          {a.urgency ? <span className={`badge ${a.urgency}`}>{urgencyLabel(a.urgency)}</span> : null}
        </td>
      )}
      {show.deadline && (
        <td style={{ width: 150 }}>
          {a.deadline ? (
            <>
              <span className={`badge ${ddayTone(a.deadline)}`}>{ddayLabel(a.deadline)}</span>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                {fmtDay(a.deadline)} · {deadlineTypeLabel(a.deadlineType)}
              </div>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>기한 없음</span>
          )}
        </td>
      )}
    </tr>
  );
}
