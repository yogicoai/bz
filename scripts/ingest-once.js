/**
 * 1회 수집 — 터미널에서 바로 확인할 때.
 *
 *   npm run ingest              최근 UID 이후 새 메일
 *   npm run ingest -- --recent 10   최근 10통 강제 수집(최초 세팅용)
 *
 * dev 서버가 떠 있어야 한다.
 */
const BASE = process.env.APP_BASE_URL || 'http://localhost:5900';
const SECRET = process.env.CRON_SECRET || '';

const args = process.argv.slice(2);
const recentIdx = args.indexOf('--recent');
const recent = recentIdx >= 0 ? Number(args[recentIdx + 1]) || 10 : null;

(async () => {
  if (!SECRET) {
    console.error('CRON_SECRET 이 설정되지 않았습니다. .env.local 에 추가하세요.');
    process.exit(1);
  }
  const url = new URL(`${BASE}/api/cron/ingest`);
  url.searchParams.set('key', SECRET);
  if (recent) url.searchParams.set('recent', String(recent));

  const res = await fetch(url, { headers: { authorization: `Bearer ${SECRET}` } });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  process.exit(json.ok ? 0 : 1);
})();
