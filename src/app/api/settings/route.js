/**
 * GET  /api/settings  → 현재 설정 (비밀번호는 설정 여부만)
 * POST /api/settings  → 화이트리스트 필드만 저장, 빈 비밀번호는 무시
 */
import { NextResponse } from 'next/server';
import { getPublicSettings, saveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      settings: await getPublicSettings(),
      // 여러 메일함(Gmail·네이버)을 함께 쓰는 기능은 필요한 설치에서만 켠다.
      // 코드는 하나이므로, 쓰지 않는 쪽에서는 '계정 추가' 버튼이 아예 보이지
      // 않게 해서 실수로 수집 대상이 바뀌는 일을 막는다.
      //   Vercel 환경변수에 MULTI_ACCOUNT=1 을 넣은 프로젝트에서만 켜진다.
      features: { multiAccount: process.env.MULTI_ACCOUNT === '1' },
    });
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
