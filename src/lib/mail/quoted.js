/**
 * 인용부 제거 — 답장이 쌓인 메일에서 "이번에 새로 쓴 부분"만 남긴다.
 *
 * 실무 메일은 Re: 가 20번씩 붙으며 이전 대화가 통째로 따라온다.
 * 이걸 걸러내지 않으면 여러 판정이 한꺼번에 틀어진다.
 *   - 언어 감지: 인용부의 영문 헤더(From:/Sent:/mailto:)가 한글보다 많아 한국어 메일이 영어로 잡힘
 *   - 답변 필요: 몇 달 전 인용문의 물음표까지 세어 과대 판정
 *   - 기한 추출: 이미 지난 인용문의 날짜를 이번 기한으로 오인
 *   - 요약 비용: 같은 내용을 매번 다시 읽어 토큰 낭비
 */

/** 인용 시작을 알리는 표식들 — 메일 클라이언트·언어별로 형태가 다르다 */
const QUOTE_MARKERS = [
  /^-{2,}\s*Original Message/im,
  /^-{5,}\s*$/m,
  /^_{10,}\s*$/m,
  /^From:\s.+$\n^Sent:\s/im,
  /^보낸\s?사람:\s/im,
  /^보낸사람:\s/im,
  /^差出人:\s/im,          // 일본어
  /^送信日時:\s/im,
  /^Fra:\s.+$\n^Dato:\s/im, // 덴마크·노르웨이
  /^Von:\s.+$\n^Gesendet:\s/im, // 독일
  /^De:\s.+$\n^Enviado:\s/im,   // 스페인·포르투갈
  /^On .{5,80} wrote:\s*$/im,
  /^\d{4}년 \d{1,2}월 \d{1,2}일.{0,40}작성/im,
];

/**
 * 인용부를 잘라낸 본문을 돌려준다.
 * 잘라낸 결과가 지나치게 짧으면(= 본문 대부분이 인용) 원문을 그대로 쓴다.
 *
 * @param {string} text
 * @param {{ minKeep?: number }} opts minKeep 미만이면 원문 유지 (기본 80자)
 */
export function stripQuoted(text = '', { minKeep = 80 } = {}) {
  const s = String(text);
  if (!s) return '';

  let cut = s.length;
  for (const re of QUOTE_MARKERS) {
    const m = s.match(re);
    // 맨 앞의 표식은 전달(FW) 메일의 헤더일 수 있으므로 최소 위치를 둔다
    if (m && m.index != null && m.index > 40) cut = Math.min(cut, m.index);
  }

  // '>' 로 시작하는 줄이 연속으로 나오는 지점도 인용 시작으로 본다
  const gt = s.search(/^>.*\n^>/m);
  if (gt > 40) cut = Math.min(cut, gt);

  const head = s.slice(0, cut).trim();
  return head.length >= minKeep ? head : s;
}

/** 인용부가 실제로 잘렸는지 (통계·디버깅용) */
export function quotedRatio(text = '') {
  const full = String(text).length;
  if (!full) return 0;
  return 1 - stripQuoted(text).length / full;
}
