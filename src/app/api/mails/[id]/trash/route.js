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
    // 못 찾았을 때 첫 계정으로 붙으면, 다른 메일함의 같은 UID 메일을 지울 수 있다.
    // 계정이 하나뿐인 지금은 일어나지 않지만, 메일함을 더하는 순간 위험해진다.
    const account = accounts.find((a) => a.id === (mail.accountId || 'main'));
    if (!account) {
      return NextResponse.json({
        ok: false,
        error: '이 메일을 가져온 계정을 찾을 수 없습니다. 설정에서 그 계정이 빠졌는지 확인하세요.',
      }, { status: 400 });
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
      // 웹메일에서 지운 것(trashedBy:'webmail')과 구분한다
      trashedBy: 'app',
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

/**
 * DELETE /api/mails/[id]/trash — 화면에서만 되살린다.
 *
 * 휴지통에서 사라지는 경우는 '원래 폴더로 되돌림' 과 '영구삭제' 둘인데
 * IMAP 으로는 구분할 수 없다. 예전에는 자동으로 되살렸다가, 휴지통을 비우자
 * 지웠던 메일이 통째로 브리핑에 다시 나타났다. 그래서 사람이 누르게 했다.
 *
 * 메일함은 건드리지 않는다 — 화면에서 다시 보이게 할 뿐이다.
 * 웹메일 쪽 원본은 사용자가 웹메일에서 원래 폴더로 옮기면 된다.
 */
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const mail = await getMail(id);
    if (!mail) {
      return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!mail.trashedAt) {
      return NextResponse.json({ ok: false, error: '휴지통에 있는 메일이 아닙니다.' }, { status: 400 });
    }

    const merged = await updateMail(id, {
      trashedAt: null,
      trashedTo: null,
      trashedBy: null,
      // 버릴 때 '무시'로 바꿨으므로 되살릴 때는 다시 볼 것으로 돌려놓는다
      status: mail.status === 'ignored' ? 'reviewing' : mail.status,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      mail: { ...merged, _id: String(id) },
      message: '화면에서 다시 보이게 했습니다. 메일함 원본은 그대로이니, 웹메일 휴지통에 있다면 그쪽에서도 원래 폴더로 옮겨 주세요.',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
