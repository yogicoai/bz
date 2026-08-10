/**
 * POST /api/analyze-batch  { limit }
 * AI 분석 대기 중인 메일을 지정 통수만큼 분석한다(유료). 화면에서 예상 비용을 확인한 뒤 호출한다.
 */
import { NextResponse } from 'next/server';
import { runPendingAnalysis } from '@/lib/mail/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    let body = {};
    try { body = await req.json(); } catch { /* 기본값 사용 */ }
    // 한 번에 너무 많이 돌면 타임아웃·비용이 모두 커진다
    const limit = Math.min(Number(body.limit) || 5, 20);
    const stats = await runPendingAnalysis(limit);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
