/**
 * POST /api/auth/password  { current, next }
 * 설정 화면에서 접근 비밀번호를 변경한다. 현재 비밀번호 확인이 필요하다.
 */
import { NextResponse } from 'next/server';
import { changePassword } from '@/lib/password';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { current, next } = await req.json();
    await changePassword(current, next);
    return NextResponse.json({ ok: true, message: '비밀번호를 변경했습니다. 다른 기기의 로그인은 유지됩니다.' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
