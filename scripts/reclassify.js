/**
 * 이미 수집된 메일에 **무료 규칙 필터를 다시 적용**한다.
 *
 *   node scripts/reclassify.js --dry                     바뀌는 것만 미리 보기
 *   node scripts/reclassify.js                           적용
 *   MONGODB_DB=emaildata_jay node scripts/reclassify.js  다른 인스턴스에 적용
 *
 * 차단 도메인·키워드·사내 자동발송 주소(systemSenders)를 설정에서 바꾸거나
 * classify.js 의 규칙을 보강했을 때, 이미 들어와 있는 메일에 소급 적용하는 용도다.
 *
 * API 호출이 없으므로 과금되지 않는다.
 *
 * 건드리지 않는 것:
 *   - classifiedBy: 'manual'  사람이 직접 지정한 분류는 규칙이 덮지 않는다
 *   - AI 요약이 끝난 메일의 analysis  (분류 라벨만 갱신한다)
 */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

function env(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const DRY = process.argv.includes('--dry');

(async () => {
  const { ruleClassify } = await import('../src/lib/mail/classify.js');

  const client = await new MongoClient(env('EMAILDATA_URI') || env('MONGODB_URI')).connect();
  const dbName = env('MONGODB_DB') || 'emaildata';
  const db = client.db(dbName);
  const mails = db.collection('mails');
  const settings = (await db.collection('settings').findOne({ _id: 'main' })) || {};

  console.log(`DB: ${dbName}${DRY ? '   [미리보기]' : ''}`);
  console.log(`  차단 도메인 ${(settings.blockedDomains || []).length}개 · `
    + `차단 키워드 ${(settings.blockedKeywords || []).length}개 · `
    + `사내 자동발송 주소 ${(settings.systemSenders || []).length}개`);
  console.log('');

  const cur = mails.find(
    { classifiedBy: { $ne: 'manual' } },
    { projection: { subject: 1, from: 1, to: 1, headers: 1, classification: 1, 'raw.text': 1 } },
  );

  const moved = new Map(); // '이전→이후' → 건수
  const samples = [];
  let scanned = 0;
  let changed = 0;

  for await (const m of cur) {
    scanned++;
    const r = ruleClassify(m, settings);
    // 규칙으로 판정 못 하면 그대로 둔다 (AI 판단 영역)
    const next = r?.classification;
    if (!next || next === m.classification) continue;

    const key = `${m.classification || 'unknown'} → ${next}`;
    moved.set(key, (moved.get(key) || 0) + 1);
    if (samples.length < 12) {
      samples.push(`  ${key.padEnd(22)} ${String(m.subject || '').replace(/\s+/g, ' ').slice(0, 46)}`
        + `   [${r.reason}]`.slice(0, 46));
    }

    if (!DRY) {
      await mails.updateOne({ _id: m._id }, {
        $set: { classification: next, classifiedBy: 'rule', classifyReason: r.reason },
      });
    }
    changed++;
  }

  console.log(`훑은 메일 ${scanned.toLocaleString()}통 · 분류가 바뀐 것 ${changed.toLocaleString()}통`);
  if (moved.size) {
    console.log('');
    [...moved].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('   ' + k.padEnd(24) + n + '통'));
  }
  if (samples.length) {
    console.log('');
    console.log('예시:');
    samples.forEach((s) => console.log(s));
  }
  if (DRY) console.log('\n미리보기였습니다. 적용하려면 --dry 없이 다시 실행하세요.');

  await client.close();
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
