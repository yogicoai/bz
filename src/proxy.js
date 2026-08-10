import { NextResponse } from 'next/server';
import { COOKIE_NAME, authEnabled, verifyToken } from '@/lib/auth';

/**
 * 접근 게이트 (Next 16 부터 middleware → proxy 로 규약 변경).
 * /login 과 크론 엔드포인트는 통과시키고 나머지는 서명 쿠키를 검증한다.
 * 비밀번호 자체의 검증은 DB 를 읽어야 하므로 여기가 아니라 /api/login 에서 한다.
 */
export function proxy(req) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/cron/') // 크론은 CRON_SECRET 으로 별도 검증
  ) {
    return NextResponse.next();
  }

  return verifyToken(req.cookies.get(COOKIE_NAME)?.value).then((ok) => {
    if (ok) return NextResponse.next();

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  });
}

export const config = {
  // 정적 자산은 인증 대상에서 제외한다.
  // (로고·파비콘은 로그인 화면에서도 로드되어야 하므로 확장자 기준으로 함께 뺀다)
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf)$).*)',
  ],
};
