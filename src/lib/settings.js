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
  'blockedDomains', 'blockedKeywords', 'systemSenders',
  'imapAccounts', 'retiredGroups',
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
    claudeModel: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',

    // 규칙 필터 — 광고로 확정할 발신 도메인/제목 키워드
    blockedDomains: [],
    blockedKeywords: ['(광고)', '[광고]', '무료체험', 'unsubscribe'],
    // 사내 자동화가 보내는 알림 주소 — 광고가 아니라 자동발송(system)으로 라벨한다.
    // 제목이 매번 달라 키워드로 못 잡고, gmail 주소라 도메인 차단도 쓸 수 없다.
    systemSenders: [],

    /**
     * 여러 메일함을 함께 수집할 때 쓰는 계정 목록.
     *
     * **비어 있으면 위의 imapHost/imapUser/… 한 계정만 쓴다** — 기존 설치는
     * 이 값을 건드리지 않는 한 동작이 조금도 바뀌지 않는다.
     * 계정을 하나라도 등록하면 그 목록이 수집 대상이 된다.
     *
     * 각 항목: { id, label, host, port, secure, user, pass, folders[], enabled }
     * pass 는 화면으로 절대 반환하지 않는다(getPublicSettings 에서 제거).
     */
    imapAccounts: [],

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
  // 계정별 비밀번호도 절대 내보내지 않는다 — 설정 여부만 알려준다
  out.imapAccounts = (s.imapAccounts || []).map(({ pass, ...rest }) => ({
    ...rest,
    passSet: Boolean(pass),
  }));
  return out;
}

/**
 * 수집 대상 계정 목록 — 코드 전체가 여기만 보고 돌게 한다.
 *
 * 계정을 등록하지 않은 설치(대표님)에서는 기존 단일 계정을 그대로 감싸
 * 하나짜리 목록으로 돌려주므로 동작이 바뀌지 않는다.
 * id 를 'main' 으로 고정해, 이미 쌓인 sync_state·메일과 이어진다.
 */
export function accountsOf(settings = {}) {
  const list = (settings.imapAccounts || []).filter((a) => a.enabled !== false && a.host && a.user);
  if (list.length) return list;

  return [{
    id: 'main',
    label: settings.imapUser || '메일 계정',
    host: settings.imapHost || '',
    port: Number(settings.imapPort) || 993,
    secure: settings.imapSecure !== false,
    user: settings.imapUser || '',
    pass: settings.imapPass || '',
    folders: [settings.imapFolder || 'INBOX', ...(settings.imapFolders || [])].filter(Boolean),
    enabled: true,
  }];
}

/** 계정 하나를 IMAP 함수들이 기대하는 settings 모양으로 바꾼다 */
export function accountAsSettings(account, settings = {}) {
  return {
    ...settings,
    imapHost: account.host,
    imapPort: account.port,
    imapSecure: account.secure,
    imapUser: account.user,
    imapPass: account.pass,
  };
}

/**
 * 계정 목록을 저장 가능한 형태로 다듬는다.
 *
 * 비밀번호는 화면으로 나가지 않으므로, 돌아온 값에 비밀번호가 없으면
 * **같은 id 의 기존 비밀번호를 유지한다**. 그러지 않으면 사용자가 라벨만
 * 고쳐 저장했을 때 비밀번호가 통째로 지워져 수집이 멈춘다.
 */
function normalizeAccounts(incoming, existing = [], legacy = {}) {
  const prev = new Map((existing || []).map((a) => [a.id, a]));
  const used = new Set();

  return (Array.isArray(incoming) ? incoming : [])
    .map((a, i) => {
      // id 는 sync_state·mails 가 참조하므로 한 번 정해지면 바뀌면 안 된다
      let id = String(a.id || '').trim();
      if (!id || used.has(id)) id = `acc${Date.now().toString(36)}${i}`;
      used.add(id);

      const old = prev.get(id);
      const user = String(a.user || '').trim();
      return {
        id,
        label: String(a.label || '').trim() || user || `계정 ${i + 1}`,
        host: String(a.host || '').trim(),
        port: Number(a.port) || 993,
        secure: a.secure !== false,
        user,
        // 빈 값이면 기존 비밀번호 유지 (화면은 비밀번호를 돌려받지 못한다).
        // 'main' 은 계정 개념이 생기기 전부터 쓰던 그 계정이므로, 계정 목록으로
        // 처음 옮겨질 때 예전 자리(imapPass)에 있던 비밀번호를 그대로 이어받는다.
        // 이게 없으면 설정을 한 번 저장하는 것만으로 수집이 멈춘다.
        pass: a.pass ? String(a.pass) : (old?.pass || (id === 'main' ? (legacy.imapPass || '') : '')),
        folders: Array.isArray(a.folders) ? a.folders.filter(Boolean) : (old?.folders || ['INBOX']),
        enabled: a.enabled !== false,
      };
    })
    .filter((a) => a.host && a.user);
}

export async function saveSettings(patch = {}) {
  const col = await collections.settings();
  const current = await col.findOne({ _id: SETTINGS_ID });
  // 비밀번호가 DB 가 아니라 환경변수에만 있는 설치가 있다(대표님이 그렇다).
  // 계정 목록으로 옮길 때 DB 원본만 보면 비밀번호가 빈 채로 넘어가고,
  // 설정을 한 번 저장하는 것만으로 수집이 멈춘다. 기본값(env)까지 얹어서 본다.
  const legacy = { ...defaults(), ...(current || {}) };
  const update = {};
  for (const k of ALLOWED_KEYS) {
    if (!(k in patch)) continue;
    let v = patch[k];
    // 빈 비밀번호는 "변경 없음" 으로 간주 — 기존 값을 지우지 않는다
    if (SECRET_KEYS.includes(k) && !v) continue;
    if (k === 'imapAccounts') v = normalizeAccounts(v, current?.imapAccounts, legacy);
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
