/**
 * GET /api/cron/daily — 하루 1회 실행.
 *
 *   1) 새 메일 수집 (무료)
 *   2) 제안 메일만 골라 AI 요약 (유료 · 상한 있음)
 *   3) 브리핑 메일 발송 (설정에서 켠 경우)
 *
 * 광고·자동발송은 2단계 대상에서 제외되므로 하루 비용이 제안 건수만큼으로 묶인다.
 * Vercel Cron 은 Authorization: Bearer $CRON_SECRET 을 자동으로 붙인다.
 * 수동 호출: /api/cron/daily?key=<CRON_SECRET>
 */
import { NextResponse } from 'next/server';
import { runIngest, analyzeAndSave } from '@/lib/mail/ingest';
import { findUnanalyzed } from '@/lib/mail/store';
import { getSettings } from '@/lib/settings';
import { getBriefing, renderBriefingText, PROPOSAL_CLASSES } from '@/lib/briefing';
import { sendBriefing } from '@/lib/email/smtp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if ((req.headers.get('authorization') || '') === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('key') === secret;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: '권한 없음' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const result = { startedAt: new Date() };

  try {
    const settings = await getSettings();

    // 1) 수집 — AI 는 여기서 돌리지 않는다(아래에서 제안 메일만 선별).
    //    메일 서버가 잠깐 죽어도 이미 받아둔 메일의 요약·브리핑은 계속되어야 하므로
    //    수집 실패를 치명적으로 다루지 않는다.
    try {
      result.ingest = await runIngest({ analyze: false });
    } catch (e) {
      result.ingest = { failed: true, error: String(e?.message || e) };
      console.error('[cron/daily] 수집 실패 — 요약·브리핑은 계속합니다:', result.ingest.error);
    }

    // 2) 제안 메일만 요약. 하루 상한을 두어 비용이 튀지 않게 한다.
    const cap = Math.min(Number(sp.get('max')) || Number(settings.dailyAnalyzeLimit) || 20, 50);
    const pending = await findUnanalyzed(cap, { classification: { $in: PROPOSAL_CLASSES } });

    result.analyze = { target: pending.length, done: 0, errors: [] };
    for (const doc of pending) {
      try {
        await analyzeAndSave(doc, settings);
        result.analyze.done++;
      } catch (e) {
        result.analyze.errors.push({ messageId: doc.messageId, error: String(e?.message || e) });
      }
    }

    // 3) 브리핑 — 메일 발송은 설정에서 켠 경우에만
    const briefing = await getBriefing({ days: Number(settings.briefingDays) || 1 });
    result.briefing = {
      total: briefing.total ?? 0,
      needsReply: briefing.needsReply ?? 0,
      withDeadline: briefing.withDeadline ?? 0,
    };

    if (settings.briefingEmail && briefing.connected) {
      // 새 제안이 없는 날은 보내지 않는다 (빈 메일로 수신함을 채우지 않기 위해)
      if (briefing.total > 0) {
        const baseUrl = process.env.APP_BASE_URL || '';
        const text = renderBriefingText(briefing, baseUrl);
        const sent = await sendBriefing({
          to: settings.briefingEmail,
          subject: `[제안 브리핑] ${briefing.date} · ${briefing.total}건 (답변 필요 ${briefing.needsReply})`,
          text,
        });
        result.briefing.sent = sent;
      } else {
        result.briefing.sent = { skipped: '새 제안 없음' };
      }
    }

    result.finishedAt = new Date();
    result.ms = result.finishedAt - result.startedAt;
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e), partial: result },
      { status: 500 },
    );
  }
}
