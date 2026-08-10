/**
 * 설정 — Mongo 싱글톤 도큐먼트(_id:'main') + 환경변수 기본값.
 * 비밀번호류는 저장 시 빈 값이면 기존 값을 유지하고, 조회 시 절대 반환하지 않는다.
 */
import { collections } from './db';

const SETTINGS_ID = 'main';

/** 비밀번호 필드 — 외부로 절대 나가지 않음 */
const SECRET_KEYS = ['imapPass', 'smtpPass'];

/** 저장 가능한 필드 화이트리스트 */
export const ALLOWED_KEYS = [
  'imapHost', 'imapPort', 'imapSecure', 'imapUser', 'imapPass', 'imapFolder', 'imapFolders',
  'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass',
  'mailFromName', 'mailFromAddress',
  'claudeModel',
  'blockedDomains', 'blockedKeywords',
  'fetchLimit', 'autoAnalyze',
  'briefingEmail', 'briefingDays', 'dailyAnalyzeLimit',
];

export function defaults() {
  return {
    // 수신
    imapHost: process.env.IMAP_HOST || '',
    imapPort: Number(process.env.IMAP_PORT) || 993,
    imapSecure: String(process.env.IMAP_SECURE) !== 'false',
    imapUser: process.env.IMAP_USER || '',
    imapPass: process.env.IMAP_PASS || '',

    // 새 메일이 들어오는 폴더 (분류 대상)
    imapFolder: process.env.IMAP_FOLDER || 'INBOX',
    // 함께 수집할 거래처 폴더들 — 대표님이 수동 분류해 둔 '내 메일함' 하위 폴더.
    // 이 폴더의 메일이 "이 발신자는 이 거래처" 를 알려주는 학습 데이터가 된다.
    imapFolders: [],

    // 발신자 이력으로 거래처 폴더를 자동 추천/지정할지
    autoGroup: true,

    // 발신
    smtpHost: process.env.SMTP_HOST || 'wsmtp.ecount.com',
    smtpPort: Number(process.env.SMTP_PORT) || 465,
    smtpSecure: String(process.env.SMTP_SECURE) !== 'false',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    mailFromName: process.env.MAIL_FROM_NAME || '요기보',
    mailFromAddress: process.env.MAIL_FROM_ADDRESS || '',

    // AI
    claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-5',

    // 규칙 필터 — 광고로 확정할 발신 도메인/제목 키워드
    blockedDomains: [],
    blockedKeywords: ['(광고)', '[광고]', '무료체험', 'unsubscribe'],

    // 수집
    fetchLimit: 50,      // 1회 수집 시 최대 통수
    // 수집 직후 AI 분석(유료)까지 자동 실행할지. 기본은 꺼둔다 —
    // 로컬 1차 분석(무료)으로 답변필요·기한을 먼저 잡고, 필요한 메일만 골라 돌리는 것이 기본 동선.
    autoAnalyze: false,

    // 일일 브리핑 — 하루 1회 크론(/api/cron/daily)이 사용
    briefingEmail: '',      // 비우면 메일 발송 없이 화면에서만 확인
    briefingDays: 1,        // 브리핑에 담을 기간(일). 월요일에 주말치까지 보려면 3
    dailyAnalyzeLimit: 20,  // 하루에 AI 요약할 최대 통수 (비용 상한)
  };
}

/** 내부용 — 비밀번호 포함한 전체 설정 (서버 코드에서만 사용) */
export async function getSettings() {
  const col = await collections.settings();
  const doc = await col.findOne({ _id: SETTINGS_ID });
  const merged = { ...defaults(), ...(doc || {}) };
  delete merged._id;
  return merged;
}

/** 화면 전달용 — 비밀번호는 설정 여부(boolean)로만 */
export async function getPublicSettings() {
  const s = await getSettings();
  const out = { ...s };
  for (const k of SECRET_KEYS) {
    out[`${k}Set`] = Boolean(s[k]);
    delete out[k];
  }
  return out;
}

export async function saveSettings(patch = {}) {
  const col = await collections.settings();
  const update = {};
  for (const k of ALLOWED_KEYS) {
    if (!(k in patch)) continue;
    let v = patch[k];
    // 빈 비밀번호는 "변경 없음" 으로 간주 — 기존 값을 지우지 않는다
    if (SECRET_KEYS.includes(k) && !v) continue;
    if (['imapPort', 'smtpPort', 'fetchLimit', 'briefingDays', 'dailyAnalyzeLimit'].includes(k)) {
      v = Number(v) || defaults()[k];
    }
    if (k === 'imapSecure' || k === 'smtpSecure' || k === 'autoAnalyze') v = Boolean(v);
    if (k === 'blockedDomains' || k === 'blockedKeywords') {
      v = Array.isArray(v)
        ? v
        : String(v || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    }
    update[k] = v;
  }
  update.updatedAt = new Date();
  await col.updateOne({ _id: SETTINGS_ID }, { $set: update }, { upsert: true });
  return getPublicSettings();
}
