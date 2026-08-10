/**
 * 메일 1통 = Claude 1회 호출.
 * 분류·번역·요약·답변필요·기한을 한 번에 받는다 — 같은 원문을 여러 번 보내지 않기 위함.
 *
 * 고정 지시문은 system 에 두고 cache_control 을 걸어 프롬프트 캐시를 태운다.
 * (Opus 5 기준 최소 캐시 512 토큰 — 아래 지시문은 이를 넘긴다)
 */
import { client, resolveModel, extractJson, truncateBody } from './client';

const SCHEMA = {
  type: 'object',
  properties: {
    classification: {
      type: 'string',
      enum: ['b2b', 'inquiry', 'partner', 'newsletter', 'ad', 'system', 'unknown'],
    },
    lang: { type: 'string', enum: ['en', 'ko', 'ja', 'zh', 'other'] },
    translationSubject: { type: 'string' },
    translationBody: { type: 'string' },
    topic: { type: 'string' },
    summary: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    intent: { type: 'string' },
    needsReply: { type: 'boolean' },
    replyReason: { type: 'string' },
    deadline: { type: 'string' },
    deadlineText: { type: 'string' },
    deadlineType: {
      type: 'string',
      enum: ['reply_by', 'quote_due', 'meeting', 'payment', 'contract', 'event', 'other', 'none'],
    },
    urgency: { type: 'string', enum: ['high', 'mid', 'low'] },
    suggestedAction: { type: 'string' },
  },
  required: [
    'classification', 'lang', 'translationSubject', 'translationBody',
    'topic', 'summary', 'keyPoints', 'intent',
    'needsReply', 'replyReason', 'deadline', 'deadlineText', 'deadlineType',
    'urgency', 'suggestedAction',
  ],
  additionalProperties: false,
};

const SYSTEM = `당신은 한국 가구·리빙 기업(요기보)의 해외영업 담당자를 돕는 메일 분석 도우미입니다.
회사로 들어온 메일 1통을 받아 분류·번역·요약하고, 답변이 필요한지와 기한이 있는지를 판정합니다.

## 분류 기준 (classification)
- b2b: 실제 거래·납품·유통·대리점·OEM 관련. 이미 거래 중이거나 구체적 거래 의사가 있는 메일.
- inquiry: 제품·가격·재고·견적·샘플 문의. 아직 거래 전이지만 실명·회사가 특정되는 실제 문의.
- partner: 제휴·협업·입점·미디어·행사 참가 제안 중 검토 가치가 있는 것.
- newsletter: 정기 소식지·업계 뉴스·구독 콘텐츠. 개별 응답이 필요 없는 것.
- ad: 불특정 다수 대상 홍보·영업 메일. 서비스 판매 권유(SEO/마케팅/개발 외주 등), 대량 발송 스팸.
- system: 자동 발송 알림, 발송 실패, 인증 코드, 시스템 통지.
- unknown: 위 어디에도 해당하지 않거나 내용이 불충분한 경우.

**핵심 판단**: 발신자가 "우리에게 무언가를 팔려는" 메일은 ad 입니다.
발신자가 "우리 제품을 사거나 취급하려는" 메일은 b2b 또는 inquiry 입니다. 이 둘을 절대 혼동하지 마세요.
개인 이름과 회사가 명시되고 우리 제품을 구체적으로 언급하면 대량 발송이 아닙니다.

## 번역 (translationSubject / translationBody)
- 원문이 한국어면 번역하지 말고 원문을 그대로 넣습니다.
- 그 외 언어는 자연스러운 한국어로 번역합니다. 요약이 아니라 **전문 번역**입니다. 문단 구조를 유지하세요.
- 제품명·회사명·인명·모델명·수치·단위·통화는 원문 표기를 유지하고 필요하면 괄호로 보충합니다.
- 서명·면책조항·수신거부 안내 등 정형 문구는 "[서명·면책조항 생략]" 한 줄로 대체합니다.

## 요약
- topic: 이 메일이 무엇에 관한 것인지 한 줄(공백 포함 40자 이내).
- summary: 담당자가 이것만 읽고 판단할 수 있게 2~4문장.
- keyPoints: 수량·금액·모델·일정·조건 등 구체적 사실 위주로 2~5개. 추측을 넣지 마세요.
- intent: 발신자가 우리에게 원하는 것 한 줄.

## 답변 필요 여부 (needsReply)
true 로 판정하는 경우: 질문이 있다, 자료·견적·샘플을 요청한다, 일정 확정을 요구한다,
회신을 명시적으로 기다린다, 승인·확인이 필요하다.
false 로 판정하는 경우: 단순 통지·안내, 뉴스레터, 광고, 자동발송, 이미 종결된 내용.
replyReason 에는 그 근거를 한 줄로 씁니다.

## 기한 (deadline / deadlineText / deadlineType)
- deadline: 기한을 **YYYY-MM-DD** 형식으로. 기한이 없으면 빈 문자열 "".
- 본문에 명시된 날짜를 우선합니다. "다음 주 금요일", "3영업일 내" 같은 상대 표현은
  메일 수신일 기준으로 환산해 계산하세요.
- 기한이 없지만 회신을 기다리는 메일이라면 deadline 은 "" 로 두고 urgency 로만 표현합니다.
  기한을 임의로 만들어내지 마세요.
- deadlineText: 원문의 기한 표현을 그대로 인용(예: "by end of this month"). 없으면 "".
- deadlineType: 기한의 성격. 기한이 없으면 "none".

## 긴급도 (urgency)
- high: 3일 이내 기한이거나, 거래 성사/사고 대응 등 지연 시 손실이 명확한 건.
- mid: 회신이 필요하지만 여유가 있는 건.
- low: 참고용, 답변 불필요.

## suggestedAction
담당자가 다음에 할 일 한 줄(예: "MOQ와 FOB 단가를 회신", "샘플 발송 가능일 확인 후 회신").
답변이 불필요하면 "조치 불필요".

모든 출력 필드는 **한국어**로 작성합니다(translationSubject/translationBody 포함).
사실만 쓰고, 원문에 없는 내용을 추론해 채워 넣지 마세요.`;

function buildUserPrompt(mail) {
  const received = new Date(mail.date || mail.receivedAt);
  const fmt = (d) => new Date(d).toISOString().slice(0, 10);
  const to = (mail.to || []).map((t) => t.address).join(', ');
  const att = (mail.attachments || []).map((a) => `${a.filename} (${a.contentType})`).join(', ');

  return `아래 메일을 분석하세요.

[수신일] ${fmt(received)} (요일 계산·상대 날짜 환산의 기준일)
[발신] ${mail.from?.name || ''} <${mail.from?.address || ''}>
[수신] ${to || '-'}
[제목] ${mail.subject || ''}
[첨부] ${att || '없음'}
[수신거부 헤더] ${mail.headers?.listUnsubscribe ? '있음' : '없음'}

===== 본문 시작 =====
${truncateBody(mail.raw?.text || '(본문 없음)')}
===== 본문 끝 =====`;
}

/** "YYYY-MM-DD" → Date (KST 정오로 고정해 시간대 밀림 방지). 빈 값이면 null */
function parseDeadline(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {{ classification, classifiedBy, lang, translation, analysis }}
 */
export async function analyzeMail(mail, settings = {}) {
  const model = resolveModel(settings);
  const anthropic = client();

  const res = await anthropic.messages.create({
    model,
    max_tokens: 16000, // Opus 5 는 thinking 이 기본 ON — thinking+본문 합산 상한이라 넉넉히
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: buildUserPrompt(mail) }],
  });

  const r = extractJson(res);
  const now = new Date();

  return {
    classification: r.classification,
    classifiedBy: 'ai',
    lang: r.lang,
    translation: {
      subject: r.translationSubject,
      body: r.translationBody,
      translatedAt: now,
      model,
    },
    analysis: {
      topic: r.topic,
      summary: r.summary,
      keyPoints: r.keyPoints || [],
      intent: r.intent,
      needsReply: Boolean(r.needsReply),
      replyReason: r.replyReason,
      deadline: parseDeadline(r.deadline),
      deadlineText: r.deadlineText || '',
      deadlineType: r.deadlineType === 'none' ? null : r.deadlineType,
      urgency: r.urgency,
      suggestedAction: r.suggestedAction,
      analyzedAt: now,
      method: 'ai',
      model,
      usage: {
        input: res.usage?.input_tokens ?? 0,
        output: res.usage?.output_tokens ?? 0,
        cacheRead: res.usage?.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage?.cache_creation_input_tokens ?? 0,
      },
    },
  };
}
