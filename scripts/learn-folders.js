/**
 * 거래처 폴더를 깊게 수집해 "발신자 → 거래처" 학습 데이터를 쌓는다.
 *
 *   node scripts/learn-folders.js            각 폴더 250통
 *   node scripts/learn-folders.js 500        각 폴더 500통
 *   node scripts/learn-folders.js 250 --dry  수집 없이 대상 폴더만 확인
 *
 * 폴더를 한 번에 하나씩 요청해 서버 타임아웃을 피한다.
 * 이미 있는 메일은 messageId 로 걸러지므로 몇 번 돌려도 중복되지 않는다.
 * dev 서버가 떠 있어야 한다.
 */
const BASE = process.env.APP_BASE_URL || 'http://localhost:5900';
const PER_FOLDER = Number(process.argv[2]) || 250;
const DRY = process.argv.includes('--dry');

const fs = require('node:fs');
const path = require('node:path');

function env(key) {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const pad = (s, n) => String(s).padEnd(n);
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

(async () => {
  const password = env('APP_PASSWORD');
  const jar = [];

  // 로그인해서 세션 쿠키 확보
  if (password) {
    const r = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const setCookie = r.headers.getSetCookie?.() || [];
    setCookie.forEach((c) => jar.push(c.split(';')[0]));
    if (!r.ok) {
      console.error('로그인 실패 — .env.local 의 APP_PASSWORD 를 확인하세요.');
      process.exit(1);
    }
  }
  const headers = { 'Content-Type': 'application/json', cookie: jar.join('; ') };

  // 서버의 폴더 목록에서 거래처 폴더만 추린다
  const test = await fetch(`${BASE}/api/test/imap`, { method: 'POST', headers, body: '{}' })
    .then((r) => r.json());
  if (!test.ok) {
    console.error('IMAP 연결 실패:', test.error);
    process.exit(1);
  }

  const SYSTEM = /^(INBOX|Sent|Drafts|Junk|Trash)$/i;
  const folders = test.folders.filter((f) => !SYSTEM.test(f));

  console.log(`거래처 폴더 ${folders.length}개 · 폴더당 최대 ${PER_FOLDER}통`);
  console.log('─'.repeat(64));

  if (DRY) {
    folders.forEach((f) => console.log('  ' + f));
    return;
  }

  const t0 = Date.now();
  let total = 0;
  let inserted = 0;

  for (const folder of folders) {
    const started = Date.now();
    process.stdout.write(`  ${pad(folder.replace(/^INBOX[./]/, ''), 28)}`);
    try {
      const r = await fetch(`${BASE}/api/ingest`, {
        method: 'POST',
        headers,
        // 한글 폴더명이 깨지지 않도록 UTF-8 바이트로 직접 만든다
        body: Buffer.from(
          JSON.stringify({ recent: PER_FOLDER, analyze: false, folders: [folder] }),
          'utf8',
        ),
      }).then((x) => x.json());

      if (!r.ok) {
        console.log(`✗ ${String(r.error).slice(0, 40)}`);
        continue;
      }
      const s = r.stats;
      total += s.fetched;
      inserted += s.inserted;
      console.log(`조회 ${pad(s.fetched, 5)} 신규 ${pad(s.inserted, 5)} ${secs(Date.now() - started)}`);
    } catch (e) {
      console.log(`✗ ${String(e.message).slice(0, 40)}`);
    }
  }

  console.log('─'.repeat(64));
  console.log(`  합계 조회 ${total}통 · 신규 ${inserted}통 · ${secs(Date.now() - t0)}`);

  // 학습이 늘었으니 미분류 메일을 다시 분류한다
  console.log('\n미분류 메일 재분류 중…');
  const re = await fetch(`${BASE}/api/groups/reassign`, {
    method: 'POST', headers, body: JSON.stringify({ limit: 5000 }),
  }).then((x) => x.json());

  if (re.ok) {
    console.log(`  학습된 발신자 ${re.learnedSenders}명 · 거래처 ${re.knownGroups}개`);
    console.log(`  ${re.scanned}통 중 ${re.matched}통 분류 (발신자 ${re.bySender} · 제목 ${re.byName})`);
  } else {
    console.log('  재분류 실패:', re.error);
  }
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
