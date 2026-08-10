/**
 * POST /api/ingest
 * body: { limit?, analyze?, recent? }
 *   recent 를 주면 lastUid 를 무시하고 최근 N통을 가져온다(최초 세팅·테스트용).
 */
import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/mail/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    let body = {};
    try { body = await req.json(); } catch { /* 본문 없이 호출 가능 */ }
    const stats = await runIngest(body);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
