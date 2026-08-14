/**
 * GET /api/mails/[id]/attachment?i=0
 * 첨부파일 다운로드 — DB 에 파일을 쌓지 않고 요청 시점에 메일 서버에서 받아온다.
 */
import { getMail } from '@/lib/mail/store';
import { getSettings, accountsOf, accountAsSettings } from '@/lib/settings';
import { fetchAttachment } from '@/lib/mail/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const index = Number(new URL(req.url).searchParams.get('i')) || 0;

    const mail = await getMail(id);
    if (!mail) return new Response('메일을 찾을 수 없습니다.', { status: 404 });

    const att = (mail.attachments || [])[index];
    if (!att) return new Response('첨부파일을 찾을 수 없습니다.', { status: 404 });
    if (!att.partId) {
      return new Response(
        '이 메일은 첨부파일 위치 정보 없이 수집되었습니다. 메일을 다시 수집하면 내려받을 수 있습니다.',
        { status: 409 },
      );
    }

    // 어느 메일함에서 온 메일인지에 따라 접속할 서버가 다르다.
    // 계정을 여러 개 등록한 경우 이걸 안 맞추면 엉뚱한 서버에서 같은 UID 를
    // 찾게 되어 다른 파일이 내려오거나 404 가 난다.
    const settings = await getSettings();
    const accounts = accountsOf(settings);
    const account = accounts.find((a) => a.id === (mail.accountId || 'main')) || accounts[0];
    if (!account) {
      return new Response('메일 계정 설정을 찾을 수 없습니다.', { status: 500 });
    }

    const { buffer } = await fetchAttachment(accountAsSettings(account, settings), {
      folder: mail.folder,
      uid: mail.uid,
      partId: att.partId,
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': att.contentType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        // 한글 파일명은 RFC 5987 형식으로
        'Content-Disposition':
          `attachment; filename*=UTF-8''${encodeURIComponent(att.filename || 'attachment')}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    return new Response(`첨부파일을 가져오지 못했습니다: ${String(e?.message || e)}`, { status: 502 });
  }
}
