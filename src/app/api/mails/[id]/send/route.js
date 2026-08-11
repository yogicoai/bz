/**
 * POST /api/mails/[id]/send  { subject, body, to?, cc? }
 * 화면에서 최종 확인한 내용을 그대로 발송한다(초안을 서버가 다시 만들지 않음).
 * 발송 성공 시 메일 상태를 '답변완료'로 바꾸고 이력을 남긴다.
 */
import { NextResponse } from 'next/server';
import { getMail } from '@/lib/mail/store';
import { sendReply, isDryRun } from '@/lib/email/smtp';
import { collections } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const mail = await getMail(id);
    if (!mail) return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });

    const result = await sendReply(mail, {
      subject: body.subject,
      body: body.body,
      to: body.to,
      cc: body.cc,
      // 화면에서 고른 글꼴·크기 (없으면 평문으로 나간다)
      font: body.font,
      fontSize: body.fontSize,
    });

    const mails = await collections.mails();
    await mails.updateOne(
      { _id: mail._id },
      {
        $push: {
          drafts: {
            subject: body.subject,
            body: body.body,
            to: result.to,
            cc: body.cc || null,
            sentAt: result.sentAt,
            sentMessageId: result.messageId,
            dryRun: result.dryRun,
            createdAt: new Date(),
          },
        },
        // DRY RUN 은 실제로 보낸 것이 아니므로 상태를 바꾸지 않는다
        $set: result.dryRun
          ? { updatedAt: new Date() }
          : { status: 'replied', repliedAt: result.sentAt, updatedAt: new Date() },
      },
    );

    return NextResponse.json({
      ok: true,
      dryRun: result.dryRun,
      to: result.to,
      message: result.dryRun
        ? 'DRY RUN — 실제로 발송하지 않았습니다. 서버 콘솔에서 페이로드를 확인하세요. 실제 발송하려면 MAIL_DRY_RUN 을 0 으로 바꾸세요.'
        : `${result.to} 로 발송했습니다.`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}

/** GET — 화면이 DRY RUN 여부를 미리 알 수 있도록 */
export async function GET() {
  return NextResponse.json({ ok: true, dryRun: isDryRun() });
}
