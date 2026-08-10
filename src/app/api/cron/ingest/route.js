/**
 * GET /api/cron/ingest — Vercel Cron 등 외부 스케줄러용.
 * 미들웨어의 비밀번호 게이트를 우회하므로 CRON_SECRET 으로 직접 검증한다.
 *
 * Vercel Cron 은 Authorization: Bearer $CRON_SECRET 을 자동으로 붙인다.
 * 수동 호출 시: /api/cron/ingest?key=<CRON_SECRET>
 */
import { NextResponse } from 'next/server';
import { runIngest, runPendingAnalysis } from '@/lib/mail/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 미설정이면 열어두지 않는다
  const header = req.headers.get('authorization') || '';
  if (header === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('key') === secret;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: '권한 없음' }, { status: 401 });
  }
  try {
    const sp = new URL(req.url).searchParams;
    const recent = Number(sp.get('recent')) || undefined;

    const stats = await runIngest(recent ? { recent } : {});

    // 자동 AI 분석이 켜진 경우에만, 이전 회차에서 실패한 건을 복구한다.
    // (꺼져 있으면 크론이 임의로 과금을 발생시키지 않는다)
    const { getSettings } = await import('@/lib/settings');
    const settings = await getSettings();
    const retry = settings.autoAnalyze ? await runPendingAnalysis(5) : null;

    return NextResponse.json({ ok: true, stats, retry });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
