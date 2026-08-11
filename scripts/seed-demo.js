/**
 * 데모용 샘플 제안 메일 넣기/지우기 — IMAP 연결 전에 화면 동작을 확인하는 용도.
 *
 *   node scripts/seed-demo.js          샘플 5통 추가
 *   node scripts/seed-demo.js --clean  샘플만 삭제 (실제 수집 메일은 건드리지 않음)
 *
 * 모든 샘플에는 _demo:true 가 붙어 있어 --clean 으로 정확히 그것만 지운다.
 */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

// .env.local 직접 파싱 (Next 없이 단독 실행하므로)
function env(key) {
  // 셸에서 준 값이 파일보다 우선한다. 인스턴스가 둘(대표님·이사님)이 되면서
  // 같은 스크립트를 다른 DB 로 돌릴 일이 생겼다:
  //   MONGODB_DB=emaildata_jay node scripts/export-pending.js 50 --days 30
  if (process.env[key]) return String(process.env[key]).trim();
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const uri = env('EMAILDATA_URI') || env('MONGODB_URI');
const dbName = env('MONGODB_DB') || 'emaildata';

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);

const SAMPLES = [
  {
    messageId: '<demo-1@example.com>',
    subject: 'Distribution partnership inquiry - Yogibo products for Vietnam market',
    from: { name: 'Minh Tran', address: 'minh.tran@hanoifurniture.com.vn' },
    lang: 'en',
    classification: 'b2b',
    date: hoursAgo(3),
    text: `Dear Yogibo team,

My name is Minh Tran, purchasing director at Hanoi Furniture Trading Co.
We operate 12 retail showrooms across Vietnam and are interested in becoming
an official distributor for the Yogibo Max and Yogibo Pod lines.

Could you please send us the following:
1. FOB price list for the Max and Pod series
2. Minimum order quantity (MOQ) per SKU
3. Lead time for a container order

We are preparing our 2027 buying plan and need your quotation by August 20, 2026
to include Yogibo in the proposal to our board.

Best regards,
Minh Tran
Purchasing Director, Hanoi Furniture Trading Co.`,
  },
  {
    messageId: '<demo-2@example.com>',
    subject: '요기보 소파 대량 납품 견적 요청 (호텔 리뉴얼)',
    from: { name: '김상현', address: 'sh.kim@staygroup.co.kr' },
    lang: 'ko',
    classification: 'inquiry',
    date: hoursAgo(7),
    text: `안녕하세요. 스테이그룹 구매팀 김상현입니다.

저희가 운영하는 부산 소재 호텔 3개소 라운지 리뉴얼을 진행 중이며,
요기보 제품 도입을 검토하고 있습니다.

- 예상 수량: 소파 60개, 빈백 40개
- 납품 희망 시기: 10월 중순
- 설치 장소: 부산 3개소

단가와 납기 확인 부탁드리며, 대량 구매 할인 정책이 있다면 함께 안내 부탁드립니다.
내부 품의 일정상 8월 14일까지 회신 부탁드립니다.

감사합니다.`,
  },
  {
    messageId: '<demo-3@example.com>',
    subject: 'Collaboration proposal: Yogibo x Nordic Living pop-up store',
    from: { name: 'Erik Larsson', address: 'erik@nordicliving.se' },
    lang: 'en',
    classification: 'partner',
    date: hoursAgo(20),
    text: `Hello,

I'm Erik from Nordic Living, a lifestyle retail group in Stockholm.

We would like to propose a joint pop-up store concept featuring Yogibo products
in our flagship location during the winter season. We handled a similar
collaboration with a Japanese brand last year with strong results.

We are flexible on the commercial structure and happy to discuss.
Would you be available for a video call in the coming weeks?

Best,
Erik Larsson`,
  },
  {
    messageId: '<demo-4@example.com>',
    subject: 'Re: Sample shipment - tracking information',
    from: { name: 'Logistics Team', address: 'logistics@globalship.com' },
    lang: 'en',
    classification: 'unknown',
    date: hoursAgo(26),
    text: `Your sample shipment has been dispatched on August 9, 2026.
Tracking number: GS-8837-2211. Estimated delivery in 5 working days.

No action is required from your side.`,
  },
  {
    messageId: '<demo-5@example.com>',
    subject: '(광고) 귀사의 매출을 2배로! SEO 마케팅 무료 진단',
    from: { name: 'GrowthMax', address: 'noreply@growthmax-marketing.com' },
    lang: 'ko',
    classification: 'ad',
    date: hoursAgo(30),
    listUnsub: '<mailto:unsub@growthmax-marketing.com>',
    text: `안녕하세요, 그로스맥스입니다.
지금 신청하시면 SEO 무료 진단을 받아보실 수 있습니다.
수신거부는 하단 링크를 클릭해 주세요.`,
  },
];

(async () => {
  if (!uri) {
    console.error('EMAILDATA_URI 또는 MONGODB_URI 가 .env.local 에 없습니다.');
    process.exit(1);
  }

  const client = await new MongoClient(uri).connect();
  const mails = client.db(dbName).collection('mails');

  if (process.argv.includes('--clean')) {
    const r = await mails.deleteMany({ _demo: true });
    console.log(`샘플 ${r.deletedCount}건 삭제 완료 (실제 수집 메일은 유지)`);
    await client.close();
    return;
  }

  // localAnalyze 는 ESM 이라 동적 import
  const { localAnalyze } = await import('../src/lib/mail/localAnalyze.js');

  let inserted = 0;
  for (const s of SAMPLES) {
    const doc = {
      _demo: true,
      messageId: s.messageId,
      uid: 0,
      folder: 'DEMO',
      subject: s.subject,
      from: s.from,
      fromAll: [s.from],
      to: [{ name: '', address: 'david@yogico.kr' }],
      cc: [],
      date: s.date,
      receivedAt: s.date,
      raw: { text: s.text, html: '' },
      headers: {
        listUnsubscribe: s.listUnsub || '',
        precedence: '', autoSubmitted: '', inReplyTo: '', references: [],
      },
      attachments: [],
      lang: s.lang,
      classification: s.classification,
      classifiedBy: s.classification === 'ad' ? 'rule' : null,
      status: 'new',
      memo: '', tags: [], translation: null, drafts: [],
      createdAt: new Date(),
    };
    doc.analysis = localAnalyze(doc);

    const r = await mails.updateOne(
      { messageId: doc.messageId },
      { $setOnInsert: doc },
      { upsert: true },
    );
    if (r.upsertedCount) inserted++;
  }

  console.log(`샘플 ${inserted}건 추가 (이미 있으면 건너뜀)`);
  console.log('브리핑 확인: http://localhost:5900/briefing');
  console.log('삭제하려면: node scripts/seed-demo.js --clean');
  await client.close();
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
