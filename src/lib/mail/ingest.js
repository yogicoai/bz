/**
 * 수집 파이프라인 오케스트레이션.
 *   IMAP fetch → parse → 규칙 필터 → 저장 → (선택) AI 분석 → 정리 문서
 *
 * 한 통이 실패해도 전체가 멈추지 않도록 통별로 try/catch 한다.
 * lastUid 는 성공적으로 처리한 최대 UID 까지만 전진시켜, 중단 시 다음 회차에 이어받는다.
 */
import { getSettings } from '@/lib/settings';
import { fetchNew, fetchRecent } from './imap';
import { threadKey } from './thread.js';
import { parseMessage } from './parse';
import { ruleClassify, shouldAnalyze } from './classify';
import { localAnalyze } from './localAnalyze';
import {
  groupNameFromFolder, isGroupFolder, learnSenderGroups,
  suggestGroupBySender, suggestGroupByName, listGroups,
} from './groups';
import { insertMail, getSyncState, setSyncState, findUnanalyzed } from './store';
import { analyzeMail } from '@/lib/ai/analyze';
import { buildMarkdown, writeLocalDoc } from './docgen';
import { collections } from '@/lib/db';

/** 메일 1통 AI 분석 → 결과와 정리 문서를 DB 에 반영 */
export async function analyzeAndSave(mailDoc, settings) {
  const result = await analyzeMail(mailDoc, settings);
  const merged = { ...mailDoc, ...result };

  const markdown = buildMarkdown(merged);
  const localPath = await writeLocalDoc(merged, markdown);

  const mails = await collections.mails();
  await mails.updateOne(
    { _id: mailDoc._id },
    {
      $set: {
        classification: result.classification,
        classifiedBy: 'ai',
        lang: result.lang,
        translation: result.translation,
        analysis: result.analysis,
        doc: markdown,
        docPath: localPath,
        updatedAt: new Date(),
      },
    },
  );
  return merged;
}

/** 폴더 하나를 수집한다. 실패해도 다른 폴더는 계속 돌 수 있도록 예외를 밖으로 던진다. */
async function ingestFolder(settings, folder, { limit, recent, learned, knownGroups = [] }) {
  const state = await getSyncState(folder);
  const stat = {
    folder,
    group: isGroupFolder(folder) ? groupNameFromFolder(folder) : null,
    fetched: 0, inserted: 0, duplicate: 0, ruleFiltered: 0, grouped: 0,
    errors: [],
  };

  const batch = recent
    ? await fetchRecent(settings, { folder, limit: Number(recent) })
    : await fetchNew(settings, { folder, sinceUid: state.lastUid || 0, limit });

  stat.fetched = batch.messages.length;
  let maxUid = state.lastUid || 0;
  const inserted = [];

  for (const msg of batch.messages) {
    try {
      const parsed = await parseMessage(msg.source, {
        uid: msg.uid,
        folder,
        internalDate: msg.internalDate,
      });

      // 거래처 폴더에서 온 메일은 폴더명이 곧 확정된 그룹이다
      if (stat.group) {
        parsed.group = stat.group;
        parsed.groupBy = 'folder';
      } else if (settings.autoGroup !== false) {
        // 미분류함(INBOX) 메일은 두 단서로 거래처를 추정한다 — 둘 다 API 호출 없음.
        //   1순위 발신자 이력  (정확 — 같은 곳에서 온 메일은 같은 거래처)
        //   2순위 제목의 거래처명 (실무 메일 제목엔 거래처가 그대로 적혀 있는 경우가 많다)
        const s = (learned && suggestGroupBySender(parsed, learned))
          || suggestGroupByName(parsed, knownGroups);
        if (s) {
          parsed.group = s.group;
          parsed.groupBy = s.by === 'name' ? `name:${s.matched}` : `sender:${s.by}`;
          if (s.count) parsed.groupConfidence = s.count;
          stat.grouped++;
        }
      }

      // 스레드 키는 거래처가 정해진 뒤에 만든다.
      // 같은 제목이라도 거래처가 다르면 다른 대화이므로 순서가 중요하다.
      parsed.threadKey = threadKey(parsed);

      // 규칙 필터 — AI 비용이 드는 분석 전에 광고·자동발송을 걸러낸다
      const rule = ruleClassify(parsed, settings);
      if (rule) {
        parsed.classification = rule.classification;
        parsed.classifiedBy = 'rule';
        parsed.ruleReason = rule.reason;
        if (rule.confident) stat.ruleFiltered++;
      }

      // 로컬 1차 분석 — API 호출 없이(무료) 답변필요·기한 후보를 잡아둔다
      parsed.analysis = localAnalyze(parsed);

      const r = await insertMail(parsed);
      if (r === 'inserted') {
        stat.inserted++;
        if (shouldAnalyze(rule)) inserted.push(parsed.messageId);
      } else {
        stat.duplicate++;
      }

      maxUid = Math.max(maxUid, msg.uid);
    } catch (e) {
      stat.errors.push({ uid: msg.uid, error: String(e?.message || e) });
      // 파싱 실패분에서 멈추면 영원히 재시도하므로 UID 는 전진시킨다
      maxUid = Math.max(maxUid, msg.uid);
    }
  }

  await setSyncState(folder, {
    lastUid: maxUid,
    lastSyncAt: new Date(),
    lastError: stat.errors.length ? `${stat.errors.length}통 처리 실패` : null,
  });

  return { stat, inserted };
}

/**
 * 메일 수집 실행 — 미분류함(INBOX)과 거래처 폴더들을 함께 돈다.
 * @param {{ limit?, analyze?, recent?, folders? }} opts
 *   recent 지정 시 lastUid 를 무시하고 최근 N통을 가져온다(최초 세팅·테스트용).
 */
export async function runIngest(opts = {}) {
  const settings = await getSettings();
  const limit = Number(opts.limit) || Number(settings.fetchLimit) || 50;
  const doAnalyze = opts.analyze ?? settings.autoAnalyze;

  // 수집 대상: 미분류함 + 설정에서 고른 거래처 폴더들
  const folders = opts.folders?.length
    ? opts.folders
    : [settings.imapFolder || 'INBOX', ...(settings.imapFolders || [])];
  const unique = [...new Set(folders.filter(Boolean))];

  // 발신자→그룹 이력은 폴더를 돌기 전에 한 번만 만든다
  let learned = null;
  let knownGroups = [];
  if (settings.autoGroup !== false) {
    try { learned = await learnSenderGroups(); } catch { /* 이력 없이도 수집은 된다 */ }
    try {
      // 폴더에서 온 그룹 + 설정에 고른 폴더명 (아직 수집 전이어도 이름 매칭은 가능하도록)
      const existing = (await listGroups()).map((g) => g.group);
      const fromSettings = (settings.imapFolders || []).map(groupNameFromFolder);
      knownGroups = [...new Set([...existing, ...fromSettings])].filter(Boolean);
    } catch { /* 그룹 목록 없이도 수집은 된다 */ }
  }

  const stats = {
    folders: [],
    fetched: 0, inserted: 0, duplicate: 0,
    ruleFiltered: 0, grouped: 0, analyzed: 0,
    learnedSenders: learned?.size || 0,
    knownGroups: knownGroups.length,
    errors: [],
    startedAt: new Date(),
  };

  const insertedIds = [];
  for (const folder of unique) {
    try {
      const { stat, inserted } = await ingestFolder(settings, folder, {
        limit, recent: opts.recent, learned, knownGroups,
      });
      stats.folders.push(stat);
      stats.fetched += stat.fetched;
      stats.inserted += stat.inserted;
      stats.duplicate += stat.duplicate;
      stats.ruleFiltered += stat.ruleFiltered;
      stats.grouped += stat.grouped;
      stats.errors.push(...stat.errors.map((e) => ({ folder, ...e })));
      insertedIds.push(...inserted);
    } catch (e) {
      // 한 폴더가 죽어도 나머지는 계속 수집한다
      const error = String(e?.message || e);
      stats.folders.push({ folder, failed: true, error });
      stats.errors.push({ folder, error });
      await setSyncState(folder, { lastError: error, lastSyncAt: new Date() });
    }
  }

  // 폴더를 전부 못 읽었으면 설정 문제이므로 실패로 알린다
  if (unique.length && stats.folders.every((f) => f.failed)) {
    throw new Error(`IMAP 수집 실패: ${stats.folders[0].error}`);
  }

  // AI 분석 — 실패해도 수집 자체는 성공으로 처리한다(재분석 가능)
  if (doAnalyze && insertedIds.length) {
    const mails = await collections.mails();
    for (const messageId of insertedIds) {
      try {
        const doc = await mails.findOne({ messageId });
        if (!doc || doc.analysis?.method === 'ai') continue;
        await analyzeAndSave(doc, settings);
        stats.analyzed++;
      } catch (e) {
        stats.errors.push({ messageId, error: `분석 실패: ${String(e?.message || e)}` });
      }
    }
  }

  stats.finishedAt = new Date();
  stats.ms = stats.finishedAt - stats.startedAt;
  return stats;
}

/** 수집과 별개로, 아직 분석되지 않은 메일을 처리 (분석 실패 복구용) */
export async function runPendingAnalysis(limit = 10) {
  const settings = await getSettings();
  const pending = await findUnanalyzed(limit);
  const stats = { total: pending.length, analyzed: 0, errors: [] };

  for (const doc of pending) {
    try {
      await analyzeAndSave(doc, settings);
      stats.analyzed++;
    } catch (e) {
      stats.errors.push({ messageId: doc.messageId, error: String(e?.message || e) });
    }
  }
  return stats;
}
