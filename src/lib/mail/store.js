/**
 * 저장 계층 — messageId 유니크로 재수집 중복을 막고, 폴더별 마지막 UID 를 추적한다.
 */
import { collections, ensureIndexes } from '@/lib/db';

/**
 * 신규 삽입만 한다(이미 있으면 건드리지 않음) — 사람이 붙인 상태·메모를 재수집이 덮지 않도록.
 * @returns {'inserted'|'duplicate'}
 */
export async function insertMail(doc) {
  await ensureIndexes();
  const mails = await collections.mails();
  try {
    const r = await mails.updateOne(
      { messageId: doc.messageId },
      {
        $setOnInsert: {
          ...doc,
          classification: doc.classification || 'unknown',
          classifiedBy: doc.classifiedBy || null,
          status: 'new',
          memo: '',
          tags: [],
          translation: null,
          // 수집 단계의 로컬 1차 분석 결과를 보존한다 (없으면 null)
          analysis: doc.analysis || null,
          drafts: [],
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    return r.upsertedCount > 0 ? 'inserted' : 'duplicate';
  } catch (e) {
    // 동시 수집 시 유니크 인덱스 충돌 — 중복으로 취급
    if (e?.code === 11000) return 'duplicate';
    throw e;
  }
}

export async function getMail(id) {
  const { ObjectId } = await import('mongodb');
  const mails = await collections.mails();
  return mails.findOne({ _id: new ObjectId(String(id)) });
}

export async function updateMail(id, patch) {
  const { ObjectId } = await import('mongodb');
  const mails = await collections.mails();
  await mails.updateOne(
    { _id: new ObjectId(String(id)) },
    { $set: { ...patch, updatedAt: new Date() } },
  );
  return getMail(id);
}

/** 목록 필터 조건 — 낱개 조회와 스레드 조회가 같은 규칙을 쓰도록 분리했다 */
function buildMailQuery({
  classification, status, lang, needsReply, from, q, group, since, until,
} = {}) {
  const query = {};

  if (classification) query.classification = { $in: String(classification).split(',') };
  if (status) query.status = { $in: String(status).split(',') };
  if (lang) query.lang = lang;
  if (from) query['from.address'] = String(from).toLowerCase();
  if (group) query.group = group === '__none__' ? null : group;
  if (needsReply === true || needsReply === 'true') query['analysis.needsReply'] = true;
  if (since || until) {
    query.date = {};
    if (since) query.date.$gte = new Date(since);
    if (until) query.date.$lte = new Date(until);
  }
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { subject: rx }, { 'from.address': rx }, { 'from.name': rx },
      { 'translation.subject': rx }, { 'analysis.topic': rx }, { 'analysis.summary': rx },
    ];
  }
  return { query };
}

/** 목록 조회 — 필터·검색·페이징 */
export async function listMails(opts = {}) {
  const {
    // 정렬 기본값은 '메일이 온 시각'(date) 이다.
    // 수집 시각(receivedAt) 으로 정렬하면 과거 메일을 대량 수집한 직후
    // 몇 년 전 메일이 목록 맨 위로 올라온다.
    limit = 50, skip = 0, sort = '-date',
  } = opts;
  const mails = await collections.mails();
  const { query } = buildMailQuery(opts);

  const sortSpec = sort.startsWith('-') ? { [sort.slice(1)]: -1 } : { [sort]: 1 };
  const [items, count] = await Promise.all([
    mails.find(query, { projection: { 'raw.html': 0 } })
      .sort(sortSpec).skip(Number(skip)).limit(Math.min(Number(limit), 200)).toArray(),
    mails.countDocuments(query),
  ]);
  return { items, count };
}

/**
 * 스레드 단위 목록 — 같은 대화는 한 줄로 묶어 최신 메일만 보여준다.
 *
 * 답장이 20번 오간 건이 20줄로 늘어나면 "이 건이 어디까지 왔나"를 볼 수 없다.
 * 대화당 한 줄 + 오간 통수를 보여주는 편이 실제 사용에 맞는다.
 */
export async function listThreads(opts = {}) {
  const { limit = 50, skip = 0 } = opts;
  const mails = await collections.mails();

  // 필터 조건은 낱개 조회와 동일하게 맞춘다
  const { query } = buildMailQuery(opts);

  const pipeline = [
    { $match: query },
    // 본문을 먼저 걷어낸다. raw 를 안고 정렬하면 문서가 커서 32MB 정렬 한도를 넘는다.
    // 목록 화면은 본문을 그리지 않으므로 여기서 뺀 채로 집계해도 무방하다.
    { $project: { raw: 0, doc: 0, drafts: 0, 'analysis.usage': 0 } },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: { $ifNull: ['$threadKey', { $toString: '$_id' }] },
        // 스레드의 대표는 가장 최근 메일
        latest: { $first: '$$ROOT' },
        count: { $sum: 1 },
        firstDate: { $min: '$date' },
        anyAnalyzed: { $max: { $cond: [{ $eq: ['$analysis.method', 'ai'] }, 1, 0] } },
        // 아직 안 지난 기한 중 가장 이른 것.
        // 스레드 전체에서 그냥 최소값을 잡으면 몇 달 전 메일의 이미 끝난 기한이
        // 계속 D-day 로 뜬다. 반대로 최신 메일만 보면 "9월 1일까지 회신" 이
        // 두 통 전에 있었을 때 기한을 통째로 놓친다.
        nearestDeadline: {
          $min: {
            $cond: [{ $gte: ['$analysis.deadline', '$$NOW'] }, '$analysis.deadline', null],
          },
        },
      },
    },
    { $sort: { 'latest.date': -1 } },
    {
      $facet: {
        rows: [
          { $skip: Number(skip) },
          { $limit: Math.min(Number(limit), 200) },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ];

  // 메일이 많아지면 정렬이 메모리 한도를 넘을 수 있어 디스크 사용을 허용한다
  const [res] = await mails.aggregate(pipeline, { allowDiskUse: true }).toArray();
  const rows = res?.rows || [];

  return {
    items: rows.map((r) => ({
      ...r.latest,
      threadKey: r._id,
      threadCount: r.count,
      threadFirstDate: r.firstDate,
      threadAnalyzed: Boolean(r.anyAnalyzed),
      threadDeadline: r.nearestDeadline || null,
      // 답변 필요 여부는 스레드의 '최신' 메일이 정한다.
      // 4월에 물어본 것을 이미 답했는데도 스레드가 계속 '답변 필요'로 남으면 안 된다.
    })),
    count: res?.total?.[0]?.n || 0,
  };
}

/** 한 스레드의 모든 메일 (오래된 것부터 — 대화 흐름대로) */
export async function getThread(key) {
  const mails = await collections.mails();
  return mails
    .find({ threadKey: key }, { projection: { 'raw.html': 0 } })
    .sort({ date: 1 })
    .toArray();
}

/** 폴더별 동기화 상태 */
export async function getSyncState(folder) {
  const col = await collections.syncState();
  return (await col.findOne({ folder })) || { folder, lastUid: 0, lastSyncAt: null, lastError: null };
}

export async function setSyncState(folder, patch) {
  await ensureIndexes();
  const col = await collections.syncState();
  await col.updateOne({ folder }, { $set: { folder, ...patch } }, { upsert: true });
}

/**
 * 아직 AI 분석(유료)이 안 된 메일 — 로컬 1차 분석만 된 것 포함.
 * 광고·자동발송은 애초에 대상이 아니다.
 *
 * 기본은 **최신 메일부터**다. 오래된 것부터 처리하면 밀린 물량을 다 씹을 때까지
 * 오늘 온 메일이 요약되지 않는다 (1,600통 대기 · 하루 20통이면 80일).
 * 매일 아침 브리핑은 어제·오늘 온 메일이 담겨야 쓸모가 있다.
 *
 * 밀린 과거분을 채울 때만 oldestFirst 로 뒤에서부터 훑는다.
 */
export async function findUnanalyzed(limit = 20, extraQuery = {}, { oldestFirst = false } = {}) {
  const mails = await collections.mails();
  return mails
    .find({
      $or: [{ analysis: null }, { 'analysis.method': { $ne: 'ai' } }],
      classification: { $nin: ['ad', 'system'] },
      // 우리가 보낸 메일은 자동 요약 대상이 아니다 — 할 일이 아니라 기록이다.
      // (direction 이 없는 옛 문서도 통과시켜야 하므로 $ne 로 본다)
      direction: { $ne: 'out' },
      ...extraQuery,
    })
    .sort(oldestFirst ? { date: 1 } : { date: -1 })
    .limit(limit)
    .toArray();
}

/** AI 분석 대기 건수 — 비용 예측용 */
export async function countUnanalyzed() {
  const mails = await collections.mails();
  // 화면의 '분석 대기 N통 · 예상 ₩M' 이 크론 대상과 같아야 한다
  return mails.countDocuments({
    $or: [{ analysis: null }, { 'analysis.method': { $ne: 'ai' } }],
    classification: { $nin: ['ad', 'system'] },
    direction: { $ne: 'out' },
  });
}
