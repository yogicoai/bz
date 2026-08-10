/**
 * 이미 수집된 메일의 언어 감지와 로컬 1차 분석을 다시 돌린다.
 *
 *   node scripts/reanalyze-local.js          전체
 *   node scripts/reanalyze-local.js --dry    바뀌는 것만 미리 보기
 *
 * 인용부 제거 규칙(quoted.js)이 생기기 전에 수집된 메일은
 * 인용된 이전 대화의 영문 헤더 때문에 한국어 메일이 영어로 잡히고,
 * 인용문의 물음표·옛 날짜까지 세어 답변필요·기한이 과대 판정되어 있다.
 *
 * API 호출이 없으므로 과금되지 않는다.
 * 이미 AI 요약이 끝난 메일(analysis.method === 'ai')은 건드리지 않는다.
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

const DRY = process.argv.includes('--dry');

(async () => {
  const { stripQuoted } = await import('../src/lib/mail/quoted.js');
  const { detectLang } = await import('../src/lib/mail/parse.js');
  const { localAnalyze } = await import('../src/lib/mail/localAnalyze.js');
  const { threadKey } = await import('../src/lib/mail/thread.js');

  const uri = env('EMAILDATA_URI') || env('MONGODB_URI');
  const client = await new MongoClient(uri).connect();
  const mails = client.db(env('MONGODB_DB') || 'emaildata').collection('mails');

  // 스레드 키는 AI 요약 여부와 무관하게 전부 채워야 한다 (묶기 기준이므로)
  const threadOnly = { 'analysis.method': 'ai' };
  let threadFixed = 0;
  for await (const doc of mails.find(threadOnly).project({ subject: 1, group: 1, from: 1, messageId: 1, threadKey: 1 })) {
    const k = threadKey(doc);
    if (doc.threadKey === k) continue;
    if (!DRY) await mails.updateOne({ _id: doc._id }, { $set: { threadKey: k } });
    threadFixed++;
  }

  // AI 요약이 끝난 것은 그 분석 결과가 더 정확하므로 재분석하지 않는다
  const query = { 'analysis.method': { $ne: 'ai' } };
  const total = await mails.countDocuments(query);
  const cursor = mails.find(query).project({
    subject: 1, 'raw.text': 1, lang: 1, date: 1, receivedAt: 1,
    classification: 1, headers: 1, analysis: 1, from: 1, group: 1, threadKey: 1, messageId: 1,
  });

  const stat = { total, scanned: 0, langChanged: 0, replyChanged: 0, deadlineChanged: 0, updated: 0 };
  const samples = [];

  for await (const doc of cursor) {
    stat.scanned++;
    const text = doc.raw?.text || '';

    const newLang = detectLang(`${doc.subject || ''}\n${stripQuoted(text)}`);
    const fresh = localAnalyze(doc);
    const newThread = threadKey(doc);
    const threadChanged = doc.threadKey !== newThread;

    const langChanged = newLang !== doc.lang;
    const replyChanged = Boolean(fresh.needsReply) !== Boolean(doc.analysis?.needsReply);
    const oldDl = doc.analysis?.deadline ? new Date(doc.analysis.deadline).toISOString().slice(0, 10) : null;
    const newDl = fresh.deadline ? fresh.deadline.toISOString().slice(0, 10) : null;
    const deadlineChanged = oldDl !== newDl;

    if (!langChanged && !replyChanged && !deadlineChanged && !threadChanged) continue;
    if (langChanged) stat.langChanged++;
    if (replyChanged) stat.replyChanged++;
    if (deadlineChanged) stat.deadlineChanged++;

    if (samples.length < 10) {
      samples.push({
        subject: (doc.subject || '').slice(0, 44),
        lang: langChanged ? `${doc.lang}→${newLang}` : '',
        reply: replyChanged ? `${doc.analysis?.needsReply}→${fresh.needsReply}` : '',
        dl: deadlineChanged ? `${oldDl || '없음'}→${newDl || '없음'}` : '',
      });
    }

    if (!DRY) {
      await mails.updateOne(
        { _id: doc._id },
        { $set: { lang: newLang, analysis: fresh, threadKey: newThread, updatedAt: new Date() } },
      );
      stat.updated++;
    }
  }

  console.log(`대상 ${stat.total.toLocaleString()}통 검사`);
  console.log(`  언어 정정   ${stat.langChanged}건`);
  console.log(`  답변필요 변경 ${stat.replyChanged}건`);
  console.log(`  기한 변경   ${stat.deadlineChanged}건`);
  console.log(`  스레드키 채움 ${threadFixed}건 (요약 완료분)`);
  console.log(DRY ? '  (미리보기 — 저장하지 않음)' : `  반영 ${stat.updated}건`);
  if (samples.length) {
    console.log('');
    samples.forEach((s) => {
      const parts = [s.lang && `언어 ${s.lang}`, s.reply && `답변 ${s.reply}`, s.dl && `기한 ${s.dl}`]
        .filter(Boolean).join(' · ');
      console.log(`  ${s.subject.padEnd(46)} ${parts}`);
    });
  }

  await client.close();
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
