/**
 * 대시보드 집계. DB 가 죽어도 화면이 크래시하지 않도록 전부 감싼다.
 */
import { collections } from './db';

// 우리가 보낸 메일은 어떤 집계에도 들어가지 않는다.
// '답변 필요 1,200건' 의 3분의 1이 우리가 쓴 메일이면 숫자가 의미를 잃는다.
const INBOUND = { direction: { $ne: 'out' } };
const AI_TARGET = { classification: { $nin: ['ad', 'system', 'newsletter'] }, ...INBOUND };
const OPEN = { status: { $in: ['new', 'reviewing'] }, ...INBOUND };

export async function getDashboard() {
  try {
    const mails = await collections.mails();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const in7 = new Date(now.getTime() + 7 * 86400000);

    // 누적 숫자만 크게 보여주면 1년 반치가 쌓여 '밀린 일 1,200건'처럼 읽힌다.
    // 지금 손댈 수 있는 최근 30일을 앞에 세우고 누적은 부가 정보로 둔다.
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const RECENT = { date: { $gte: monthAgo } };

    const [
      total, unread, needsReply, dueSoon, overdue, repliedThisWeek, pendingAnalysis,
      needsReplyRecent, unreadRecent, pendingAnalysisRecent, overdueAll,
    ] =
      await Promise.all([
        mails.countDocuments({}),
        mails.countDocuments({ status: 'new', ...AI_TARGET }),
        mails.countDocuments({ 'analysis.needsReply': true, ...OPEN }),
        mails.countDocuments({ 'analysis.deadline': { $ne: null, $gte: now, $lte: in7 }, ...OPEN }),
        // 기한 화면과 같은 기준 — 아직 대응이 의미 있는 30일 이내만 센다.
        // 1년 전 기한까지 합치면 숫자가 커지기만 하고 행동으로 이어지지 않는다.
        mails.countDocuments({
          'analysis.deadline': { $ne: null, $gte: monthAgo, $lt: now }, ...OPEN,
        }),
        mails.countDocuments({ status: 'replied', repliedAt: { $gte: weekAgo } }),
        // 로컬 1차 분석만 된 것도 "AI 분석 대기"로 센다
        mails.countDocuments({
          $or: [{ analysis: null }, { 'analysis.method': { $ne: 'ai' } }],
          ...AI_TARGET,
        }),
        mails.countDocuments({ 'analysis.needsReply': true, ...OPEN, ...RECENT }),
        mails.countDocuments({ status: 'new', ...AI_TARGET, ...RECENT }),
        mails.countDocuments({
          $or: [{ analysis: null }, { 'analysis.method': { $ne: 'ai' } }],
          ...AI_TARGET, ...RECENT,
        }),
        mails.countDocuments({ 'analysis.deadline': { $ne: null, $lt: now }, ...OPEN }),
      ]);

    const proj = {
      subject: 1, 'translation.subject': 1, from: 1, date: 1, status: 1,
      classification: 1, lang: 1, group: 1,
      'analysis.topic': 1, 'analysis.needsReply': 1, 'analysis.deadline': 1,
      'analysis.deadlineType': 1, 'analysis.urgency': 1, 'analysis.suggestedAction': 1,
    };

    const [replyList, deadlineList, recent, byClassification] = await Promise.all([
      mails.find({ 'analysis.needsReply': true, ...OPEN }, { projection: proj })
        .sort({ 'analysis.urgency': 1, date: -1 }).limit(12).toArray(),
      mails.find({ 'analysis.deadline': { $ne: null }, ...OPEN }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).limit(12).toArray(),
      mails.find({}, { projection: proj }).sort({ date: -1 }).limit(8).toArray(),
      mails.aggregate([
        { $group: { _id: '$classification', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]).toArray(),
    ]);

    const ser = (arr) => arr.map((m) => ({ ...m, _id: String(m._id) }));

    return {
      connected: true,
      kpi: {
        total, unread, needsReply, dueSoon, overdue, repliedThisWeek, pendingAnalysis,
        needsReplyRecent, unreadRecent, pendingAnalysisRecent, overdueAll,
      },
      replyList: ser(replyList),
      deadlineList: ser(deadlineList),
      recent: ser(recent),
      byClassification,
    };
  } catch (e) {
    return { connected: false, error: String(e?.message || e) };
  }
}

/** 기한 화면 — 지남/오늘·이번주/이후 로 나눠서 */
export async function getDeadlines() {
  try {
    const mails = await collections.mails();
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);

    const proj = {
      subject: 1, 'translation.subject': 1, from: 1, date: 1, status: 1, classification: 1, group: 1,
      'analysis.topic': 1, 'analysis.deadline': 1, 'analysis.deadlineType': 1,
      'analysis.deadlineText': 1, 'analysis.urgency': 1, 'analysis.suggestedAction': 1,
      'analysis.needsReply': 1,
    };
    const base = { 'analysis.deadline': { $ne: null }, ...OPEN };

    // 기한 지남을 한 덩어리로 보여주면 1년 전 기한(D+500)이 맨 위를 차지해
    // "지금 손대야 할 것"이 묻힌다. 아직 대응이 의미 있는 30일 이내와
    // 참고용으로만 남는 그 이전을 나눈다.
    const monthAgo = new Date(now.getTime() - 30 * 86400000);

    const [overdue, longOverdue, soon, later, noDeadlineReply] = await Promise.all([
      mails.find({ ...base, 'analysis.deadline': { $gte: monthAgo, $lt: now } }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).toArray(),
      mails.find({ ...base, 'analysis.deadline': { $lt: monthAgo } }, { projection: proj })
        .sort({ 'analysis.deadline': -1 }).toArray(),
      mails.find({ ...base, 'analysis.deadline': { $gte: now, $lte: in7 } }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).toArray(),
      mails.find({ ...base, 'analysis.deadline': { $gt: in7 } }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).toArray(),
      mails.find({ 'analysis.needsReply': true, 'analysis.deadline': null, ...OPEN }, { projection: proj })
        .sort({ date: -1 }).limit(30).toArray(),
    ]);

    const ser = (arr) => arr.map((m) => ({ ...m, _id: String(m._id) }));
    return {
      connected: true,
      overdue: ser(overdue),
      longOverdue: ser(longOverdue),
      soon: ser(soon),
      later: ser(later),
      noDeadlineReply: ser(noDeadlineReply),
    };
  } catch (e) {
    return { connected: false, error: String(e?.message || e) };
  }
}

/** 최근 수집 상태 — 대시보드 하단 안내용 */
export async function getSyncSummary() {
  try {
    const col = await collections.syncState();
    return await col.find({}).toArray();
  } catch {
    return [];
  }
}
