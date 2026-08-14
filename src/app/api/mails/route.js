/**
 * GET /api/mails — 목록 조회
 * query: classification, status, lang, needsReply, from, q, since, until, limit, skip, sort
 */
import { NextResponse } from 'next/server';
import { listMails, listThreads } from '@/lib/mail/store';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const params = {};
    for (const k of ['classification', 'status', 'lang', 'needsReply', 'from', 'q', 'group', 'since', 'until', 'sort', 'accountId']) {
      const v = sp.get(k);
      if (v) params[k] = v;
    }
    params.limit = Math.min(Number(sp.get('limit')) || 50, 200);
    params.skip = Number(sp.get('skip')) || 0;

    // 같은 대화(Re:/Fw: 답장들)를 한 줄로 묶어 볼지
    const threaded = sp.get('threaded') === 'true';
    const { items, count } = threaded ? await listThreads(params) : await listMails(params);
    return NextResponse.json({
      ok: true,
      count,
      items: items.map((m) => ({ ...m, _id: String(m._id) })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
