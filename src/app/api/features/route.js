/**
 * GET /api/features — 이 설치에서 켜져 있는 기능
 *
 * 코드는 대표님·이사님이 함께 쓰지만, 쓰는 방식이 달라 일부 기능은
 * 필요한 쪽에서만 켠다. Vercel 환경변수로 정한다.
 *
 *   MULTI_ACCOUNT=1  여러 메일함(Gmail·네이버) 등록 + 사이드바 계정→폴더 2단
 *   MAIL_TRASH=1     메일을 메일함 휴지통으로 보내기
 *                    (안 주면 MULTI_ACCOUNT 를 따른다 — 변수 하나로 충분하도록)
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function featureFlags() {
  const multiAccount = process.env.MULTI_ACCOUNT === '1';
  return {
    multiAccount,
    trash: process.env.MAIL_TRASH === '1'
      || (process.env.MAIL_TRASH === undefined && multiAccount),
  };
}

export async function GET() {
  return NextResponse.json({ ok: true, features: featureFlags() });
}
