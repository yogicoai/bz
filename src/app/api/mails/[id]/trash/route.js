/**
 * POST /api/mails/[id]/trash — 메일함의 휴지통으로 옮긴다.
 *
 * **메일함 원본을 건드리는 유일한 기능이다.** 그래서 두 가지를 지킨다.
 *   1) 영구 삭제는 하지 않는다 — 웹메일 휴지통에서 그대로 복구할 수 있다.
 *   2) DB 에서도 지우지 않는다 — 상태만 '무시'로 바꿔, 잘못 눌렀을 때
 *      무엇을 옮겼는지 화면에서 되짚을 수 있다.
 */
import { NextResponse } from 'next/server';
import { getMail, updateMail } from '@/lib/mail/store';
import { getSettings, accountsOf, accountAsSettings } from '@/lib/settings';
import { moveToTrash } from '@/lib/mail/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const mail = await getMail(id);
    if (!mail) {
      return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 어느 메일함에서 온 메일인지에 따라 접속할 서버가 다르다
    const settings = await getSettings();
    const accounts = accountsOf(settings);
    const account = accounts.find((a) => a.id === (mail.accountId || 'main')) || accounts[0];
    if (!account) {
      return NextResponse.json({ ok: false, error: '메일 계정 설정을 찾을 수 없습니다.' }, { status: 500 });
    }

    const { trash } = await moveToTrash(accountAsSettings(account, settings), {
      folder: mail.folder,
      uid: mail.uid,
    });

    // 옮긴 뒤에는 원래 폴더의 UID 가 더 이상 유효하지 않다.
    // 첨부 다운로드가 엉뚱한 메일을 집지 않도록 위치 정보를 지운다.
    const merged = await updateMail(id, {
      status: 'ignored',
      trashedAt: new Date(),
      trashedTo: trash,
      uid: null,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      trash,
      mail: { ...merged, _id: String(id) },
      message: `메일함의 '${trash}' 로 옮겼습니다. 웹메일 휴지통에서 되돌릴 수 있습니다.`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
