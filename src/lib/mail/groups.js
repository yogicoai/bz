/**
 * 거래처 그룹 — 메일함의 '내 메일함' 하위 폴더가 곧 거래처 분류다.
 *
 *   INBOX.Yogibo Japan        → "Yogibo Japan"
 *   INBOX.Distribution Group Turkey → "Distribution Group Turkey"
 *
 * 대표님이 손으로 분류해 둔 이 폴더들이 **학습 데이터**가 된다.
 * "이 발신자의 메일은 이 폴더에 넣었다" 를 배우면, 새로 온 메일은
 * AI 없이(=무료로) 정확히 같은 폴더로 분류할 수 있다.
 * 처음 보는 발신자만 AI 추천에 맡긴다.
 */
import { collections } from '@/lib/db';

/** IMAP 폴더 경로 → 화면에 보여줄 그룹명 */
export function groupNameFromFolder(folder = '') {
  return String(folder).replace(/^INBOX[./]/i, '').trim() || folder;
}

/** 회사를 특정할 수 없는 개인 메일 도메인 — 도메인 기반 추론에서 제외 */
const FREE_MAIL = new Set([
  'gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'nate.com',
  'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'me.com',
  'qq.com', '163.com', '126.com', 'yandex.com', 'proton.me', 'protonmail.com',
]);

/** 수집 대상이지만 거래처 그룹이 아닌 폴더 (미분류 원본함) */
const NON_GROUP = /^(INBOX|Sent|Drafts|Junk|Trash|DEMO)$/i;
export const isGroupFolder = (folder) => Boolean(folder) && !NON_GROUP.test(folder);

/**
 * 이미 수집된 메일에서 "발신자 → 그룹" 이력을 만든다.
 * 주소가 정확히 일치하는 쪽을 우선하고, 없으면 도메인으로 본다.
 */
/**
 * 자사 도메인 — 도메인 기반 추론에서 제외한다.
 *
 * 사업개발 폴더 577통 중 대부분이 hoon@yogico.kr 이라 "yogico.kr = 사업개발"로
 * 학습되고, 그 결과 사내 경영 보고(tim@·fe@)까지 사업개발로 끌려온다.
 * 우리 회사 도메인은 거래처를 특정하지 못하므로 개인 메일 도메인과 같이 취급한다.
 * 담당자 개인은 주소 정확 일치로 계속 잡히므로 hoon@ 은 영향이 없다.
 */
async function ownDomains() {
  try {
    const { getSettings } = await import('@/lib/settings');
    const s = await getSettings();
    const out = new Set();
    for (const u of [s?.imapUser, s?.smtpUser]) {
      const d = String(u || '').toLowerCase().split('@')[1];
      if (d) out.add(d);
    }
    return out;
  } catch {
    return new Set();
  }
}

export async function learnSenderGroups() {
  const mails = await collections.mails();
  const own = await ownDomains();

  const rows = await mails
    .aggregate([
      { $match: { group: { $ne: null }, 'from.address': { $ne: '' } } },
      {
        $group: {
          _id: { addr: '$from.address', group: '$group' },
          n: { $sum: 1 },
          last: { $max: '$date' },
        },
      },
    ])
    .toArray();

  const byAddress = new Map(); // addr → [{group, n, last}]
  const byDomain = new Map();

  for (const r of rows) {
    const { addr, group } = r._id;
    if (!addr || !group) continue;
    const domain = addr.split('@')[1] || '';

    const push = (map, key) => {
      if (!key) return;
      const list = map.get(key) || [];
      list.push({ group, n: r.n, last: r.last });
      map.set(key, list);
    };
    push(byAddress, addr);
    // 개인 메일 도메인은 아예 이력에 담지 않는다.
    // 실제로 거래처 담당자가 gmail 을 쓰는 경우가 있어(예: 이스라엘 거래처),
    // 담지 않으면 "gmail 에서 온 모든 메일" 이 그 거래처로 몰리는 사고가 난다.
    // 그 담당자 개인은 주소 정확 일치(byAddress)로 계속 잡힌다.
    if (!FREE_MAIL.has(domain) && !own.has(domain)) push(byDomain, domain);
  }

  // 후보가 여럿이면 건수 → 최근순으로 하나만 남긴다
  const pick = (list) =>
    list.sort((a, b) => b.n - a.n || new Date(b.last) - new Date(a.last))[0];

  const addrMap = new Map([...byAddress].map(([k, v]) => [k, pick(v)]));
  const domainMap = new Map([...byDomain].map(([k, v]) => [k, pick(v)]));

  return { addrMap, domainMap, ownDomains: own, size: addrMap.size };
}

/**
 * 발신자 이력으로 그룹을 추천한다 — API 호출 없음(무료).
 * @returns {{ group, by:'address'|'domain', count }|null}
 */
export function suggestGroupBySender(mail, learned) {
  const addr = (mail?.from?.address || '').toLowerCase();
  if (!addr || !learned) return null;

  const exact = learned.addrMap.get(addr);
  if (exact) return { group: exact.group, by: 'address', count: exact.n };

  const domain = addr.split('@')[1] || '';
  // 개인 메일 도메인과 자사 도메인은 거래처를 특정하지 못하므로 도메인 추론에서 제외
  if (!domain || FREE_MAIL.has(domain)) return null;
  if (learned.ownDomains?.has(domain)) return null;

  const byDomain = learned.domainMap.get(domain);
  if (byDomain) return { group: byDomain.group, by: 'domain', count: byDomain.n };

  return null;
}

/* ────────────────────────────────────────────────────────────
   그룹명 텍스트 매칭 — 발신자 이력이 없을 때의 2차 단서.
   실제 메일 제목에 거래처명이 그대로 들어오는 경우가 많다.
     "RE: 터키 Distribution Group 샘플"   → Distribution Group Turkey
     "[오스템파마] 유럽향 라벨링 이슈"      → Osstem Pharma Vussen
   ──────────────────────────────────────────────────────────── */

/** 어느 거래처에나 나올 수 있어 단독으로는 근거가 못 되는 낱말 */
const GENERIC = new Set([
  'group', 'trade', 'vendors', 'vendor', 'beauty', 'pharma', 'inc', 'ltd', 'co',
  'corp', 'company', 'global', 'international', 'trading', 'distribution',
  'usa', 'israel', 'japan', 'romania', 'turkey', 'korea', 'europe',
  '사업개발', '영업', '해외', '거래처',
]);

/** 한국어 표기가 다른 거래처를 위한 별칭 */
const ALIASES = {
  'Osstem Pharma Vussen': ['오스템', '오스템파마', 'vussen'],
  'Distribution Group Turkey': ['터키'],
  'My K Romania': ['my-k', 'myk', '루마니아'],
  'Blue Marble Israel': ['blue marble'],
  'Yogibo Japan': ['yogibo japan', '요기보 재팬'],
  'Beauty Lyrics USA': ['beauty lyrics'],
  'Dangaard Beauty': ['dangaard'],
  'Schestowitz Israel': ['schestowitz'],
  'Orchesta Israel': ['orchesta'],
};

/** 그룹명에서 검색에 쓸 만한 낱말만 뽑는다 */
function tokensFor(group) {
  const extra = ALIASES[group] || [];
  const words = String(group)
    .split(/[\s._-]+/)
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length >= 3 && !GENERIC.has(w));

  // 두 낱말 조합도 후보로 (예: "blue marble")
  const parts = String(group).toLowerCase().split(/[\s._-]+/);
  const pairs = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const pair = `${parts[i]} ${parts[i + 1]}`;
    if (pair.length >= 7) pairs.push(pair);
  }

  return [...new Set([...extra.map((x) => x.toLowerCase()), ...pairs, ...words])];
}

/**
 * 제목에서 거래처명을 찾는다 — API 호출 없음(무료).
 * 여러 그룹이 걸리면 더 긴(=구체적인) 낱말이 맞은 쪽을 택한다.
 *
 * **제목만 본다.** 본문까지 뒤지면 인용된 이전 대화나 서명에 등장한 다른 거래처명이
 * 걸려서, 실제로는 무관한 메일이 엉뚱한 거래처로 분류된다(실측에서 확인).
 * 실무 메일은 제목에 거래처를 적어 두는 경우가 많아 제목만으로 충분하다.
 *
 * @param {string[]} groups 존재하는 그룹명 목록
 * @returns {{ group, by:'name', matched }|null}
 */
export function suggestGroupByName(mail, groups = []) {
  const hay = String(mail?.subject || '').toLowerCase();
  if (!hay.trim()) return null;

  let best = null;
  for (const group of groups) {
    for (const t of tokensFor(group)) {
      if (!hay.includes(t)) continue;
      if (!best || t.length > best.matched.length) best = { group, by: 'name', matched: t };
    }
  }
  return best;
}

/** 현재 존재하는 그룹 목록 (설정·화면 필터용) */
/** 사이드바 빨간 숫자가 세는 기간 — 최근 한 달 */
const FRESH_DAYS = 30;
const FRESH_SINCE = () => new Date(Date.now() - FRESH_DAYS * 86400000);

export async function listGroups() {
  const mails = await collections.mails();
  const rows = await mails
    .aggregate([
      { $match: { group: { $ne: null } } },
      {
        $group: {
          _id: '$group',
          n: { $sum: 1 },
          last: { $max: '$date' },
          // 최근 한 달 안에 들어온 것 중 아직 손대지 않은 '받은' 메일 수.
          //
          // 기간을 두지 않으면 1년 반치가 전부 미확인으로 잡혀 379·330 같은
          // 숫자가 뜬다. 그러면 "밀린 일이 산더미"로 읽혀 오히려 손을 못 대고,
          // 매일 늘어나는 몇 건이 그 안에 묻힌다.
          // 우리가 보낸 메일과 광고는 처리할 대상이 아니므로 세지 않는다.
          fresh: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'new'] },
                    { $ne: ['$direction', 'out'] },
                    { $gte: ['$date', FRESH_SINCE()] },
                    { $not: [{ $in: ['$classification', ['ad', 'system']] }] },
                  ],
                },
                1, 0,
              ],
            },
          },
        },
      },
      { $sort: { n: -1 } },
    ])
    .toArray();
  return rows.map((r) => ({ group: r._id, count: r.n, fresh: r.fresh, last: r.last }));
}
