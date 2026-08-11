/**
 * POST /api/mails/[id]/translate — 한글 번역만 생성해 저장 (유료, 요약보다 저렴)
 *
 * 분류·답변필요·기한(analysis)은 건드리지 않는다.
 * 이미 사람이 확인한 판단이 번역 한 번에 바뀌면 안 되기 때문이다.
 */
import { NextResponse } from 'next/server';
import { getMail, updateMail } from '@/lib/mail/store';
import { getSettings } from '@/lib/settings';
import { translateMail } from '@/lib/ai/translate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const mail = await getMail(id);
    if (!mail) {
      return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'ANTHROPIC_API_KEY 가 설정되지 않아 번역할 수 없습니다.' },
        { status: 400 },
      );
    }

    const settings = await getSettings();
    const { lang, translation } = await translateMail(mail, settings);

    const merged = await updateMail(id, { lang, translation, updatedAt: new Date() });
    return NextResponse.json({
      ok: true,
      mail: { ...merged, _id: String(id) },
      usage: translation.usage,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
