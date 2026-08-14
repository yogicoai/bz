/**
 * GET /api/accounts — 등록된 메일 계정과 각 계정의 수집 현황
 *
 * 계정을 하나도 등록하지 않은 설치에서는 빈 목록을 돌려준다.
 * 화면은 그때 계정 메뉴 자체를 띄우지 않아, 기존과 같은 모습이 유지된다.
 */
import { NextResponse } from 'next/server';
import { getSettings, accountsOf } from '@/lib/settings';
import { collections } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FRESH_DAYS = 30;

export async function GET() {
  try {
    const settings = await getSettings();
    const configured = settings.imapAccounts || [];

    // 등록된 계정이 없으면(대표님처럼 단일 계정) 계정 축을 쓰지 않는다
    if (!configured.length) {
      return NextResponse.json({ ok: true, accounts: [], multi: false });
    }

    const mails = await collections.mails();
    const since = new Date(Date.now() - FRESH_DAYS * 86400000);

    const rows = await mails.aggregate([
      { $group: {
        _id: { $ifNull: ['$accountId', 'main'] },
        total: { $sum: 1 },
        recent: { $sum: { $cond: [{ $gte: ['$date', since] }, 1, 0] } },
        fresh: { $sum: { $cond: [{ $and: [
          { $eq: ['$status', 'new'] },
          { $ne: ['$direction', 'out'] },
          { $gte: ['$date', since] },
          { $not: [{ $in: ['$classification', ['ad', 'system']] }] },
        ] }, 1, 0] } },
        last: { $max: '$date' },
      } },
    ]).toArray();

    const byId = new Map(rows.map((r) => [r._id, r]));

    const accounts = accountsOf(settings).map((a) => {
      const r = byId.get(a.id) || {};
      return {
        id: a.id,
        label: a.label,
        user: a.user,
        host: a.host,
        folders: a.folders || [],
        enabled: a.enabled !== false,
        total: r.total || 0,
        recent: r.recent || 0,
        fresh: r.fresh || 0,
        last: r.last || null,
      };
    });

    return NextResponse.json({ ok: true, accounts, multi: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
