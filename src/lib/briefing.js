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

/** '놓친 것'을 얼마나 거슬러 볼지 — 너무 넓히면 옛 미처리가 산더미로 쌓여 손을 못 댄다 */
const MISSED_LOOKBACK_DAYS = 30;

/** 목록에 필요한 필드만 (본문은 화면에서 쓰지 않는다) */
const PROJECTION = {
  subject: 1, 'translation.subject': 1, from: 1, date: 1, receivedAt: 1,
  status: 1, classification: 1, lang: 1, memo: 1, group: 1, groupBy: 1,
  // 메일함을 여럿 쓰면 "이게 어디로 온 건지" 가 판단에 들어간다
  accountId: 1,
  'analysis.topic': 1, 'analysis.summary': 1, 'analysis.keyPoints': 1,
  'analysis.intent': 1, 'analysis.suggestedAction': 1, 'analysis.needsReply': 1,
  'analysis.deadline': 1, 'analysis.deadlineType': 1, 'analysis.urgency': 1,
  'analysis.method': 1,
};

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

    // 날짜를 지정하면 그 '달력 하루'를 본다 (화면에서 ← → 로 넘길 때).
    //
    // 지정하지 않으면(크론·'오늘') **지금부터 거슬러 N일**을 본다.
    // 달력 하루로 잡으면 오전 9시에 도는 크론이 그날 00~09시만 보게 되는데,
    // 실측하면 메일의 89%가 09시 이후에 온다(유럽·이스라엘 업무시간이 한국 오후다).
    // 그러면 대부분의 메일이 어느 브리핑에도 담기지 않는다.
    let start;
    let end;
    if (date) {
      ({ start, end } = kstDayRange(date));
      start = new Date(end.getTime() - days * 86400_000);
    } else {
      end = new Date();
      start = new Date(end.getTime() - days * 86400_000);
    }
    const from = start;

    // 기간은 '메일이 온 날짜'(date) 기준이다. 수집 시각으로 잡으면
    // 과거 메일을 오늘 수집했다는 이유로 오늘 브리핑에 쏟아진다.
    const query = {
      date: { $gte: from, $lt: end },
      classification: { $in: PROPOSAL_CLASSES },
      // 우리가 보낸 메일은 '처리할 일'이 아니다.
      // 거래처 폴더에는 보낸 메일 사본이 함께 들어와서, 걸러내지 않으면
      // "법인카드 사용내역 송부", "매출 보고" 처럼 내가 쓴 메일이
      // 답변 필요 건으로 브리핑 맨 위에 올라온다(실측 확인).
      direction: { $ne: 'out' },
      // 휴지통으로 보낸 것은 할 일도 기록도 아니다
      trashedAt: null,
    };
    if (!includeDone) query.status = { $nin: DONE_STATUSES };

    const items = await mails
      .find(query, { projection: PROJECTION })
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

    // 이 기간보다 앞에 왔는데 아직 손대지 않은 제안 = '놓친 것'.
    //
    // 하루치만 보여주면, 어제 온 건을 오늘 열었을 때 화면이 0건으로 비어
    // "처리할 게 없다"로 읽힌다. 실제로는 밀려 있는데도 그렇다.
    // 사이드바 배지와 화면 숫자가 어긋나 보이던 원인도 이것이다.
    const missed = includeDone ? [] : await mails
      .find({
        date: { $gte: new Date(from.getTime() - MISSED_LOOKBACK_DAYS * 86400_000), $lt: from },
        classification: { $in: PROPOSAL_CLASSES },
        direction: { $ne: 'out' },
        // 휴지통으로 보낸 것은 할 일도 기록도 아니다
        trashedAt: null,
        status: { $nin: DONE_STATUSES },
      }, { projection: PROJECTION })
      .sort({ date: -1 })
      .limit(100)
      .toArray();

    const missedSer = missed.map((m) => ({ ...m, _id: String(m._id) }));

    // 체크해서 처리한 것 — 확인용. 화면 위 카드에서 눌러 볼 수 있게 함께 싣는다.
    // 별도 화면을 두지 않는 이유는, 이건 '가서 일하는 곳'이 아니라
    // "내가 체크한 게 이게 맞나" 를 한 번 훑는 자리이기 때문이다.
    const done = await mails
      .find({
        date: { $gte: new Date(end.getTime() - MISSED_LOOKBACK_DAYS * 86400_000) },
        classification: { $in: PROPOSAL_CLASSES },
        direction: { $ne: 'out' },
        // 휴지통으로 보낸 것은 할 일도 기록도 아니다
        trashedAt: null,
        status: { $in: DONE_STATUSES },
      }, { projection: PROJECTION })
      .sort({ date: -1 })
      .limit(100)
      .toArray();

    const doneSer = done.map((m) => ({ ...m, _id: String(m._id) }));

    return {
      connected: true,
      date: date || kstDateString(),
      days,
      total: ser.length,
      needsReply: ser.filter((m) => m.analysis?.needsReply).length,
      withDeadline: ser.filter((m) => m.analysis?.deadline).length,
      unanalyzed: ser.filter((m) => m.analysis?.method !== 'ai').length,
      items: ser,
      // 놓친 것 — 화면에서 접어 두고, 사이드바 배지는 이것까지 합쳐 센다
      missedTotal: missedSer.length,
      missedNeedsReply: missedSer.filter((m) => m.analysis?.needsReply).length,
      missed: missedSer,
      // 체크해서 처리한 것 (최근 한 달) — 확인용
      doneTotal: doneSer.length,
      done: doneSer,
    };
  } catch (e) {
    return { connected: false, error: String(e?.message || e) };
  }
}

/** 메일에 '먼저 볼 것'으로 올릴 최대 건수 — 넘기면 판단이 아니라 읽기가 된다 */
const MAIL_TOP_N = 5;

/** 기한이 임박(3일 이내)했거나 지난 건으로 본다 */
function urgentByDeadline(deadline, now = new Date()) {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  const toKstDay = (x) => Math.floor((x.getTime() + 9 * 3600_000) / 86400000);
  return toKstDay(d) - toKstDay(now) <= 3;
}

function ddayText(deadline, now = new Date()) {
  const d = new Date(deadline);
  const toKstDay = (x) => Math.floor((x.getTime() + 9 * 3600_000) / 86400000);
  const n = toKstDay(d) - toKstDay(now);
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n} 지남`;
}

const cut = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * 브리핑을 메일 본문(텍스트)으로.
 *
 * 메일은 **"지금 열까, 나중에 열까"를 판단할 만큼만** 담는다. 전체 내용을 넣지 않는 이유:
 *   1) 이 도구는 넘치는 메일함을 정리하려고 만든 것이다. 거기에 긴 메일을 더 넣으면 안 읽힌다.
 *   2) 핵심 동선은 '브리핑 화면에서 체크 → 처리완료' 다. 메일에 다 들어 있으면
 *      화면에 들어오지 않게 되고, 체크가 안 되니 다음 날 같은 건이 또 올라온다.
 *   3) 번역 2단 비교·답장 초안·발송·메모는 화면에서만 된다.
 * 그래서 급한 것 몇 건만 한 줄 요약과 함께 싣고, 나머지는 건수로만 알린다.
 */
export function renderBriefingText(b, baseUrl = '') {
  const L = [];
  const day = b.days > 1 ? `${b.date} 기준 최근 ${b.days}일` : b.date;

  L.push(`■ 오늘의 제안 메일 — ${day}`);
  L.push('');
  if (!b.total) {
    L.push('새로 들어온 제안 메일이 없습니다.');
    return L.join('\n');
  }

  L.push(`총 ${b.total}건 · 답변 필요 ${b.needsReply}건 · 기한 있음 ${b.withDeadline}건`);

  // 급한 것 = 기한 임박·초과 또는 긴급도 높음. 기한 있는 것을 먼저, 그 다음 긴급도순.
  const now = new Date();
  const urgent = b.items
    .filter((m) => {
      const a = m.analysis || {};
      return urgentByDeadline(a.deadline, now) || (a.urgency === 'high' && a.needsReply);
    })
    .sort((x, y) => {
      const ax = x.analysis || {};
      const ay = y.analysis || {};
      if (Boolean(ax.deadline) !== Boolean(ay.deadline)) return ax.deadline ? -1 : 1;
      if (ax.deadline && ay.deadline) return new Date(ax.deadline) - new Date(ay.deadline);
      return 0;
    })
    .slice(0, MAIL_TOP_N);

  if (urgent.length) {
    L.push('');
    L.push('━━ 먼저 볼 것 ━━');
    urgent.forEach((m, i) => {
      const a = m.analysis || {};
      const head = [
        m.group ? `[${m.group}]` : '[미분류]',
        a.deadline ? ddayText(a.deadline, now) : '',
      ].filter(Boolean).join('  ');

      L.push('');
      L.push(`${i + 1}. ${head}`);
      L.push(`   ${cut(a.topic || m.translation?.subject || m.subject, 60)}`);
      // 무엇을 하면 되는지 한 줄. 폰에서 훑을 때 이 줄로 판단이 선다.
      const action = a.suggestedAction || a.summary;
      if (action) L.push(`   → ${cut(action, 70)}`);
      if (baseUrl) L.push(`   ${baseUrl}/mails/${m._id}`);
    });
  }

  const rest = b.total - urgent.length;
  L.push('');
  if (rest > 0) L.push(`나머지 ${rest}건은 브리핑 화면에서 확인하세요.`);
  else L.push('전체 내용은 브리핑 화면에서 확인하세요.');
  if (baseUrl) L.push(`→ ${baseUrl}/briefing`);
  return L.join('\n');
}
