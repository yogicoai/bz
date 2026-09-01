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

/**
 * 연결 후 콜백 실행, 성공/실패와 무관하게 logout 보장.
 *
 * `settings.__client` 로 이미 열린 연결을 넘기면 그것을 그대로 쓰고 닫지 않는다.
 * 폴더마다 새로 접속하면 26개 폴더를 도는 동안 메일 서버가 연달아 붙는 것을
 * 막아 뒤쪽 폴더가 통째로 실패한다(실측: 한 번에 12개 폴더가 'Command failed').
 * 계정당 한 번만 열고 폴더를 돌기 위한 통로다.
 */
async function withClient(settings, fn) {
  if (settings?.__client) return fn(settings.__client);

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
 * 연결을 한 번 열어 콜백에 넘긴다 — 여러 폴더를 연달아 볼 때 쓴다.
 * 콜백에는 `settings` 에 열린 연결을 붙인 사본이 들어간다.
 */
export async function withOpenAccount(settings, fn) {
  requireConfig(settings);
  const client = buildClient(settings);
  try {
    await client.connect();
  } catch (e) {
    throw friendlyImapError(e, settings);
  }
  try {
    return await fn({ ...settings, __client: client });
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
 * 메일을 메일함의 휴지통으로 옮긴다.
 *
 * **영구 삭제는 하지 않는다.** 이 앱은 광고·자동발송을 자동으로 분류하는데,
 * 그 판정이 틀릴 수 있다. 지금은 틀려도 라벨만 바뀌고 메일은 남지만,
 * 영구 삭제를 붙이면 오판이 곧 자료 소실이 되고 되돌릴 방법이 없다.
 * 휴지통으로만 옮기면 웹메일에서 그대로 복구할 수 있다.
 *
 * 휴지통 폴더 이름은 메일함마다 다르므로(Trash / 휴지통 / [Gmail]/휴지통)
 * IMAP 이 알려주는 specialUse 표시를 먼저 쓰고, 없을 때만 이름으로 찾는다.
 */
export async function moveToTrash(settings, { folder, uid }) {
  if (!folder || !uid) throw new Error('메일 위치 정보가 없습니다. 다시 수집한 뒤 시도하세요.');

  return withClient(settings, async (client) => {
    const boxes = await client.list();
    const trash = boxes.find((b) => b.specialUse === '\\Trash')
      || boxes.find((b) => /^(Trash|휴지통|Deleted Items|\[Gmail\]\/(Trash|휴지통))$/i.test(b.path));

    if (!trash) {
      throw new Error('메일함에서 휴지통 폴더를 찾지 못했습니다. 웹메일에서 직접 삭제해 주세요.');
    }
    if (trash.path === folder) {
      throw new Error('이미 휴지통에 있는 메일입니다.');
    }

    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove(String(uid), trash.path, { uid: true });
      return { trash: trash.path };
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

/**
 * 보낸메일함·휴지통처럼 **역할이 정해진 폴더**의 실제 이름을 찾는다.
 *
 * 이름은 메일함마다 다르다(Sent / 보낸메일함 / [Gmail]/보낸편지함 …).
 * IMAP 이 알려주는 specialUse 표시를 먼저 쓰고, 없을 때만 이름으로 찾는다.
 *
 * @param {'sent'|'trash'} role
 */
export const SPECIAL = {
  sent: {
    use: '\\Sent',
    name: /^(Sent|Sent Items|Sent Messages|보낸메일함|보낸편지함|\[Gmail\]\/(Sent Mail|보낸편지함))$/i,
  },
  trash: {
    use: '\\Trash',
    name: /^(Trash|휴지통|Deleted Items|\[Gmail\]\/(Trash|휴지통))$/i,
  },
};

export async function findSpecialFolder(settings, role) {
  const spec = SPECIAL[role];
  if (!spec) throw new Error(`알 수 없는 폴더 역할: ${role}`);
  return withClient(settings, async (client) => {
    const boxes = await client.list();
    const hit = boxes.find((b) => b.specialUse === spec.use)
      || boxes.find((b) => spec.name.test(b.path));
    return hit?.path || null;
  });
}

/**
 * 폴더의 최근 N통에서 **본문 없이 봉투 정보만** 읽는다.
 *
 * 회신 여부·삭제 여부를 맞춰 보는 데는 Message-ID 와 In-Reply-To 만 있으면 된다.
 * 본문(source)까지 받으면 보낸메일함 2,000통이 수백 MB가 되므로 절대 받지 않는다.
 */
export async function fetchEnvelopes(settings, { folder, limit = 300 } = {}) {
  return withClient(settings, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = client.mailbox.exists;
      if (!total) return { messages: [], total: 0, readAll: true };

      const start = Math.max(1, total - limit + 1);
      const messages = [];
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        envelope: true,
        // References 는 envelope 에 없어서 헤더로 따로 받는다 (수십 바이트)
        headers: ['references'],
      })) {
        const raw = msg.headers ? msg.headers.toString('utf8') : '';
        const refLine = raw.match(/^references:\s*([\s\S]*?)(?:\r?\n(?![ \t])|$)/im)?.[1] || '';
        const e = msg.envelope || {};
        messages.push({
          uid: msg.uid,
          messageId: e.messageId || '',
          inReplyTo: e.inReplyTo || '',
          references: refLine.split(/\s+/).map((x) => x.trim()).filter(Boolean),
          subject: e.subject || '',
          date: e.date || null,
          to: (e.to || []).map((x) => String(x.address || '').toLowerCase()).filter(Boolean),
          cc: (e.cc || []).map((x) => String(x.address || '').toLowerCase()).filter(Boolean),
        });
      }
      // 폴더 전체를 다 읽었는지 — '되살아난 메일' 판정에 필요하다.
      // 일부만 읽고 판단하면 안 읽은 옛 메일을 '휴지통에서 빠졌다'고 오해한다.
      return { messages, total, readAll: start === 1 };
    } finally {
      lock.release();
    }
  });
}
