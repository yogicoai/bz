/**
 * IMAP 수신 — imapflow 래퍼.
 * 이카운트 웹메일은 IMAP 동기화를 지원한다. 실제 서버 주소·포트는
 * 이카운트 웹메일 → 환경설정 → IMAP/POP 설정 에서 확인해 /settings 에 입력할 것.
 */
import { ImapFlow } from 'imapflow';

function requireConfig(s) {
  const missing = [];
  if (!s.imapHost) missing.push('수신 서버 주소');
  if (!s.imapUser) missing.push('계정');
  if (!s.imapPass) missing.push('비밀번호');
  if (!missing.length) return;

  // 어디서 값을 구해야 하는지까지 알려준다 — "입력하세요" 만으로는 다음 행동이 안 나온다
  throw new Error(
    `메일 수신 설정이 아직 없습니다 (${missing.join(', ')} 미입력).\n` +
    '설정 화면에서 입력한 뒤 [연결 테스트]로 확인하세요.\n' +
    '수신 서버 주소는 쓰고 계신 웹메일의 환경설정 → IMAP/POP 설정 에서 확인할 수 있습니다. ' +
    '이카운트 웹메일이라면 관리자에서 IMAP 사용을 먼저 켜야 할 수 있습니다.',
  );
}

function buildClient(s) {
  return new ImapFlow({
    host: s.imapHost,
    port: Number(s.imapPort) || 993,
    secure: s.imapSecure !== false,
    auth: { user: s.imapUser, pass: s.imapPass },
    logger: false,
    // 자체서명 인증서를 쓰는 사내 메일 서버 대응
    tls: { rejectUnauthorized: false },
    socketTimeout: 60_000,
    greetingTimeout: 20_000,
  });
}

/**
 * imapflow 의 오류를 사람이 읽을 수 있는 말로 바꾼다.
 *
 * 인증에 실패하면 그냥 'Command failed' 만 올라온다. 그 말로는 비밀번호가
 * 틀린 건지, IMAP 이 꺼진 건지, 서버 주소가 틀린 건지 알 수 없어서
 * 사용자가 다음에 무엇을 해야 할지 판단할 수 없다.
 */
function friendlyImapError(e, settings) {
  const host = String(settings?.imapHost || '');
  const raw = String(e?.responseText || e?.message || e);

  if (e?.authenticationFailed || /authentication failed/i.test(raw)) {
    const hint = /gmail/i.test(host)
      ? 'Gmail 은 계정 비밀번호가 아니라 앱 비밀번호 16자리를 넣어야 하고, 2단계 인증과 IMAP 사용이 켜져 있어야 합니다.'
      : /naver/i.test(host)
        ? '네이버 메일 → 환경설정 → POP3/IMAP 설정에서 IMAP 사용을 켜야 합니다.'
        : /ecount/i.test(host)
          ? '이카운트는 웹메일 → 개인기능설정 → 외부연동설정에서 "메일 클라이언트 사용"을 켜야 합니다.'
          : '메일함 설정에서 IMAP 사용이 켜져 있는지 확인하세요.';
    return new Error(`아이디 또는 비밀번호가 맞지 않습니다. ${hint}`);
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return new Error(`수신 서버 주소를 찾을 수 없습니다 (${host}). 주소를 다시 확인하세요.`);
  }
  if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(raw)) {
    return new Error(`수신 서버에 연결하지 못했습니다 (${host}). 주소·포트를 확인하세요.`);
  }
  return e;
}

/** 연결 후 콜백 실행, 성공/실패와 무관하게 logout 보장 */
async function withClient(settings, fn) {
  requireConfig(settings);
  const client = buildClient(settings);
  try {
    await client.connect();
  } catch (e) {
    throw friendlyImapError(e, settings);
  }
  try {
    return await fn(client);
  } finally {
    try { await client.logout(); } catch { /* 종료 실패는 무시 */ }
  }
}

/**
 * 연결 테스트 — 폴더 목록과 대상 폴더의 메일 수를 반환.
 * 설정 화면의 "연결 테스트" 버튼이 호출한다.
 */
/** 메일함에 실제로 존재하는 폴더 목록만 가볍게 읽는다 (LIST 한 번) */
export async function listMailboxes(settings) {
  return withClient(settings, async (client) => {
    const boxes = await client.list();
    return boxes
      .filter((b) => !b.flags?.has?.('\\Noselect'))
      .map((b) => b.path);
  });
}

export async function testConnection(settings) {
  return withClient(settings, async (client) => {
    const boxes = await client.list();
    const folders = boxes.map((b) => b.path);

    const target = settings.imapFolder || 'INBOX';
    let mailbox = null;
    if (folders.includes(target)) {
      const lock = await client.getMailboxLock(target);
      try {
        mailbox = {
          path: target,
          exists: client.mailbox.exists,
          uidNext: client.mailbox.uidNext,
        };
      } finally {
        lock.release();
      }
    }
    return { folders, mailbox, targetExists: folders.includes(target) };
  });
}

/**
 * 새 메일 수집 — sinceUid 초과분만.
 *
 * IMAP 의 `N:*` 범위는 조건에 맞는 메일이 없어도 마지막 1통을 돌려주는 특성이 있어
 * 클라이언트에서 uid > sinceUid 를 한 번 더 검사한다.
 *
 * ⚠️ sinceUid 가 0(최초 수집)이면 UID 1 부터, 즉 몇 년 전 메일부터 긁어온다.
 *    수만 통이 쌓인 메일함에서는 이게 치명적이라 최근분부터 받도록 우회한다.
 *
 * @returns {Promise<{ messages: Array<{uid:number, source:Buffer, flags:string[]}>, uidNext:number, folder:string }>}
 */
export async function fetchNew(settings, { folder: folderArg, sinceUid = 0, limit = 50 } = {}) {
  const folder = folderArg || settings.imapFolder || 'INBOX';

  // 최초 수집은 "가장 오래된 것부터" 가 아니라 "최근 것부터" 여야 한다
  if (!sinceUid) return fetchRecent(settings, { folder, limit });

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const uidNext = client.mailbox.uidNext;
      const messages = [];

      if (client.mailbox.exists === 0) return { messages, uidNext, folder };

      const range = `${Number(sinceUid) + 1}:*`;
      for await (const msg of client.fetch(
        range,
        { uid: true, flags: true, source: true, internalDate: true },
        { uid: true },
      )) {
        if (msg.uid <= sinceUid) continue; // `N:*` 잔여분 제거
        messages.push({
          uid: msg.uid,
          source: msg.source,
          flags: Array.from(msg.flags || []),
          internalDate: msg.internalDate,
        });
        if (messages.length >= limit) break;
      }

      // 오래된 것부터 처리해야 중단되어도 lastUid 가 안전하게 전진한다
      messages.sort((a, b) => a.uid - b.uid);
      return { messages, uidNext, folder };
    } finally {
      lock.release();
    }
  });
}

/**
 * 첨부파일 1개를 메일 서버에서 그대로 받아온다.
 *
 * 파일 내용을 DB 에 쌓지 않고 필요할 때만 가져오는 방식이라
 * 저장 용량이 늘지 않고, 원본이 지워지지 않는 한 항상 최신이다.
 *
 * @param {{folder:string, uid:number, partId:string}} target
 * @returns {Promise<{ buffer:Buffer, meta:object }>}
 */
export async function fetchAttachment(settings, { folder, uid, partId }) {
  if (!folder || !uid || !partId) {
    throw new Error('첨부파일 위치 정보가 없습니다. 메일을 다시 수집하면 받아올 수 있습니다.');
  }

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const dl = await client.download(String(uid), partId, { uid: true });
      if (!dl?.content) throw new Error('메일 서버에서 첨부파일을 찾지 못했습니다.');

      const chunks = [];
      let total = 0;
      const MAX = 40 * 1024 * 1024; // 40MB 초과분은 받지 않는다(메모리 보호)
      for await (const chunk of dl.content) {
        total += chunk.length;
        if (total > MAX) throw new Error('첨부파일이 너무 큽니다(40MB 초과). 원본 메일함에서 내려받으세요.');
        chunks.push(chunk);
      }
      return { buffer: Buffer.concat(chunks), meta: dl.meta || {} };
    } finally {
      lock.release();
    }
  });
}

/**
 * 최근 N통만 가져온다 — 최초 수집이나 테스트용.
 */
export async function fetchRecent(settings, { folder: folderArg, limit = 20 } = {}) {
  const folder = folderArg || settings.imapFolder || 'INBOX';

  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = client.mailbox.exists;
      const uidNext = client.mailbox.uidNext;
      if (!total) return { messages: [], uidNext, folder };

      // 시퀀스 번호 기준 마지막 limit 통
      const start = Math.max(1, total - limit + 1);
      const messages = [];
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        flags: true,
        source: true,
        internalDate: true,
      })) {
        messages.push({
          uid: msg.uid,
          source: msg.source,
          flags: Array.from(msg.flags || []),
          internalDate: msg.internalDate,
        });
      }
      messages.sort((a, b) => a.uid - b.uid);
      return { messages, uidNext, folder };
    } finally {
      lock.release();
    }
  });
}
