import Link from 'next/link';
import { getDashboard, getSyncSummary } from '@/lib/stats';
import { classificationLabel } from '@/lib/labels';
import MailRow from '@/components/MailRow';
import TodayAlert from '@/components/TodayAlert';

export const dynamic = 'force-dynamic';

const fmt = (d) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';

export default async function DashboardPage() {
  const d = await getDashboard();

  if (!d.connected) {
    return (
      <>
        <h1 className="page-title">대시보드</h1>
        <div className="card" style={{ borderColor: 'var(--bad)' }}>
          <div className="card-title">MongoDB 미연결</div>
          <div className="muted" style={{ fontSize: 13 }}>
            <code>.env.local</code> 의 <code>EMAILDATA_URI</code> 또는 <code>MONGODB_URI</code> 를 설정하세요.
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{d.error}</div>
        </div>
      </>
    );
  }

  const k = d.kpi;
  const sync = await getSyncSummary();

  return (
    <>
      <h1 className="page-title">대시보드</h1>
      <p className="page-sub">
        <b>지금 전체가 어떤 상태인지</b> 한눈에 보는 화면입니다.
        오늘의 브리핑이 &ldquo;오늘 처리할 일&rdquo;이라면, 여기는 &ldquo;밀린 것은 없나, 놓친 것은 없나&rdquo;를 확인하는 자리입니다.
      </p>

      {/* 진입 시 "오늘 처리할 메일" 알림 — 하루 한 번 뜨고, 닫으면 상단 배너로 남는다 */}
      <TodayAlert />

      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="답변 필요" value={k.needsReplyRecent ?? k.needsReply} tone={k.needsReplyRecent ? 'bad' : null}
          sub={`최근 30일 · 전체 ${(k.needsReply || 0).toLocaleString()}건`} href="/deadlines" />
        <Kpi label="기한 지남" value={k.overdue} tone={k.overdue ? 'bad' : null}
          sub={`아직 대응 가능 (30일 이내) · 전체 ${(k.overdueAll || 0).toLocaleString()}건`} href="/deadlines" />
        <Kpi label="기한 임박 (7일)" value={k.dueSoon} tone={k.dueSoon ? 'warn' : null}
          sub="일주일 내 마감" href="/deadlines" />
        <Kpi label="신규 미확인" value={k.unreadRecent ?? k.unread}
          sub={`최근 30일 · 전체 ${(k.unread || 0).toLocaleString()}건`} href="/mails?status=new" />
        <Kpi label="이번 주 답변완료" value={k.repliedThisWeek} tone={k.repliedThisWeek ? 'good' : null} sub="최근 7일" />
        <Kpi label="분석 대기" value={k.pendingAnalysisRecent ?? k.pendingAnalysis}
          sub={k.pendingAnalysisRecent
            ? `최근 30일 · 전체 ${(k.pendingAnalysis || 0).toLocaleString()}건`
            : `최근 30일은 모두 완료 · 전체 ${(k.pendingAnalysis || 0).toLocaleString()}건 남음`} href="/mails" />
      </div>

      {/* 숫자만 있으면 무엇을 뜻하는지 모른다 — 처음 보는 사람 기준으로 한 줄씩 */}
      <div className="card" style={{ marginBottom: 18, background: 'var(--panel-2)' }}>
        <div className="card-title" style={{ fontSize: 14 }}>숫자가 뜻하는 것</div>
        <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-2)' }}>
          <b>답변 필요</b> — 상대가 질문·요청을 했는데 아직 회신하지 않은 건입니다.<br />
          <b>기한 지남</b> — 견적 마감·회신 요청일이 이미 지난 건입니다. 30일 이내만 셉니다(그보다 오래된 건 지금 손써도 늦어서 숫자만 흐려집니다).<br />
          <b>기한 임박</b> — 일주일 안에 마감인 건입니다.<br />
          <b>신규 미확인</b> — 아직 한 번도 열어보지 않은 메일입니다.<br />
          <b>분석 대기</b> — 한글 번역과 요약이 아직 만들어지지 않은 메일입니다. 답변 필요·기한은 이미 잡혀 있어 그대로 쓰실 수 있습니다.<br />
          <span className="muted">숫자를 누르면 해당 목록으로 바로 넘어갑니다. 기본은 <b>최근 30일</b> 기준입니다.</span>
        </div>
      </div>

      <Panel title="답변이 필요한 메일" count={d.replyList.length} more="/deadlines">
        {d.replyList.length ? (
          <div className="table-wrap">
            <table>
            <tbody>
              {d.replyList.map((m) => (
                <MailRow key={m._id} mail={m} show={{ urgency: true, deadline: true, action: true }} />
              ))}
            </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">답변 대기 중인 메일이 없습니다. 👍</div>
        )}
      </Panel>

      <Panel title="기한이 있는 메일" count={d.deadlineList.length} more="/deadlines">
        {d.deadlineList.length ? (
          <div className="table-wrap">
            <table>
            <tbody>
              {d.deadlineList.map((m) => (
                <MailRow key={m._id} mail={m} show={{ deadline: true, urgency: true }} />
              ))}
            </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">기한이 잡힌 메일이 없습니다.</div>
        )}
      </Panel>

      <div className="split">
        <Panel title="최근 수집" count={d.recent.length} more="/mails">
          {d.recent.length ? (
            <div className="table-wrap">
              <table>
              <tbody>
                {d.recent.map((m) => (
                  <MailRow key={m._id} mail={m} show={{ classification: true }} />
                ))}
              </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              아직 수집된 메일이 없습니다.
              <br />
              <Link href="/settings" style={{ color: 'var(--accent)' }}>설정</Link>에서 IMAP 연결을 확인한 뒤{' '}
              <Link href="/mails" style={{ color: 'var(--accent)' }}>메일함</Link>에서 수집하세요.
            </div>
          )}
        </Panel>

        <div className="card">
          <div className="card-title">분류 현황</div>
          {d.byClassification.length ? (
            <div className="table-wrap">
              <table>
              <tbody>
                {d.byClassification.map((c) => (
                  <tr key={c._id || 'none'}>
                    <td><span className={`badge ${c._id}`}>{classificationLabel(c._id)}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{c.n.toLocaleString()}</td>
                  </tr>
                ))}
                <tr>
                  <td className="muted">전체</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{k.total.toLocaleString()}</td>
                </tr>
              </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">데이터 없음</div>
          )}

          {sync.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>최근 수집</div>
              {sync.map((s) => (
                <div key={s.folder} className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {s.folder} · {fmt(s.lastSyncAt)} · UID {s.lastUid}
                  {s.lastError && <span style={{ color: 'var(--bad)' }}> · {s.lastError}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, tone, href }) {
  const inner = (
    <div className={`card${tone ? ` tone-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi">{value.toLocaleString()}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Panel({ title, count, more, children }) {
  return (
    <div className="card" style={{ marginBottom: 16, padding: 0 }}>
      <div className="row" style={{ justifyContent: 'space-between', padding: '16px 18px 8px' }}>
        <div className="card-title" style={{ margin: 0 }}>
          {title} {count > 0 && <span className="muted" style={{ fontWeight: 400 }}>({count})</span>}
        </div>
        {more && <Link href={more} className="muted" style={{ fontSize: 12 }}>전체 보기 →</Link>}
      </div>
      <div style={{ padding: '0 8px 8px' }}>{children}</div>
    </div>
  );
}
