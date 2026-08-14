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

    // 계정을 따로 등록하지 않았어도 '지금 쓰는 메일함' 하나는 항상 돌려준다.
    // 화면은 계정 → 폴더 한 가지 구조만 그리면 되고, 나중에 Gmail·네이버를
    // 더해도 모양이 바뀌지 않는다.
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

    // 마지막 수집이 성공했는지. 비밀번호가 틀리면 화면 어디에도 표시가 없어
    // 메일이 안 들어오는 것을 한참 뒤에야 알게 된다 — 이 도구에서 가장 나쁜 실패다.
    const sync = await collections.syncState();
    const states = await sync.find({}).toArray();
    const health = new Map();
    for (const s of states) {
      const id = s.accountId || 'main';
      const cur = health.get(id) || { lastSyncAt: null, lastError: null, failed: 0, ok: 0 };
      if (s.lastError) { cur.failed++; cur.lastError = s.lastError; } else { cur.ok++; }
      if (s.lastSyncAt && (!cur.lastSyncAt || s.lastSyncAt > cur.lastSyncAt)) cur.lastSyncAt = s.lastSyncAt;
      health.set(id, cur);
    }

    const accounts = accountsOf(settings).map((a) => {
      const r = byId.get(a.id) || {};
      const h = health.get(a.id) || {};
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
        // 연결 상태 — 'ok' | 'fail' | 'unknown'(아직 한 번도 수집한 적 없음)
        health: h.lastSyncAt || h.lastError
          ? (h.failed ? 'fail' : 'ok')
          : 'unknown',
        lastSyncAt: h.lastSyncAt || null,
        lastError: h.lastError || null,
        // 비밀번호가 아예 없으면 수집이 시작조차 되지 않는다
        passSet: Boolean(a.pass),
      };
    });

    // multi = 사용자가 계정을 실제로 등록했는지 (설명 문구 등에서 쓴다)
    return NextResponse.json({ ok: true, accounts, multi: configured.length > 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
