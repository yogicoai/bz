/**
 * GET  /api/settings  → 현재 설정 (비밀번호는 설정 여부만)
 * POST /api/settings  → 화이트리스트 필드만 저장, 빈 비밀번호는 무시
 */
import { NextResponse } from 'next/server';
import { getPublicSettings, saveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, settings: await getPublicSettings() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const settings = await saveSettings(body);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
