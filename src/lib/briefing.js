/**
 * 일일 브리핑 — "오늘 이런 제안들이 왔습니다" 를 투두리스트로 만든다.
 *
 * 대시보드가 '지금 상태'를 보여준다면, 브리핑은 '하루치 묶음'이다.
 * 하루 한 번 열어서 위에서부터 체크해 내려가는 것이 사용 흐름이다.
 */
import { collections } from './db';

/** 제안으로 볼 분류 — 광고·뉴스레터·자동발송은 브리핑에 넣지 않는다 */
export const PROPOSAL_CLASSES = ['b2b', 'inquiry', 'partner', 'unknown'];

/** 브리핑에서 '처리됨'으로 보는 상태 */
const DONE_STATUSES = ['replied', 'archived', 'ignored'];

/** KST 기준 하루의 시작·끝 (서버 시간대와 무관하게 동작해야 한다) */
export function kstDayRange(dateStr) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00+09:00`) : new Date();
  const kstMidnight = dateStr
    ? base
    : new Date(new Date(base.getTime() + 9 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+09:00');
  return { start: kstMidnight, end: new Date(kstMidnight.getTime() + 86400_000) };
}

export function kstDateString(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 하루치 브리핑.
 * @param {{ date?: string, days?: number, includeDone?: boolean }} opts
 *   date  'YYYY-MM-DD' (미지정 시 오늘)
 *   days  N일치를 한 번에 (주말 지나고 월요일에 몰아볼 때 3 등)
 */
export async function getBriefing({ date, days = 1, includeDone = false } = {}) {
  try {
    const mails = await collections.mails();
    const { start, end } = kstDayRange(date);
    const from = new Date(end.getTime() - days * 86400_000);

    // 기간은 '메일이 온 날짜'(date) 기준이다. 수집 시각으로 잡으면
    // 과거 메일을 오늘 수집했다는 이유로 오늘 브리핑에 쏟아진다.
    const query = {
      date: { $gte: from, $lt: end },
      classification: { $in: PROPOSAL_CLASSES },
    };
    if (!includeDone) query.status = { $nin: DONE_STATUSES };

    const items = await mails
      .find(query, {
        projection: {
          subject: 1, 'translation.subject': 1, from: 1, date: 1, receivedAt: 1,
          status: 1, classification: 1, lang: 1, memo: 1, group: 1, groupBy: 1,
          'analysis.topic': 1, 'analysis.summary': 1, 'analysis.keyPoints': 1,
          'analysis.intent': 1, 'analysis.suggestedAction': 1, 'analysis.needsReply': 1,
          'analysis.deadline': 1, 'analysis.deadlineType': 1, 'analysis.urgency': 1,
          'analysis.method': 1,
        },
      })
      .sort({ 'analysis.urgency': 1, date: -1 })
      .limit(200)
      .toArray();

    // 긴급도 → 기한 → 수신순으로 정렬 (처리 순서 그대로 읽히도록)
    const rank = { high: 0, mid: 1, low: 2 };
    items.sort((a, b) => {
      const ua = rank[a.analysis?.urgency] ?? 3;
      const ub = rank[b.analysis?.urgency] ?? 3;
      if (ua !== ub) return ua - ub;
      const da = a.analysis?.deadline ? new Date(a.analysis.deadline).getTime() : Infinity;
      const db_ = b.analysis?.deadline ? new Date(b.analysis.deadline).getTime() : Infinity;
      if (da !== db_) return da - db_;
      return new Date(b.date) - new Date(a.date);
    });

    const ser = items.map((m) => ({ ...m, _id: String(m._id) }));

    return {
      connected: true,
      date: date || kstDateString(),
      days,
      total: ser.length,
      needsReply: ser.filter((m) => m.analysis?.needsReply).length,
      withDeadline: ser.filter((m) => m.analysis?.deadline).length,
      unanalyzed: ser.filter((m) => m.analysis?.method !== 'ai').length,
      items: ser,
    };
  } catch (e) {
    return { connected: false, error: String(e?.message || e) };
  }
}

/** 브리핑을 메일 본문(텍스트)으로 — 하루 한 번 받아보는 용도 */
export function renderBriefingText(b, baseUrl = '') {
  const L = [];
  const day = b.days > 1 ? `${b.date} 기준 최근 ${b.days}일` : b.date;

  L.push(`■ 제안 메일 브리핑 (${day})`);
  L.push('');
  if (!b.total) {
    L.push('새로 들어온 제안 메일이 없습니다.');
    return L.join('\n');
  }

  L.push(`총 ${b.total}건 · 답변 필요 ${b.needsReply}건 · 기한 있음 ${b.withDeadline}건`);
  L.push('');
  L.push('─'.repeat(46));

  b.items.forEach((m, i) => {
    const a = m.analysis || {};
    const mark = a.needsReply ? '[답변필요]' : '[참고]';
    L.push('');
    L.push(`${i + 1}. ${mark}${m.group ? ` [${m.group}]` : ''} ${m.translation?.subject || m.subject}`);
    L.push(`   보낸이: ${m.from?.name || ''} <${m.from?.address || ''}>`);
    if (a.topic) L.push(`   주제: ${a.topic}`);
    if (a.summary) L.push(`   요약: ${a.summary}`);
    if (a.deadline) {
      const d = new Date(a.deadline).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
      L.push(`   기한: ${d}`);
    }
    if (a.suggestedAction) L.push(`   조치: ${a.suggestedAction}`);
    if (baseUrl) L.push(`   열기: ${baseUrl}/mails/${m._id}`);
  });

  L.push('');
  L.push('─'.repeat(46));
  if (baseUrl) L.push(`전체 브리핑: ${baseUrl}/briefing`);
  return L.join('\n');
}
