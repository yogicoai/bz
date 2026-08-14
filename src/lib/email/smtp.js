/**
 * SMTP 발송 — nodemailer.
 * MAIL_DRY_RUN=1 이면 실제로 보내지 않고 페이로드만 로그에 남긴다(개발 기본값).
 * 답장은 In-Reply-To / References 헤더로 원 메일 스레드에 붙인다.
 */
import nodemailer from 'nodemailer';
import { getSettings } from '@/lib/settings';

export function isDryRun() {
  return process.env.MAIL_DRY_RUN === '1';
}

function buildFrom(s) {
  const address = s.mailFromAddress || s.smtpUser;
  const name = s.mailFromName || '';
  return name ? `${name} <${address}>` : address;
}

/**
 * 원 메일에 대한 답장 발송.
 * @param {object} mail    원본 메일 도큐먼트
 * @param {{subject:string, body:string, to?:string, cc?:string}} draft
 */
/** 메일 클라이언트가 실제로 지원하는 글꼴만 허용 — 없는 글꼴을 지정하면 제멋대로 대체된다 */
const SAFE_FONTS = new Set([
  'Calibri', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Georgia',
  'Times New Roman', 'Courier New', 'Malgun Gothic', 'Gulim', 'Batang', 'Dotum',
]);

const escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * 평문 본문을 글꼴·크기가 적용된 HTML 로 바꾼다.
 *
 * 아웃룩은 <style> 블록을 자주 무시하므로 인라인 style 로 넣는다.
 * 한글 글꼴 대체를 위해 지정 글꼴 뒤에 '맑은 고딕'을 항상 붙인다 —
 * Calibri 에는 한글 글리프가 없어서 그것만 지정하면 한글이 엉뚱한 글꼴로 나온다.
 */
export function bodyToHtml(body = '', font = 'Calibri', size = 10, lineHeight = 1.5) {
  const family = SAFE_FONTS.has(font) ? font : 'Calibri';
  const pt = Math.min(Math.max(Number(size) || 10, 8), 24);
  const lh = Math.min(Math.max(Number(lineHeight) || 1.5, 1), 3);
  const stack = `'${family}', 'Malgun Gothic', '맑은 고딕', sans-serif`;

  const lines = escapeHtml(body).split(/\r?\n/);
  const html = lines
    .map((l) => (l.trim() ? `<div>${l}</div>` : '<div>&nbsp;</div>'))
    .join('\n');

  return `<div style="font-family:${stack};font-size:${pt}pt;line-height:${lh};color:#000;">
${html}
</div>`;
}

/**
 * 화면에서 올린 첨부(base64)를 nodemailer 형식으로.
 * 서버리스 요청 본문 한도(4.5MB)가 있어 크기를 여기서 한 번 더 막는다 —
 * 넘으면 발송이 통째로 실패하는데, 그 오류만으로는 원인을 알기 어렵다.
 */
const MAX_ATTACH_BYTES = 3 * 1024 * 1024;

function buildAttachments(list = []) {
  if (!Array.isArray(list) || !list.length) return undefined;

  let total = 0;
  const out = list.map((a) => {
    const content = Buffer.from(String(a.content || ''), 'base64');
    total += content.length;
    return {
      filename: a.filename || 'attachment',
      content,
      contentType: a.contentType || 'application/octet-stream',
    };
  });

  if (total > MAX_ATTACH_BYTES) {
    throw new Error(
      `첨부파일이 너무 큽니다 (${(total / 1048576).toFixed(1)}MB). `
      + `합쳐서 ${MAX_ATTACH_BYTES / 1048576}MB 까지 보낼 수 있습니다. `
      + '큰 파일은 링크로 보내시거나 나눠서 보내세요.',
    );
  }
  return out;
}

export async function sendReply(mail, draft) {
  const s = await getSettings();

  if (!s.smtpHost || !s.smtpUser || !s.smtpPass) {
    throw new Error('SMTP 설정이 없습니다. 설정 화면에서 발신 서버·계정·비밀번호를 입력하세요.');
  }
  const to = draft.to || mail.from?.address;
  if (!to) throw new Error('수신자 주소가 없습니다.');
  if (!draft.subject) throw new Error('제목이 비어 있습니다.');
  if (!draft.body || !draft.body.trim()) throw new Error('본문이 비어 있습니다.');

  // 스레드 유지 — 상대 메일 클라이언트가 대화로 묶도록
  const references = [...(mail.headers?.references || []), mail.messageId].filter(Boolean);

  const payload = {
    from: buildFrom(s),
    to,
    cc: draft.cc || undefined,
    subject: draft.subject,
    // 글꼴·크기를 지정한 경우에만 HTML 로 보낸다.
    // 평문도 항상 함께 실어, HTML 을 막아 둔 수신자에게도 내용이 그대로 보이게 한다.
    text: draft.body,
    html: draft.font || draft.fontSize
      ? bodyToHtml(draft.body, draft.font, draft.fontSize, draft.lineHeight)
      : undefined,
    attachments: buildAttachments(draft.attachments),
    inReplyTo: mail.messageId,
    references: references.join(' '),
  };

  // 받는 사람을 바꿔 보낸 경우(시험 발송 등)에는 원 대화에 묶지 않는다.
  // 엉뚱한 사람의 메일함에서 남의 대화에 끼어 붙는 것을 막는다.
  if (draft.to && draft.to !== mail.from?.address) {
    delete payload.inReplyTo;
    delete payload.references;
  }

  if (isDryRun()) {
    console.log('[smtp] DRY RUN — 실제 발송하지 않음\n', JSON.stringify(payload, null, 2));
    return { dryRun: true, messageId: null, to, sentAt: new Date() };
  }

  const transporter = nodemailer.createTransport({
    host: s.smtpHost,
    port: Number(s.smtpPort) || 465,
    secure: s.smtpSecure !== false,
    auth: { user: s.smtpUser, pass: s.smtpPass },
  });

  const info = await transporter.sendMail(payload);
  return { dryRun: false, messageId: info.messageId, to, sentAt: new Date() };
}

/**
 * 일일 브리핑 발송 — 답장이 아니라 담당자에게 보내는 알림이라 스레드 헤더가 없다.
 * DRY RUN 에서는 본문을 콘솔에 출력해 내용을 확인할 수 있게 한다.
 */
export async function sendBriefing({ to, subject, text }) {
  const s = await getSettings();
  if (!to) throw new Error('브리핑 수신 주소가 없습니다.');

  if (isDryRun()) {
    console.log(`[smtp] DRY RUN 브리핑 → ${to}\n제목: ${subject}\n${'-'.repeat(46)}\n${text}\n${'-'.repeat(46)}`);
    return { dryRun: true, to, sentAt: new Date() };
  }

  if (!s.smtpHost || !s.smtpUser || !s.smtpPass) {
    throw new Error('SMTP 설정이 없습니다. 설정 화면에서 발신 서버·계정을 입력하세요.');
  }

  const transporter = nodemailer.createTransport({
    host: s.smtpHost,
    port: Number(s.smtpPort) || 465,
    secure: s.smtpSecure !== false,
    auth: { user: s.smtpUser, pass: s.smtpPass },
  });

  const info = await transporter.sendMail({ from: buildFrom(s), to, subject, text });
  return { dryRun: false, messageId: info.messageId, to, sentAt: new Date() };
}
