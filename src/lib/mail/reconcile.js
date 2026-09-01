/**
 * 메일함과 화면을 맞추는 작업 — 이 도구 밖에서 일어난 일을 따라잡는다.
 *
 * 이 도구는 받은 메일만 읽어 왔다. 그래서
 *   · 웹메일·휴대폰에서 회신을 보내도 화면은 계속 '답변 필요' 로 남고
 *   · 웹메일에서 메일을 지워도 화면에는 그대로 남았다
 * 실제 업무는 웹메일에서도 이루어지므로, 그쪽에서 벌어진 일을 읽어 와야
 * 화면의 '답변 필요 5건' 이 실제와 맞는다.
 *
 * 두 작업 모두 **읽기만** 한다. 메일함을 건드리지 않는다.
 * 본문은 받지 않고 봉투(Message-ID·In-Reply-To·제목·받는사람)만 본다.
 */
import { collections } from '@/lib/db';
import { findSpecialFolder, fetchEnvelopes } from './imap';
import { normalizeSubject } from './thread';

/** 한 번에 훑을 최대 통수 — 보낸메일함은 최근 것만 봐도 충분하다 */
const SENT_SCAN = 400;
/** 휴지통은 '되살아난 메일' 판정 때문에 되도록 전부 읽는다 */
const TRASH_SCAN = 2000;

/** 사람이 정한 상태는 덮지 않는다 — 보관·무시는 이미 판단이 끝난 것이다 */
const OVERWRITABLE = ['new', 'reviewing'];

const accountFilter = (accountId) =>
  (accountId === 'main' ? { accountId: { $in: ['main', null] } } : { accountId });

/**
 * 보낸메일함을 읽어 **어느 메일에 회신했는지** 맞춘다.
 *
 * 맞추는 순서 (정확한 것부터)
 *   1) In-Reply-To 가 가리키는 Message-ID   — 메일 클라이언트가 붙인 확실한 근거
 *   2) References 에 들어 있는 Message-ID   — 중간 메일이 없어도 대화는 이어진다
 *   3) 제목(Re: 제거) + 받는사람 = 그 메일의 보낸사람
 *      웹메일에서 '새 메일' 로 답장하면 헤더가 없어 이것 말고는 방법이 없다.
 *      받는사람까지 같아야 하므로 동명이인 제목이 섞이지 않는다.
 */
export async function syncSentReplies(scoped, { account, limit = SENT_SCAN } = {}) {
  const out = { folder: null, scanned: 0, matched: 0 };

  const folder = await findSpecialFolder(scoped, 'sent');
  if (!folder) return out;
  out.folder = folder;

  const { messages } = await fetchEnvelopes(scoped, { folder, limit });
  out.scanned = messages.length;
  if (!messages.length) return out;

  const mails = await collections.mails();
  const scope = accountFilter(account?.id || 'main');

  for (const sent of messages) {
    // 1·2) 헤더가 가리키는 원본을 먼저 찾는다. References 는 뒤(=가장 최근)부터.
    const ids = [sent.inReplyTo, ...[...sent.references].reverse()].filter(Boolean);
    let target = ids.length
      ? await mails.findOne({ ...scope, messageId: { $in: ids } }, { projection: { status: 1 } })
      : null;

    // 3) 헤더가 없으면 제목+받는사람으로 맞춘다
    if (!target && sent.subject && sent.to.length) {
      const base = normalizeSubject(sent.subject);
      if (base) {
        // 받는사람이 보낸사람인 메일만 몇 통 꺼내 제목을 코드에서 맞춰 본다.
        // 제목을 정규식으로 만들면 괄호·물음표가 든 실제 제목에서 깨진다.
        const cands = await mails
          .find(
            { ...scope, direction: { $ne: 'out' }, 'from.address': { $in: sent.to } },
            { projection: { status: 1, subject: 1 }, sort: { date: -1 }, limit: 20 },
          )
          .toArray();
        target = cands.find((m) => normalizeSubject(m.subject) === base) || null;
      }
    }
    if (!target) continue;

    const r = await mails.updateOne(
      {
        _id: target._id,
        // 이미 답변완료로 표시된 것은 다시 건드리지 않는다 (매 수집마다 갱신되지 않도록)
        $or: [{ status: { $in: OVERWRITABLE } }, { repliedAt: null }, { repliedAt: { $exists: false } }],
      },
      {
        $set: {
          status: OVERWRITABLE.includes(target.status) ? 'replied' : target.status,
          repliedAt: sent.date || new Date(),
          repliedBy: 'webmail',
          replyInfo: {
            subject: sent.subject,
            to: sent.to,
            at: sent.date || null,
            messageId: sent.messageId || null,
          },
          updatedAt: new Date(),
        },
      },
    );
    if (r.modifiedCount) out.matched++;
  }

  return out;
}

/**
 * 휴지통을 읽어 **웹메일에서 지운 메일**을 화면에서도 빼 준다.
 *
 * 지우지 않고 표시만 한다(trashedAt). 무엇을 언제 버렸는지 휴지통 화면에서
 * 되짚을 수 있고, 웹메일에서 되살리면 다음 수집 때 표시도 풀린다.
 *
 * 되살리기 판정은 **휴지통을 통째로 읽었을 때만** 한다. 일부만 읽고 판단하면
 * 안 읽은 옛 메일이 '휴지통에서 빠졌다'고 오해되어 통째로 되살아난다.
 */
export async function syncTrashed(scoped, { account, limit = TRASH_SCAN } = {}) {
  const out = { folder: null, scanned: 0, trashed: 0, restored: 0 };

  const folder = await findSpecialFolder(scoped, 'trash');
  if (!folder) return out;
  out.folder = folder;

  const { messages, readAll } = await fetchEnvelopes(scoped, { folder, limit });
  out.scanned = messages.length;

  const ids = messages.map((m) => m.messageId).filter(Boolean);
  const mails = await collections.mails();
  const scope = accountFilter(account?.id || 'main');

  if (ids.length) {
    const r = await mails.updateMany(
      { ...scope, messageId: { $in: ids }, trashedAt: null },
      { $set: { trashedAt: new Date(), trashedTo: folder, trashedBy: 'webmail', updatedAt: new Date() } },
    );
    out.trashed = r.modifiedCount || 0;
  }

  // 웹메일에서 휴지통 밖으로 되돌린 메일 — 화면에서도 되살린다.
  // 이 화면에서 버린 것(trashedBy 가 webmail 이 아닌 것)은 건드리지 않는다.
  if (readAll) {
    const r = await mails.updateMany(
      { ...scope, trashedBy: 'webmail', trashedAt: { $ne: null }, messageId: { $nin: ids } },
      { $set: { trashedAt: null, trashedTo: null, trashedBy: null, updatedAt: new Date() } },
    );
    out.restored = r.modifiedCount || 0;
  }

  return out;
}
