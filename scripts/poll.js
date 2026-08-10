/**
 * 상시 실행 수집 루프 — 로컬 PC 나 상시 서버(클라우드타입 등)용.
 * Vercel 처럼 서버리스에 배포한 경우에는 이 대신 vercel.json 의 cron 이 /api/cron/ingest 를 호출한다.
 *
 *   npm run poll
 *
 * dev 서버가 떠 있어야 한다(내부적으로 /api/cron/ingest 를 호출).
 */
const BASE = process.env.APP_BASE_URL || 'http://localhost:5900';
const SECRET = process.env.CRON_SECRET || '';
const INTERVAL_MIN = Number(process.env.POLL_INTERVAL_MIN) || 10;

const ts = () => new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/cron/ingest`, {
      headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`[${ts()}] 실패: ${json.error}`);
      return;
    }
    const s = json.stats;
    console.log(
      `[${ts()}] 조회 ${s.fetched} · 신규 ${s.inserted} · 중복 ${s.duplicate} · ` +
      `광고필터 ${s.ruleFiltered} · 로컬분석 ${s.localAnalyzed}` +
      (s.analyzed ? ` · AI ${s.analyzed}` : '') +
      (s.errors?.length ? ` · 오류 ${s.errors.length}` : ''),
    );
  } catch (e) {
    console.error(`[${ts()}] 호출 실패: ${e.message} (dev 서버가 켜져 있는지 확인하세요)`);
  }
}

if (!SECRET) {
  console.error('CRON_SECRET 이 설정되지 않았습니다. .env.local 에 추가하세요.');
  process.exit(1);
}

console.log(`수집 루프 시작 — ${BASE} · ${INTERVAL_MIN}분 간격 (Ctrl+C 로 종료)`);
tick();
setInterval(tick, INTERVAL_MIN * 60 * 1000);
