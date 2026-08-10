/**
 * 대시보드 집계. DB 가 죽어도 화면이 크래시하지 않도록 전부 감싼다.
 */
import { collections } from './db';

const AI_TARGET = { classification: { $nin: ['ad', 'system', 'newsletter'] } };
const OPEN = { status: { $in: ['new', 'reviewing'] } };

export async function getDashboard() {
  try {
    const mails = await collections.mails();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const in7 = new Date(now.getTime() + 7 * 86400000);

    const [total, unread, needsReply, dueSoon, overdue, repliedThisWeek, pendingAnalysis] =
      await Promise.all([
        mails.countDocuments({}),
        mails.countDocuments({ status: 'new', ...AI_TARGET }),
        mails.countDocuments({ 'analysis.needsReply': true, ...OPEN }),
        mails.countDocuments({ 'analysis.deadline': { $ne: null, $gte: now, $lte: in7 }, ...OPEN }),
        mails.countDocuments({ 'analysis.deadline': { $ne: null, $lt: now }, ...OPEN }),
        mails.countDocuments({ status: 'replied', repliedAt: { $gte: weekAgo } }),
        // 로컬 1차 분석만 된 것도 "AI 분석 대기"로 센다
        mails.countDocuments({
          $or: [{ analysis: null }, { 'analysis.method': { $ne: 'ai' } }],
          ...AI_TARGET,
        }),
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
      kpi: { total, unread, needsReply, dueSoon, overdue, repliedThisWeek, pendingAnalysis },
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

    const [overdue, soon, later, noDeadlineReply] = await Promise.all([
      mails.find({ ...base, 'analysis.deadline': { $ne: null, $lt: now } }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).toArray(),
      mails.find({ ...base, 'analysis.deadline': { $gte: now, $lte: in7 } }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).toArray(),
      mails.find({ ...base, 'analysis.deadline': { $gt: in7 } }, { projection: proj })
        .sort({ 'analysis.deadline': 1 }).toArray(),
      mails.find({ 'analysis.needsReply': true, 'analysis.deadline': null, ...OPEN }, { projection: proj })
        .sort({ date: -1 }).limit(30).toArray(),
    ]);

    const ser = (arr) => arr.map((m) => ({ ...m, _id: String(m._id) }));
    return { connected: true, overdue: ser(overdue), soon: ser(soon), later: ser(later), noDeadlineReply: ser(noDeadlineReply) };
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
