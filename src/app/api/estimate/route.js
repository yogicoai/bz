/**
 * GET /api/estimate            → AI 분석 대기 전체의 예상 비용
 * GET /api/estimate?id=<메일>  → 그 메일 1통의 예상 비용
 *
 * 전부 로컬 계산이다 — Anthropic API 를 호출하지 않으므로 이 엔드포인트 자체는 무과금.
 */
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { getMail, findUnanalyzed, countUnanalyzed } from '@/lib/mail/store';
import { estimateMailCost, estimateBatchCost, PRICING, USD_KRW } from '@/lib/ai/estimate';
import { DEFAULT_MODEL } from '@/lib/ai/client';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const settings = await getSettings();
    const model = sp.get('model') || settings.claudeModel || DEFAULT_MODEL;

    // 키가 없으면 화면이 동작하지 않을 버튼과 비용을 띄우지 않도록 알려준다
    const apiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);

    const id = sp.get('id');
    if (id) {
      const mail = await getMail(id);
      if (!mail) return NextResponse.json({ ok: false, error: '메일을 찾을 수 없습니다.' }, { status: 404 });
      return NextResponse.json({
        ok: true,
        apiKeySet,
        estimate: estimateMailCost(mail, model),
        pricing: PRICING[model],
        usdKrw: USD_KRW,
      });
    }

    // 대기 전체 — 표본 30통으로 평균을 내고 전체 건수로 환산 (전부 읽지 않기 위함)
    const limit = Math.min(Number(sp.get('limit')) || 30, 100);
    const [sample, pending] = await Promise.all([findUnanalyzed(limit), countUnanalyzed()]);

    const sampleEstimate = estimateBatchCost(sample, model);
    const perMail = sample.length ? sampleEstimate.usd / sample.length : 0;

    return NextResponse.json({
      ok: true,
      apiKeySet,
      pending,
      sampled: sample.length,
      perMailKrw: Math.round(perMail * USD_KRW),
      totalKrw: Math.round(perMail * pending * USD_KRW),
      model,
      modelLabel: sampleEstimate.modelLabel,
      pricing: PRICING[model],
      usdKrw: USD_KRW,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
