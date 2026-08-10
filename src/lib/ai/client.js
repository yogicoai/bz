/**
 * Anthropic 클라이언트 — 호출 시점에 생성(키 미설정 상태로 빌드가 죽지 않도록).
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5';

export function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 미설정 — .env.local 에 설정하세요.');
  }
  return new Anthropic();
}

export function resolveModel(settings) {
  return settings?.claudeModel || process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

/**
 * 응답에서 JSON 본문을 꺼낸다.
 * - refusal: 안전 분류기가 거절한 경우(HTTP 200) — content 를 읽기 전에 먼저 확인해야 한다
 * - max_tokens: 잘린 JSON 을 파싱하면 조용히 틀린 결과가 나오므로 명시적으로 실패시킨다
 */
export function extractJson(res) {
  if (res.stop_reason === 'refusal') {
    throw new Error(`AI 가 요청을 거절했습니다 (${res.stop_details?.category || '사유 미상'}).`);
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('AI 응답이 max_tokens 로 잘렸습니다. 메일이 너무 길거나 max_tokens 를 늘려야 합니다.');
  }
  const block = res.content.find((b) => b.type === 'text');
  if (!block?.text) throw new Error('AI 응답이 비어 있습니다.');
  try {
    return JSON.parse(block.text);
  } catch {
    throw new Error('AI 응답 파싱 실패 (JSON 아님).');
  }
}

/** 긴 본문을 앞·뒤만 남기고 줄인다 — 인사말과 마무리(기한이 자주 여기 있음)를 보존 */
export function truncateBody(text = '', max = 24000) {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.3));
  return `${head}\n\n…[중략: 원문 ${text.length}자 중 일부 생략]…\n\n${tail}`;
}
