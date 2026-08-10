/**
 * 라벨 맵 — DB·CSS 클래스는 영문 값, 화면 표시는 한글.
 * 새 상태값을 추가할 때는 반드시 여기에도 등록할 것.
 */

/** 메일 분류 */
export const CLASSIFICATIONS = ['b2b', 'inquiry', 'partner', 'newsletter', 'ad', 'system', 'unknown'];
export const CLASSIFICATION_LABELS = {
  b2b: 'B2B 거래',
  inquiry: '문의·견적',
  partner: '제휴·협업',
  newsletter: '뉴스레터',
  ad: '광고',
  system: '자동발송',
  unknown: '미분류',
};
export const classificationLabel = (v) => CLASSIFICATION_LABELS[v] || v || '미분류';

/** 처리 상태 */
export const STATUSES = ['new', 'reviewing', 'replied', 'archived', 'ignored'];
export const STATUS_LABELS = {
  new: '신규',
  reviewing: '확인중',
  replied: '답변완료',
  // '보관' 은 서류를 치운다는 뜻으로 읽혀 무엇을 한 것인지 알기 어렵다.
  // 실제 의미는 '읽고 판단이 끝났다' 이므로 그대로 적는다.
  archived: '검토 완료',
  ignored: '무시',
};
export const statusLabel = (v) => STATUS_LABELS[v] || v || '신규';

/** 긴급도 */
export const URGENCIES = ['high', 'mid', 'low'];
export const URGENCY_LABELS = { high: '높음', mid: '보통', low: '낮음' };
export const urgencyLabel = (v) => URGENCY_LABELS[v] || v || '-';

/** 언어 */
export const LANG_LABELS = { en: '영어', ko: '한국어', ja: '일본어', zh: '중국어', other: '기타' };
export const langLabel = (v) => LANG_LABELS[v] || v || '-';

/** 기한 종류 */
export const DEADLINE_TYPE_LABELS = {
  reply_by: '회신 기한',
  quote_due: '견적 마감',
  meeting: '미팅 일정',
  payment: '결제·정산',
  contract: '계약·서명',
  event: '행사·마감',
  other: '기타',
};
export const deadlineTypeLabel = (v) => DEADLINE_TYPE_LABELS[v] || v || '기한';

/** AI 분석 대상으로 볼 분류 (규칙 필터에서 광고로 확정된 건 제외) */
export const ANALYZE_TARGETS = ['b2b', 'inquiry', 'partner', 'unknown'];

/**
 * D-day 계산 — KST 기준 날짜 차이.
 * 반환: 음수=지남, 0=오늘, 양수=남은 일수
 */
export function dday(deadline, now = new Date()) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const toKstDay = (x) => Math.floor((x.getTime() + 9 * 3600 * 1000) / 86400000);
  return toKstDay(d) - toKstDay(now);
}

export function ddayLabel(deadline, now = new Date()) {
  const n = dday(deadline, now);
  if (n === null) return '';
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** D-day 를 CSS 배지 클래스로 (globals.css 의 .badge.* 와 대응) */
export function ddayTone(deadline, now = new Date()) {
  const n = dday(deadline, now);
  if (n === null) return 'low';
  if (n < 0) return 'overdue';
  if (n <= 2) return 'high';
  if (n <= 7) return 'mid';
  return 'low';
}
