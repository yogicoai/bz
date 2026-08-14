/**
 * MongoDB 연결 — 전역 캐시 방식.
 * 서버리스(Vercel)에서 콜드/웜 스타트 간 커넥션을 재사용하기 위해 globalThis 에 보관한다.
 * URI 미설정 시 throw 하지 않고 경고만 — 빌드 타임에 죽지 않도록.
 */
import { MongoClient } from 'mongodb';

/**
 * 환경변수는 호출 시점에 읽는다.
 * 모듈 로드 시점에 상수로 잡아두면 dev 서버가 .env.local 을 다시 읽어도 옛 값이 남는다.
 */
const getUri = () => process.env.EMAILDATA_URI || process.env.MONGODB_URI;
const getDbName = () => process.env.MONGODB_DB || 'emaildata';

let cached = globalThis._emaildataMongo;
if (!cached) cached = globalThis._emaildataMongo = { client: null, promise: null, uri: null };

async function getClient() {
  const uri = getUri();
  if (!uri) throw new Error('EMAILDATA_URI(또는 MONGODB_URI)가 설정되지 않았습니다.');

  // 접속 문자열이 바뀌었으면 기존 연결을 버리고 새로 붙는다
  if (cached.client && cached.uri !== uri) {
    const stale = cached.client;
    cached = globalThis._emaildataMongo = { client: null, promise: null, uri: null };
    stale.close().catch(() => { /* 정리 실패는 무시 */ });
  }

  if (cached.client) return cached.client;

  if (!cached.promise) {
    cached.uri = uri;
    cached.promise = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    })
      .connect()
      // 실패한 promise 를 캐시에 남기면 이후 모든 요청이 같은 오류를 영구히 되돌려준다.
      // 다음 요청에서 다시 시도할 수 있도록 비워준다.
      .catch((e) => {
        cached.promise = null;
        cached.uri = null;
        throw e;
      });
  }

  cached.client = await cached.promise;
  return cached.client;
}

export async function getDb() {
  return (await getClient()).db(getDbName());
}

export const collections = {
  mails: () => getDb().then((db) => db.collection('mails')),
  syncState: () => getDb().then((db) => db.collection('sync_state')),
  settings: () => getDb().then((db) => db.collection('settings')),
};

/** 인덱스는 최초 쓰기 시 1회만 생성 (import 시점 아님) */
let indexesReady = false;
export async function ensureIndexes() {
  if (indexesReady) return;
  const mails = await collections.mails();
  await Promise.all([
    mails.createIndex({ messageId: 1 }, { unique: true, sparse: true }),
    mails.createIndex({ receivedAt: -1 }),
    mails.createIndex({ status: 1, receivedAt: -1 }),
    mails.createIndex({ classification: 1, receivedAt: -1 }),
    mails.createIndex({ 'analysis.needsReply': 1, 'analysis.deadline': 1 }),
    mails.createIndex({ 'analysis.deadline': 1 }),
    mails.createIndex({ 'from.address': 1 }),
    // 거래처 그룹 — 목록 필터와 발신자→그룹 학습 양쪽에서 쓴다
    mails.createIndex({ group: 1, receivedAt: -1 }),
    mails.createIndex({ folder: 1 }),
    mails.createIndex({ threadKey: 1, date: -1 }),
    // 계정별 화면·집계 (계정을 여러 개 등록한 설치에서 쓴다)
    mails.createIndex({ accountId: 1, date: -1 }),
  ]);

  // 수집 기준점은 계정+폴더 단위다. 예전에는 폴더만으로 유일했는데,
  // 계정이 둘 이상이면 같은 'INBOX' 가 서로 다른 메일함을 가리키므로
  // 그 인덱스를 그대로 두면 두 번째 계정의 기준점을 저장할 수 없다.
  const sync = await collections.syncState();
  try {
    const existing = await sync.indexes();
    const legacy = existing.find(
      (ix) => ix.unique && JSON.stringify(ix.key) === JSON.stringify({ folder: 1 }),
    );
    if (legacy) await sync.dropIndex(legacy.name);
  } catch { /* 인덱스가 없거나 이미 정리된 경우 — 아래에서 만들면 된다 */ }
  await sync.createIndex({ accountId: 1, folder: 1 }, { unique: true });
  indexesReady = true;
}

/** DB 연결 여부를 조용히 확인 — 대시보드가 크래시 대신 안내 카드를 띄우도록 */
export async function pingDb() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { connected: true };
  } catch (e) {
    return { connected: false, error: String(e?.message || e) };
  }
}
