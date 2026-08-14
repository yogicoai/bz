import Link from 'next/link';
import { listGroups } from '@/lib/mail/groups';
import { collections } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: '거래처 — 메일 관리' };

/** 거래처별 미처리·답변필요·기한 건수를 한 번에 집계 */
async function getGroupStats() {
  try {
    const mails = await collections.mails();
    const now = new Date();

    const rows = await mails.aggregate([
      { $match: { group: { $ne: null } } },
      {
        $group: {
          _id: '$group',
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $in: ['$status', ['new', 'reviewing']] }, 1, 0] } },
          needsReply: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ['$analysis.needsReply', true] },
                  { $in: ['$status', ['new', 'reviewing']] },
                ] },
                1, 0,
              ],
            },
          },
          overdue: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ['$analysis.deadline', null] },
                  { $lt: ['$analysis.deadline', now] },
                  { $in: ['$status', ['new', 'reviewing']] },
                ] },
                1, 0,
              ],
            },
          },
          last: { $max: '$date' },
        },
      },
      { $sort: { needsReply: -1, last: -1 } },
    ]).toArray();

    return { connected: true, rows };
  } catch (e) {
    return { connected: false, error: String(e?.message || e) };
  }
}

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';

export default async function GroupsPage() {
  const [{ connected, rows, error }, all] = await Promise.all([
    getGroupStats(),
    listGroups().then((g) => g.groups).catch(() => []),
  ]);

  if (!connected) {
    return (
      <>
        <h1 className="page-title">거래처</h1>
        <div className="card" style={{ borderColor: 'var(--bad)' }}>
          <div className="card-title">MongoDB 미연결</div>
          <div className="muted" style={{ fontSize: 12 }}>{error}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">거래처</h1>
      <p className="page-sub">
        메일함의 &lsquo;내 메일함&rsquo; 폴더를 그대로 옮겨 놓았습니다. 카드를 눌러 해당 거래처 메일만 볼 수 있습니다.
      </p>

      {!rows.length ? (
        <div className="card">
          <div className="empty">
            아직 거래처가 없습니다.
            <br />
            <span style={{ fontSize: 13 }}>
              <Link href="/settings" style={{ color: 'var(--accent-text)' }}>설정</Link>에서
              거래처 폴더를 골라 수집하면 여기에 나타납니다.
            </span>
          </div>
        </div>
      ) : (
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {rows.map((g) => (
            <Link key={g._id} href={`/groups/${encodeURIComponent(g._id)}`}>
              <div className={`card${g.overdue ? ' tone-bad' : g.needsReply ? ' tone-warn' : ''}`}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.02em' }}>
                  📁 {g._id}
                </div>

                <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                  {g.needsReply > 0 && <span className="badge reply">답변 필요 {g.needsReply}</span>}
                  {g.overdue > 0 && <span className="badge overdue">기한 지남 {g.overdue}</span>}
                  {!g.needsReply && !g.overdue && <span className="badge low">처리할 것 없음</span>}
                </div>

                <div className="muted" style={{ fontSize: 13 }}>
                  전체 {g.total.toLocaleString()}통 · 미처리 {g.open}통
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                  최근 수신 {fmt(g.last)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {all.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title">거래처는 어떻게 붙나요</div>
          <div className="muted" style={{ fontSize: 13 }}>
            메일함의 거래처 폴더에서 가져온 메일은 <b>폴더명</b>이 그대로 거래처가 됩니다.
            미분류함으로 새 메일이 오면 <b>발신자 이력</b>(같은 사람·같은 회사 도메인)과 <b>제목의 거래처명</b>으로
            자동 지정합니다. 이 과정에는 비용이 들지 않습니다.
            거래처가 잘못 붙었다면 메일 상세에서 바꾸면 되고, 바꾼 것은 자동 분류가 덮어쓰지 않습니다.
          </div>
        </div>
      )}
    </>
  );
}
