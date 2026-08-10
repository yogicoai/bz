/**
 * 메일별 정리 문서(Markdown) 생성.
 * 서버리스에서는 디스크가 휘발성이므로 Mongo 에 문자열로 보관하고,
 * 다운로드 시점에 파일로 내려준다. DOC_WRITE_LOCAL=1 이면 로컬 디스크에도 쓴다.
 */
import { classificationLabel, deadlineTypeLabel, urgencyLabel, ddayLabel } from '@/lib/labels';

const kst = (d) =>
  d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';
const kstDate = (d) =>
  d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';

export function buildMarkdown(mail) {
  const a = mail.analysis || {};
  const t = mail.translation || {};
  const L = [];

  L.push(`# ${t.subject || mail.subject}`);
  L.push('');
  L.push(`> ${a.topic || '(분석 전)'}`);
  L.push('');
  L.push('| 항목 | 내용 |');
  L.push('| --- | --- |');
  L.push(`| 발신 | ${mail.from?.name || ''} <${mail.from?.address || ''}> |`);
  L.push(`| 수신일 | ${kst(mail.date)} |`);
  L.push(`| 분류 | ${classificationLabel(mail.classification)} |`);
  L.push(`| 원문 제목 | ${mail.subject} |`);
  if (a.needsReply !== undefined) {
    L.push(`| 답변 필요 | ${a.needsReply ? `**예** — ${a.replyReason || ''}` : '아니오'} |`);
  }
  if (a.deadline) {
    L.push(`| 기한 | **${kstDate(a.deadline)}** (${ddayLabel(a.deadline)}) · ${deadlineTypeLabel(a.deadlineType)}${a.deadlineText ? ` · 원문: "${a.deadlineText}"` : ''} |`);
  }
  if (a.urgency) L.push(`| 긴급도 | ${urgencyLabel(a.urgency)} |`);
  if (mail.attachments?.length) {
    L.push(`| 첨부 | ${mail.attachments.map((x) => x.filename).join(', ')} |`);
  }
  L.push('');

  if (a.summary) {
    L.push('## 핵심 요약');
    L.push('');
    L.push(a.summary);
    L.push('');
  }

  if (a.keyPoints?.length) {
    L.push('## 주요 포인트');
    L.push('');
    a.keyPoints.forEach((p) => L.push(`- ${p}`));
    L.push('');
  }

  if (a.intent || a.suggestedAction) {
    L.push('## 상대 요구사항 / 다음 조치');
    L.push('');
    if (a.intent) L.push(`- **상대가 원하는 것**: ${a.intent}`);
    if (a.suggestedAction) L.push(`- **다음 조치**: ${a.suggestedAction}`);
    L.push('');
  }

  if (t.body) {
    L.push('## 한글 번역본');
    L.push('');
    L.push(t.body);
    L.push('');
  }

  L.push('## 원문');
  L.push('');
  L.push('```');
  L.push(mail.raw?.text || '(본문 없음)');
  L.push('```');
  L.push('');
  L.push('---');
  L.push(`<sub>emailData 자동 생성 · ${a.model || '-'} · ${kst(a.analyzedAt || new Date())}</sub>`);

  return L.join('\n');
}

/** 파일명 안전화 — 경로 조작·OS 금지문자 제거 */
function slug(s = '', max = 50) {
  return String(s)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\s ]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max) || 'mail';
}

export function buildFilename(mail) {
  const d = new Date(mail.date || mail.receivedAt);
  const ymd = d.toISOString().slice(0, 10);
  const domain = (mail.from?.address || '').split('@')[1] || 'unknown';
  const title = mail.translation?.subject || mail.subject || '';
  return `${ymd}-${slug(domain, 30)}-${slug(title)}.md`;
}

/**
 * 로컬 개발 시에만 data/mails/YYYY-MM/ 에도 저장.
 * 서버리스에서는 DOC_WRITE_LOCAL=0 (기본) 으로 두어 호출하지 않는다.
 */
export async function writeLocalDoc(mail, markdown) {
  if (process.env.DOC_WRITE_LOCAL !== '1') return null;
  try {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const d = new Date(mail.date || mail.receivedAt);
    const dir = path.join(process.cwd(), 'data', 'mails', d.toISOString().slice(0, 7));
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, buildFilename(mail));
    await fs.writeFile(file, markdown, 'utf8');
    return file;
  } catch (e) {
    console.warn('[docgen] 로컬 저장 실패:', e.message);
    return null;
  }
}
