/**
 * POST /api/mails/[id]/draft  { intent }
 * 담당자가 한국어로 적은 내용을 상대 언어의 답장 초안으로 변환한다. 발송은 하지 않는다.
 */
import { NextResponse } from 'next/server';
import { getMail } from '@/lib/mail/store';
import { getSettings } from '@/lib/settings';
import { draftReply } from '@/lib/ai/draft';
import { collections } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { intent } = await req.json();

    const mail = await getMail(id);
    if (!mail) return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });

    const settings = await getSettings();
    const draft = await draftReply(mail, intent, settings);

    const mails = await collections.mails();
    await mails.updateOne(
      { _id: mail._id },
      { $push: { drafts: { ...draft, intent } }, $set: { updatedAt: new Date() } },
    );

    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
