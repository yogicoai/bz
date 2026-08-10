/**
 * 요약이 필요한 메일을 골라 JSON 으로 뽑는다.
 *
 *   node scripts/export-pending.js            기본 10통
 *   node scripts/export-pending.js 20         20통
 *   node scripts/export-pending.js 10 --group "Yogibo Japan"   특정 거래처만
 *   node scripts/export-pending.js 10 --chars 5000             본문 길이 상한 조정
 *
 * 이 파일(_pending.json)을 Claude Code 에게 읽히고 요약을 받아
 * _summaries.json 으로 저장한 뒤 apply-summaries.js 로 반영한다.
 * ANTHROPIC_API_KEY 없이 쓰는 임시 운용 방식이며, 키를 넣으면 앱이 같은 일을 자동으로 한다.
 *
 * 우선순위: 미처리 > 답변필요 > 최근 순. 광고·자동발송은 애초에 제외.
 */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

function env(key) {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => /^\d+$/.test(a))) || 10;
const groupIdx = args.indexOf('--group');
const GROUP = groupIdx >= 0 ? args[groupIdx + 1] : null;
const charsIdx = args.indexOf('--chars');
const MAX_CHARS = charsIdx >= 0 ? Number(args[charsIdx + 1]) || 3500 : 3500;

(async () => {
  // 앱과 같은 인용부 제거 규칙을 쓴다 (중복 구현하면 규칙이 어긋난다)
  const { stripQuoted } = await import('../src/lib/mail/quoted.js');

  const uri = env('EMAILDATA_URI') || env('MONGODB_URI');
  if (!uri) { console.error('EMAILDATA_URI 가 .env.local 에 없습니다.'); process.exit(1); }

  const client = await new MongoClient(uri).connect();
  const mails = client.db(env('MONGODB_DB') || 'emaildata').collection('mails');

  const query = {
    $or: [{ analysis: null }, { 'analysis.method': { $ne: 'ai' } }],
    classification: { $nin: ['ad', 'system'] },
    status: { $in: ['new', 'reviewing'] },
    folder: { $ne: 'DEMO' },
  };
  if (GROUP) query.group = GROUP;

  const total = await mails.countDocuments(query);

  // 답변이 필요한 것부터, 그 다음 최신순
  const docs = await mails.find(query)
    .sort({ 'analysis.needsReply': -1, date: -1 })
    .limit(LIMIT)
    .project({ subject: 1, from: 1, to: 1, date: 1, group: 1, lang: 1, attachments: 1, 'raw.text': 1 })
    .toArray();

  const out = docs.map((d) => {
    const body = stripQuoted((d.raw?.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'));
    return {
      id: String(d._id),
      date: new Date(d.date).toISOString().slice(0, 10),
      from: `${d.from?.name || ''} <${d.from?.address || ''}>`,
      group: d.group || null,
      lang: d.lang,
      attachments: (d.attachments || []).filter((a) => !a.inline).map((a) => a.filename),
      subject: d.subject,
      body: body.slice(0, MAX_CHARS),
      truncated: body.length > MAX_CHARS,
    };
  });

  fs.writeFileSync('_pending.json', JSON.stringify(out, null, 1));

  const chars = JSON.stringify(out).length;
  console.log(`요약 대기 ${total.toLocaleString()}통 중 ${out.length}통 내보냄 → _pending.json`);
  console.log(`분량 ${chars.toLocaleString()}자 (평균 ${Math.round(chars / Math.max(out.length, 1)).toLocaleString()}자)`);
  console.log('');
  out.forEach((d, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${d.group || '미분류'}] ${d.subject.slice(0, 52)}`);
  });
  console.log('');
  console.log('다음: Claude Code 에게 _pending.json 을 읽히고 요약을 받아');
  console.log('      _summaries.json 으로 저장한 뒤  npm run apply-summaries');

  await client.close();
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
