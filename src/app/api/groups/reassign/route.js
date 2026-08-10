/**
 * POST /api/groups/reassign  { limit?, dryRun? }
 *
 * 이미 수집된 메일 중 거래처가 비어 있는 것을 다시 분류한다.
 * 거래처 폴더를 나중에 추가로 수집해서 학습 데이터가 늘었을 때,
 * 앞서 들어온 미분류함 메일에도 소급 적용하기 위한 것이다.
 *
 * 전부 로컬 계산이라 API 호출·과금이 없다.
 * 사람이 직접 지정한 것(groupBy:'manual')과 폴더에서 온 것은 건드리지 않는다.
 */
import { NextResponse } from 'next/server';
import { collections } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import {
  learnSenderGroups, suggestGroupBySender, suggestGroupByName,
  listGroups, groupNameFromFolder,
} from '@/lib/mail/groups';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req) {
  try {
    let body = {};
    try { body = await req.json(); } catch { /* 기본값 사용 */ }
    const limit = Math.min(Number(body.limit) || 500, 5000);
    const dryRun = body.dryRun === true;

    const settings = await getSettings();
    const mails = await collections.mails();

    const learned = await learnSenderGroups();
    const existing = (await listGroups()).map((g) => g.group);
    const fromSettings = (settings.imapFolders || []).map(groupNameFromFolder);
    const knownGroups = [...new Set([...existing, ...fromSettings])].filter(Boolean);

    const targets = await mails
      .find({ group: null, groupBy: { $ne: 'manual' } })
      .sort({ receivedAt: -1 })
      .limit(limit)
      .project({ subject: 1, from: 1, 'raw.text': 1 })
      .toArray();

    const result = { scanned: targets.length, matched: 0, bySender: 0, byName: 0, dryRun, samples: [] };

    for (const m of targets) {
      const sender = suggestGroupBySender(m, learned);
      const s = sender || suggestGroupByName(m, knownGroups);
      if (!s) continue;

      result.matched++;
      if (sender) result.bySender++; else result.byName++;
      if (result.samples.length < 12) {
        result.samples.push({
          subject: (m.subject || '').slice(0, 52),
          group: s.group,
          by: s.by === 'name' ? `제목:${s.matched}` : `발신자:${s.by}`,
        });
      }

      if (!dryRun) {
        await mails.updateOne(
          { _id: m._id },
          {
            $set: {
              group: s.group,
              groupBy: s.by === 'name' ? `name:${s.matched}` : `sender:${s.by}`,
              updatedAt: new Date(),
            },
          },
        );
      }
    }

    return NextResponse.json({ ok: true, learnedSenders: learned.size, knownGroups: knownGroups.length, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
