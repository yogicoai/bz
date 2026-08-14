/**
 * GET /api/accounts — 등록된 메일 계정과 각 계정의 수집 현황
 *
 * 계정을 하나도 등록하지 않은 설치에서는 빈 목록을 돌려준다.
 * 화면은 그때 계정 메뉴 자체를 띄우지 않아, 기존과 같은 모습이 유지된다.
 */
import { NextResponse } from 'next/server';
import { getSettings, accountsOf, saveSettings } from '@/lib/settings';
import { collections } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** 이 계정으로 들어온 메일을 고르는 조건 — 계정 개념이 생기기 전 메일은 'main' 것이다 */
const ownedBy = (id) => (id === 'main' ? { accountId: { $in: ['main', null] } } : { accountId: id });

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

    // **지금 수집 대상인 폴더만** 본다. 정리된 폴더의 옛 오류까지 세면
    // 계정이 멀쩡해도 영원히 '연결 실패' 로 남는다.
    const watching = new Map(
      accountsOf(settings).map((a) => [a.id, new Set(a.folders || [])]),
    );

    const health = new Map();
    for (const s of states) {
      const id = s.accountId || 'main';
      const folders = watching.get(id);
      if (folders && folders.size && !folders.has(s.folder)) continue;

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

    return NextResponse.json({
      ok: true,
      accounts,
      // 사용자가 계정을 실제로 등록했는지
      multi: configured.length > 0,
      // 이 설치가 '여러 메일함' 방식인지 (MULTI_ACCOUNT=1).
      // 지금 계정이 하나뿐이어도 이 쪽 화면은 계정→폴더 2단으로 둔다 —
      // Gmail·네이버를 더할 예정이라 그때 화면이 바뀌면 오히려 혼란스럽다.
      multiAccountUi: process.env.MULTI_ACCOUNT === '1',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

/**
 * DELETE /api/accounts — 계정을 빼고 **그 계정으로 가져온 메일까지 함께 지운다**.
 *
 * 목록에서만 빼고 메일을 남기면, 더 이상 존재하지 않는 메일함의 메일이
 * 브리핑·기한·검색에 계속 섞여 나온다. 지운 계정의 흔적을 화면에서 치울
 * 방법도 없다. 시험 삼아 붙였다 떼는 경우가 실제 사용 방식이므로,
 * 뗄 때는 그 계정에서 온 것이 통째로 사라지는 편이 예상에 맞는다.
 *
 * 되돌릴 수 없으므로 화면에서 통수를 보여 주고 확인을 한 번 받는다.
 * 원본 메일은 각자의 메일함에 그대로 있다 — 지워지는 것은 이 도구가
 * 가져와 둔 사본이다.
 */
export async function DELETE(req) {
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ ok: false, error: '계정 id 가 필요합니다.' }, { status: 400 });

    const settings = await getSettings();
    const list = settings.imapAccounts || [];
    const target = list.find((a) => a.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: '그런 계정이 없습니다.' }, { status: 404 });
    }
    // 메일함이 하나도 없으면 수집이 멈춘다. 마지막 하나는 빼지 못하게 한다.
    if (list.length <= 1) {
      return NextResponse.json({
        ok: false,
        error: '메일 계정은 최소 하나가 있어야 합니다. 잠시 멈추려면 [수집함] 체크를 끄세요.',
      }, { status: 400 });
    }

    const mails = await collections.mails();
    const sync = await collections.syncState();
    const del = await mails.deleteMany(ownedBy(id));
    const delSync = await sync.deleteMany({ accountId: id });

    await saveSettings({ imapAccounts: list.filter((a) => a.id !== id) });

    return NextResponse.json({
      ok: true,
      label: target.label || target.user,
      deletedMails: del.deletedCount || 0,
      deletedStates: delSync.deletedCount || 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
