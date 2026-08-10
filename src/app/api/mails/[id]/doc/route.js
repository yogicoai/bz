/**
 * GET /api/mails/[id]/doc — 정리 문서(.md) 다운로드.
 * 저장된 문서가 없으면 현재 데이터로 즉석 생성한다(서버리스 디스크 비의존).
 */
import { getMail } from '@/lib/mail/store';
import { buildMarkdown, buildFilename } from '@/lib/mail/docgen';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { id } = await params;
  const mail = await getMail(id);
  if (!mail) return new Response('메일을 찾을 수 없습니다.', { status: 404 });

  const markdown = mail.doc || buildMarkdown(mail);
  const filename = buildFilename(mail);

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // 한글 파일명은 RFC 5987 형식으로
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
