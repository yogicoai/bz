/**
 * GET /api/groups — 현재 존재하는 거래처 그룹 + 학습된 발신자 수
 * 화면 필터와 설정에서 쓴다.
 */
import { NextResponse } from 'next/server';
import { listGroups, learnSenderGroups } from '@/lib/mail/groups';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [g, learned] = await Promise.all([
      listGroups(),
      learnSenderGroups().catch(() => ({ size: 0 })),
    ]);
    return NextResponse.json({
      ok: true,
      groups: g.groups,          // 전체 합산 (계정이 하나인 설치)
      byAccount: g.byAccount,    // 계정별 (사이드바에서 계정 아래에 접어 넣는다)
      learnedSenders: learned.size || 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
