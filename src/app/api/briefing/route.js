/**
 * GET /api/briefing?date=YYYY-MM-DD&days=1&includeDone=false
 * 하루치 제안 메일 브리핑(투두리스트).
 */
import { NextResponse } from 'next/server';
import { getBriefing } from '@/lib/briefing';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const b = await getBriefing({
      date: sp.get('date') || undefined,
      days: Math.min(Number(sp.get('days')) || 1, 31),
      includeDone: sp.get('includeDone') === 'true',
    });
    if (!b.connected) return NextResponse.json({ ok: false, error: b.error }, { status: 500 });

    // 사이드바 배지처럼 숫자만 필요한 곳은 본문을 통째로 받지 않도록
    if (sp.get('countOnly') === 'true') {
      const { items, ...rest } = b;
      return NextResponse.json({ ok: true, ...rest });
    }
    return NextResponse.json({ ok: true, ...b });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
