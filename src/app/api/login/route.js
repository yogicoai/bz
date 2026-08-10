/**
 * GET    /api/login  → { needsSetup } 초기 비밀번호 설정이 필요한지
 * POST   /api/login  { password }            → 로그인
 * POST   /api/login  { password, setup:true } → 최초 비밀번호 설정 후 로그인
 * DELETE /api/login  → 로그아웃
 */
import { NextResponse } from 'next/server';
import { COOKIE_NAME, cookieOptions, issueToken } from '@/lib/auth';
import { checkPassword, needsSetup, setupPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, needsSetup: await needsSetup() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { password, setup } = await req.json();

    if (setup) {
      await setupPassword(password);
    } else if (!(await checkPassword(password))) {
      return NextResponse.json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, await issueToken(), cookieOptions());
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 });
  return res;
}
