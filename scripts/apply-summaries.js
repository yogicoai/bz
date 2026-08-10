/**
 * 외부에서 작성한 요약 결과를 DB 에 반영한다.
 *
 *   node scripts/apply-summaries.js _summaries.json
 *
 * API 키 없이 Claude Code 세션에서 직접 요약한 결과를 넣을 때 쓴다.
 * 앱이 API 로 분석한 것과 같은 형태로 저장하므로 화면·브리핑·정리문서가 그대로 동작하고,
 * 이미 요약된 것으로 인식되어 다시 분석되지 않는다.
 *
 * 입력 JSON 은 analyze.js 의 출력 스키마와 동일한 필드를 쓴다.
 */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient, ObjectId } = require('mongodb');

function env(key) {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

/** "YYYY-MM-DD" → Date (KST 정오 고정). 빈 값이면 null */
function parseDeadline(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

(async () => {
  const file = process.argv[2] || '_summaries.json';
  if (!fs.existsSync(file)) {
    console.error(`파일을 찾을 수 없습니다: ${file}`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));

  const uri = env('EMAILDATA_URI') || env('MONGODB_URI');
  const client = await new MongoClient(uri).connect();
  const mails = client.db(env('MONGODB_DB') || 'emaildata').collection('mails');

  // 정리 문서(doc)는 여기서 만들지 않는다.
  // docgen.js 가 '@/' 별칭을 쓰기 때문에 Next 밖에서는 import 가 되지 않고,
  // 다운로드 라우트가 doc 이 없으면 요청 시점에 그때 생성하므로 결과는 같다.
  const now = new Date();
  let ok = 0;
  const fails = [];

  for (const r of rows) {
    try {
      const _id = new ObjectId(String(r.id));
      const doc = await mails.findOne({ _id });
      if (!doc) { fails.push({ id: r.id, error: '메일 없음' }); continue; }

      const translation = {
        subject: r.translationSubject,
        body: r.translationBody,
        translatedAt: now,
        // 어떤 경로로 만든 요약인지 남긴다 — 나중에 출처를 추적할 수 있어야 한다
        model: 'claude-opus-5 (Claude Code 세션 직접 분석)',
      };
      const analysis = {
        topic: r.topic,
        summary: r.summary,
        keyPoints: r.keyPoints || [],
        intent: r.intent,
        needsReply: Boolean(r.needsReply),
        replyReason: r.replyReason,
        deadline: parseDeadline(r.deadline),
        deadlineText: r.deadlineText || '',
        deadlineType: r.deadlineType === 'none' ? null : r.deadlineType,
        urgency: r.urgency,
        suggestedAction: r.suggestedAction,
        analyzedAt: now,
        method: 'ai',
        model: 'claude-opus-5 (Claude Code 세션 직접 분석)',
      };

      await mails.updateOne({ _id }, {
        $set: {
          classification: r.classification,
          // 사람이 손댄 분류는 유지 (자동 분석이 덮지 않는다는 규칙과 동일)
          classifiedBy: doc.classifiedBy === 'manual' ? 'manual' : 'ai',
          lang: r.lang,
          translation,
          analysis,
          updatedAt: now,
        },
        // 이전에 만들어 둔 정리 문서가 있으면 낡은 내용이므로 지운다(요청 시 새로 생성됨)
        $unset: { doc: '' },
      });
      ok++;
    } catch (e) {
      fails.push({ id: r.id, error: String(e.message || e) });
    }
  }

  console.log(`반영 완료: ${ok}/${rows.length}통`);
  if (fails.length) fails.forEach((f) => console.log(`  실패 ${f.id}: ${f.error}`));
  await client.close();
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
