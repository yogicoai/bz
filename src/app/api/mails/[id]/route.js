/**
 * GET   /api/mails/[id]  → 상세
 * PATCH /api/mails/[id]  → 상태·메모·태그·수동 분류 변경
 */
import { NextResponse } from 'next/server';
import { getMail, updateMail, getThread } from '@/lib/mail/store';
import { STATUSES, CLASSIFICATIONS } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const mail = await getMail(id);
    if (!mail) return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });

    // 같은 대화의 다른 메일들 — 목록에서 한 줄로 묶은 것을 여기서 펼쳐 본다
    let thread = [];
    if (mail.threadKey) {
      thread = (await getThread(mail.threadKey))
        .filter((t) => String(t._id) !== String(mail._id))
        .map((t) => ({
          _id: String(t._id),
          subject: t.subject,
          date: t.date,
          from: t.from,
          needsReply: Boolean(t.analysis?.needsReply),
          deadline: t.analysis?.deadline || null,
          topic: t.analysis?.topic || '',
          analyzed: t.analysis?.method === 'ai',
        }));
    }

    return NextResponse.json({ ok: true, mail: { ...mail, _id: String(mail._id) }, thread });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const patch = {};

    if (body.status) {
      if (!STATUSES.includes(body.status)) throw new Error('알 수 없는 상태값입니다.');
      patch.status = body.status;
    }
    if (body.classification) {
      if (!CLASSIFICATIONS.includes(body.classification)) throw new Error('알 수 없는 분류값입니다.');
      patch.classification = body.classification;
      patch.classifiedBy = 'manual'; // 사람이 고친 분류는 재분석이 덮지 않도록 표시
    }
    if (body.memo !== undefined) patch.memo = String(body.memo);
    if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);

    // 거래처 그룹 수동 지정 — 사람이 고친 것은 이후 자동 추천이 덮지 않는다
    if (body.group !== undefined) {
      patch.group = body.group ? String(body.group) : null;
      patch.groupBy = body.group ? 'manual' : null;
    }

    // 기한을 사람이 직접 잡거나 지우는 경우
    if (body.deadline !== undefined) {
      patch['analysis.deadline'] = body.deadline ? new Date(body.deadline) : null;
    }
    if (body.needsReply !== undefined) {
      patch['analysis.needsReply'] = Boolean(body.needsReply);
    }

    if (!Object.keys(patch).length) throw new Error('변경할 항목이 없습니다.');

    const mail = await updateMail(id, patch);
    return NextResponse.json({ ok: true, mail: { ...mail, _id: String(mail._id) } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
