/**
 * 한글 번역만 하는 호출 — 요약·기한 추출 없이.
 *
 * 이미 분류·기한이 잡혀 있는데 번역본만 없는 메일이 많다. 그런 메일에
 * 전체 분석(analyze.js)을 다시 돌리면 이미 있는 판단을 지우고 다시 만들면서
 * 값도 두 배로 든다. 여기서는 **번역문만** 만들어 translation 필드만 채운다.
 *
 * 분석 결과(analysis)는 건드리지 않는다 — 사람이 확인한 답변필요·기한이
 * 번역 한 번 눌렀다고 바뀌면 안 된다.
 */
import { client, resolveModel, extractJson } from './client';
import { bodyForPrompt } from './analyze';

const SYSTEM = `당신은 한국 기업의 해외영업 담당자를 돕는 번역가입니다.
받은 업무 메일을 **한국어로 번역**합니다.

규칙:
- 의미를 바꾸지 말고, 빠뜨리지도 말 것. 요약하지 말 것.
- 금액·수량·날짜·품번·회사명은 원문 표기를 그대로 유지할 것 (USD 1,200 → USD 1,200).
- 업무 메일투의 자연스러운 한국어로 쓸 것. 직역체로 어색하게 만들지 말 것.
- 인용된 이전 대화가 섞여 있으면 그 부분도 순서대로 번역할 것.
- 서명·연락처 블록은 원문 그대로 두어도 좋다.
- 원문이 이미 한국어면 그대로 반환할 것.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lang: { type: 'string', enum: ['en', 'ko', 'ja', 'zh', 'other'] },
    translationSubject: { type: 'string', description: '제목의 한국어 번역' },
    translationBody: { type: 'string', description: '본문 전체의 한국어 번역' },
  },
  required: ['lang', 'translationSubject', 'translationBody'],
  additionalProperties: false,
};

export async function translateMail(mail, settings = {}) {
  const model = resolveModel(settings);
  const anthropic = client();

  const body = bodyForPrompt(mail.raw?.text || '');
  if (!body.trim() && !mail.subject) {
    throw new Error('번역할 본문이 없습니다.');
  }

  const res = await anthropic.messages.create({
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: `[제목] ${mail.subject || ''}

===== 본문 시작 =====
${body || '(본문 없음)'}
===== 본문 끝 =====`,
    }],
  });

  const r = extractJson(res);
  return {
    lang: r.lang,
    translation: {
      subject: r.translationSubject,
      body: r.translationBody,
      translatedAt: new Date(),
      model,
      // 요약 없이 번역만 돌린 것임을 남긴다 — 나중에 요약을 붙일지 판단할 근거
      method: 'translate-only',
      usage: {
        input: res.usage?.input_tokens ?? 0,
        output: res.usage?.output_tokens ?? 0,
        cacheRead: res.usage?.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage?.cache_creation_input_tokens ?? 0,
      },
    },
  };
}
