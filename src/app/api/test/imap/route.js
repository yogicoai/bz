/**
 * POST /api/test/imap
 * 저장된 설정으로 IMAP 접속을 시도해 폴더 목록을 돌려준다.
 * body 로 임시 값을 넘기면 저장하지 않고 그 값으로 테스트한다.
 */
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { testConnection } from '@/lib/mail/imap';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  try {
    const saved = await getSettings();
    let override = {};
    try { override = await req.json(); } catch { /* 본문 없이 호출 가능 */ }

    // 계정 목록에서 온 테스트 — 화면이 아직 저장하지 않은 값으로도 확인할 수 있어야 한다.
    // 비밀번호가 비어 있으면(이미 저장된 계정을 다시 테스트하는 경우) 저장된 값을 쓴다.
    if (override.account) {
      const a = override.account;
      const stored = (saved.imapAccounts || []).find((x) => x.id === a.id);
      const settings = {
        ...saved,
        imapHost: a.host,
        imapPort: Number(a.port) || 993,
        imapSecure: a.secure !== false,
        imapUser: a.user,
        imapPass: a.pass || stored?.pass || '',
        imapFolder: a.folder || 'INBOX',
      };
      const result = await testConnection(settings);
      return NextResponse.json({
        ok: true,
        ...result,
        message: `연결 성공 — 폴더 ${result.folders?.length ?? 0}개를 읽었습니다.`,
      });
    }

    // 비밀번호는 빈 값이면 저장된 것을 사용
    const settings = { ...saved };
    for (const k of ['imapHost', 'imapPort', 'imapSecure', 'imapUser', 'imapFolder']) {
      if (override[k] !== undefined && override[k] !== '') settings[k] = override[k];
    }
    if (override.imapPass) settings.imapPass = override.imapPass;

    const result = await testConnection(settings);
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.targetExists
        ? `연결 성공 — '${settings.imapFolder}' 폴더에 ${result.mailbox?.exists ?? 0}통`
        : `연결은 성공했지만 '${settings.imapFolder}' 폴더를 찾을 수 없습니다. 아래 목록에서 정확한 이름을 골라 입력하세요.`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
