/**
 * 수집 파이프라인 오케스트레이션.
 *   IMAP fetch → parse → 규칙 필터 → 저장 → (선택) AI 분석 → 정리 문서
 *
 * 한 통이 실패해도 전체가 멈추지 않도록 통별로 try/catch 한다.
 * lastUid 는 성공적으로 처리한 최대 UID 까지만 전진시켜, 중단 시 다음 회차에 이어받는다.
 */
import { getSettings, accountsOf, accountAsSettings } from '@/lib/settings';
import { fetchNew, fetchRecent, listMailboxes, withOpenAccount } from './imap';
import { threadKey } from './thread.js';
import { parseMessage } from './parse';
import { ruleClassify, shouldAnalyze } from './classify';
import { localAnalyze } from './localAnalyze';
import {
  groupNameFromFolder, isGroupFolder, learnSenderGroups, FREE_MAIL,
  suggestGroupBySender, suggestGroupByName, listGroups,
} from './groups';
import { insertMail, getSyncState, setSyncState, findUnanalyzed } from './store';
import { syncSentReplies, syncTrashed } from './reconcile';
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
/** 수신 계정의 도메인 — 자사 발신 판별 기준 */
function ownDomainOf(settings) {
  const u = (settings?.imapUser || settings?.smtpUser || '').toLowerCase();
  return u.includes('@') ? u.split('@')[1] : '';
}

/**
 * 이 메일을 '우리가 보낸 것'으로 볼지.
 *
 * 회사 도메인(yogico.kr)이면 누가 보냈든 우리 쪽 메일이 맞다.
 * 그런데 Gmail·네이버 같은 **개인 메일 계정을 등록하면 도메인이 gmail.com** 이라,
 * 도메인만 보면 지메일에서 온 거래처 메일이 전부 '내가 보낸 메일'로 잡혀
 * 브리핑에서 통째로 사라진다. 개인 메일 도메인은 주소가 정확히 같을 때만 본다.
 */
function isOutbound(fromAddress, account, settings) {
  const from = String(fromAddress || '').toLowerCase();
  if (!from) return false;

  const me = String(account?.user || settings?.imapUser || '').toLowerCase();
  if (me && from === me) return true;

  const domain = from.split('@')[1] || '';
  if (!domain || FREE_MAIL.has(domain)) return false;

  const myDomain = (me.split('@')[1] || '') || ownDomainOf(settings);
  return Boolean(myDomain) && domain === myDomain;
}

/**
 * 메일함에서 사라진 폴더를 설정에서 걷어낸다.
 *
 * 대표님이 웹메일에서 폴더를 정리하시면 그 폴더는 매 수집마다 오류를 내고,
 * 화면의 거래처 목록에도 계속 남는다. 이름을 retiredGroups 에 적어 두면
 * 목록에서 빠지고, 폴더를 되살렸을 때 다시 잡힌다.
 * **이미 수집한 메일은 지우지 않는다** — 폴더 정리는 분류를 바꾸는 일이지
 * 자료를 버리는 일이 아니다.
 */
async function retireFolders(settings, retired) {
  const { saveSettings } = await import('@/lib/settings');
  const patch = {};

  const gone = new Set(retired.map((r) => r.folder));
  const goneNames = [...gone].map(groupNameFromFolder);

  if ((settings.imapAccounts || []).length) {
    patch.imapAccounts = settings.imapAccounts.map((a) => ({
      ...a,
      pass: '', // 빈 값이면 기존 비밀번호가 유지된다 (settings.js 규칙)
      folders: (a.folders || []).filter((f) => !retired.some((r) => r.accountId === a.id && r.folder === f)),
    }));
  } else {
    patch.imapFolders = (settings.imapFolders || []).filter((f) => !gone.has(f));
  }

  patch.retiredGroups = [...new Set([...(settings.retiredGroups || []), ...goneNames])];
  await saveSettings(patch);

  // 없어진 폴더의 수집 기록도 지운다.
  // 남겨 두면 그 폴더의 옛 오류가 계속 읽혀, 지금은 멀쩡한 계정이
  // 영원히 '연결 실패' 로 보인다(실측: 정리된 12개 폴더 때문에 그랬다).
  try {
    const sync = await collections.syncState();
    await sync.deleteMany({
      $or: retired.map((r) => ({ folder: r.folder, accountId: r.accountId })),
    });
  } catch { /* 기록 정리 실패가 수집을 막지는 않는다 */ }
}

async function ingestFolder(settings, folder, { limit, recent, learned, knownGroups = [], account }) {
  const accountId = account?.id || 'main';
  const state = await getSyncState(folder, accountId);
  const stat = {
    account: account?.label || null,
    accountId,
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

      // 어느 메일함에서 온 것인지 — 첨부를 받을 때 이 서버로 다시 접속해야 한다
      parsed.accountId = accountId;
      parsed.accountLabel = account?.label || null;

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

      // 보낸 메일인지 받은 메일인지 — 브리핑은 할 일 목록이라 내가 쓴 메일은 빼야 한다.
      //   - 브리핑은 할 일 목록이다. 우리가 쓴 메일은 할 일이 아니다.
      //   - 요약 대기 1,589통 중 541통(34%)이 자사 발신이라 상한 20통을 잠식한다.
      // 보관·조회는 그대로 되고, 필요하면 상세에서 직접 요약을 돌릴 수 있다.
      parsed.direction = isOutbound(parsed.from?.address, account, settings) ? 'out' : 'in';

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
  }, accountId);

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

  // 수집 대상 = 계정 × 폴더.
  // 계정을 등록하지 않은 설치에서는 accountsOf() 가 기존 단일 계정 하나를
  // 그대로 돌려주므로 아래 루프가 예전과 똑같이 한 바퀴만 돈다.
  const accounts = accountsOf(settings);
  const retired = [];

  // 발신자→그룹 이력은 폴더를 돌기 전에 한 번만 만든다
  let learned = null;
  let knownGroups = [];
  if (settings.autoGroup !== false) {
    try { learned = await learnSenderGroups(); } catch { /* 이력 없이도 수집은 된다 */ }
    try {
      // 폴더에서 온 그룹 + 설정에 고른 폴더명 (아직 수집 전이어도 이름 매칭은 가능하도록)
      const existing = (await listGroups()).groups.map((g) => g.group);
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
    // 이 도구 밖에서 벌어진 일 — 웹메일에서 보낸 회신 / 웹메일에서 지운 메일
    replies: [], repliedFound: 0,
    trashSync: [], trashedFound: 0, restoredFound: 0,
    errors: [],
    startedAt: new Date(),
  };

  const insertedIds = [];
  let attempted = 0;

  for (const account of accounts) {
    const base = accountAsSettings(account, settings);
    try {
      // 계정마다 연결을 **한 번만** 연다. 폴더마다 새로 붙으면 26개를 도는
      // 동안 메일 서버가 연달아 붙는 것을 막아 뒤쪽 폴더가 통째로 실패한다
      // (실측: 이카운트에서 한 번에 12개 폴더가 'Command failed').
      await withOpenAccount(base, async (scoped) => {
        let folders = opts.folders?.length ? opts.folders : (account.folders || ['INBOX']);
        folders = [...new Set(folders.filter(Boolean))];

        // 메일함에서 지운 폴더는 매 수집마다 오류를 내고 화면에도 유령처럼 남는다.
        // 이미 열어 둔 연결로 실제 목록을 확인해 걷어낸다.
        // (opts.folders 로 대상을 직접 지정한 호출은 사용자가 정한 것이라 건드리지 않는다)
        if (!opts.folders?.length) {
          try {
            const live = await listMailboxes(scoped);
            const gone = folders.filter((f) => !live.includes(f));
            if (gone.length) {
              retired.push(...gone.map((f) => ({ accountId: account.id, folder: f })));
              folders = folders.filter((f) => live.includes(f));
            }
          } catch { /* 폴더 목록을 못 읽으면 정리는 건너뛰고 수집은 그대로 시도한다 */ }
        }

        for (const folder of folders) {
          attempted++;
          try {
            const { stat, inserted } = await ingestFolder(scoped, folder, {
              limit, recent: opts.recent, learned, knownGroups, account,
            });
            stats.folders.push(stat);
            stats.fetched += stat.fetched;
            stats.inserted += stat.inserted;
            stats.duplicate += stat.duplicate;
            stats.ruleFiltered += stat.ruleFiltered;
            stats.grouped += stat.grouped;
            stats.errors.push(...stat.errors.map((e) => ({ account: account.label, folder, ...e })));
            insertedIds.push(...inserted);
          } catch (e) {
            // 폴더 하나가 죽어도 나머지는 계속 읽는다
            const error = String(e?.message || e);
            stats.folders.push({ account: account.label, accountId: account.id, folder, failed: true, error });
            stats.errors.push({ account: account.label, folder, error });
            await setSyncState(folder, { lastError: error, lastSyncAt: new Date() }, account.id);
          }
        }

        // 폴더를 다 읽은 뒤, **이 도구 밖에서 벌어진 일**을 따라잡는다.
        // 웹메일·휴대폰에서 보낸 회신과 웹메일에서 지운 메일이 여기서 반영된다.
        // 실패해도 수집 자체는 성공이다 — 이건 맞춰 주는 작업이지 수집이 아니다.
        try {
          const rep = await syncSentReplies(scoped, { account });
          if (rep.folder) stats.replies.push({ account: account.label, ...rep });
          stats.repliedFound += rep.matched;
        } catch (e) {
          stats.errors.push({ account: account.label, error: `회신 확인 실패: ${String(e?.message || e)}` });
        }
        try {
          const tr = await syncTrashed(scoped, { account });
          if (tr.folder) stats.trashSync.push({ account: account.label, ...tr });
          stats.trashedFound += tr.trashed;
          stats.restoredFound += tr.restored;
        } catch (e) {
          stats.errors.push({ account: account.label, error: `삭제 확인 실패: ${String(e?.message || e)}` });
        }
      });
    } catch (e) {
      // 계정 접속 자체가 실패 — 그 계정의 폴더 전부를 실패로 기록한다.
      // 계정이 여럿이면 Gmail 이 막혀도 이카운트 메일은 들어와야 하므로 여기서 멈추지 않는다.
      const error = String(e?.message || e);
      const folders = opts.folders?.length ? opts.folders : (account.folders || ['INBOX']);
      attempted += folders.length;
      for (const folder of folders) {
        stats.folders.push({ account: account.label, accountId: account.id, folder, failed: true, error });
        await setSyncState(folder, { lastError: error, lastSyncAt: new Date() }, account.id);
      }
      stats.errors.push({ account: account.label, error });
    }
  }

  // 전부 못 읽었으면 설정 문제이므로 실패로 알린다
  if (attempted && stats.folders.every((f) => f.failed)) {
    throw new Error(`IMAP 수집 실패: ${stats.folders[0].error}`);
  }

  // 없어진 폴더를 설정에서 지운다. 이미 수집한 메일은 그대로 두고
  // 수집 대상과 거래처 목록에서만 뺀다 — 폴더를 되살리면 다시 잡힌다.
  if (retired.length) {
    stats.retiredFolders = retired.map((r) => r.folder);
    try { await retireFolders(settings, retired); } catch { /* 정리 실패가 수집을 막지는 않는다 */ }
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
