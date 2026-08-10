/**
 * POST /api/mails/[id]/analyze — 번역·요약·기한 추출 (재실행 가능)
 */
import { NextResponse } from 'next/server';
import { getMail } from '@/lib/mail/store';
import { getSettings } from '@/lib/settings';
import { analyzeAndSave } from '@/lib/mail/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const mail = await getMail(id);
    if (!mail) return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });

    const settings = await getSettings();
    const merged = await analyzeAndSave(mail, settings);
    return NextResponse.json({ ok: true, mail: { ...merged, _id: String(mail._id) } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
