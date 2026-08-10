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
    text: draft.body,
    inReplyTo: mail.messageId,
    references: references.join(' '),
  };

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
