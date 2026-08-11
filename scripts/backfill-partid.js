/**
 * 첨부파일의 IMAP 파트 번호(partId)를 메일 서버에서 다시 읽어 채운다.
 *
 *   node scripts/backfill-partid.js --dry    바뀔 것만 미리 보기
 *   node scripts/backfill-partid.js          실제 적용
 *   node scripts/backfill-partid.js --limit 50
 *
 * 이 앱은 첨부 파일 내용을 DB 에 저장하지 않는다. 다운로드를 누를 때
 * 메일 서버에서 그 파트만 받아오므로 partId(파일의 위치)가 없으면 받을 수 없고,
 * 화면에는 "첨부파일 위치 정보 없이 수집되었습니다" 가 뜬다.
 *
 * partId 를 저장하는 코드가 개발 중간에 들어갔기 때문에 그 전에 수집된 메일에는
 * 값이 없다. 서버에는 파일이 그대로 있으므로 구조만 다시 읽으면 복구된다.
 *
 * **첨부 본문은 내려받지 않는다** — BODYSTRUCTURE(메타데이터)만 읽으므로 빠르고,
 * 25MB 짜리 첨부가 있어도 트래픽이 늘지 않는다. API 호출이 없어 과금도 없다.
 *
 * 파일명이 정확히 일치할 때만 채운다. 엉뚱한 파트 번호를 넣으면
 * "못 받는다"가 "다른 파일이 받아진다"로 바뀌어 더 나쁘다.
 */
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

function env(key) {
  // 셸에서 준 값이 파일보다 우선한다. 인스턴스가 둘(대표님·이사님)이 되면서
  // 같은 스크립트를 다른 DB 로 돌릴 일이 생겼다:
  //   MONGODB_DB=emaildata_jay node scripts/export-pending.js 50 --days 30
  if (process.env[key]) return String(process.env[key]).trim();
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return '';
  const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const DRY = process.argv.includes('--dry');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

/** BODYSTRUCTURE 트리에서 파일로 볼 수 있는 잎 노드만 뽑는다 */
function collectParts(node, out = []) {
  const kids = node.childNodes || [];
  if (kids.length) {
    kids.forEach((k) => collectParts(k, out));
    return out;
  }
  // 잎 노드. 본문(text/plain·text/html)이라도 파일명이 붙어 있으면 첨부다.
  const filename = node.dispositionParameters?.filename || node.parameters?.name || '';
  const isBody = /^text\/(plain|html)$/i.test(node.type || '') && !filename;
  if (node.part && !isBody) {
    out.push({ part: node.part, filename, type: node.type || '', size: node.size || 0 });
  }
  return out;
}

(async () => {
  const uri = env('EMAILDATA_URI') || env('MONGODB_URI') || process.env.EMAILDATA_URI;
  const client = await new MongoClient(uri).connect();
  const db = client.db(env('MONGODB_DB') || 'emaildata');
  const mails = db.collection('mails');
  const settings = await db.collection('settings').findOne({ _id: 'main' });

  // partId 가 빠진 첨부를 가진 메일만 (배열 경로 질의는 신뢰하기 어려워 JS 로 거른다)
  const all = await mails
    .find({ 'attachments.0': { $exists: true } },
      { projection: { folder: 1, uid: 1, subject: 1, attachments: 1, date: 1 } })
    .toArray();

  let targets = all.filter((m) => (m.attachments || []).some((a) => !a.partId));
  targets = targets.filter((m) => m.folder && m.uid); // 위치를 모르면 손댈 수 없다
  if (LIMIT) targets = targets.slice(0, LIMIT);

  const missingFiles = targets.reduce((n, m) => n + m.attachments.filter((a) => !a.partId).length, 0);
  console.log(`대상 메일 ${targets.length}통 · 채울 첨부 ${missingFiles}개${DRY ? '   [미리보기]' : ''}`);
  if (!targets.length) { await client.close(); return; }

  const { ImapFlow } = await import('imapflow');
  const imap = new ImapFlow({
    host: settings?.imapHost || env('IMAP_HOST'),
    port: Number(settings?.imapPort || env('IMAP_PORT')) || 993,
    secure: String(settings?.imapSecure ?? env('IMAP_SECURE')) !== 'false',
    auth: {
      user: settings?.imapUser || env('IMAP_USER'),
      pass: settings?.imapPass || env('IMAP_PASS'),
    },
    logger: false,
  });
  await imap.connect();

  // 폴더 단위로 묶어야 메일함 잠금을 한 번만 잡는다
  const byFolder = new Map();
  for (const m of targets) {
    if (!byFolder.has(m.folder)) byFolder.set(m.folder, []);
    byFolder.get(m.folder).push(m);
  }

  const stat = { filled: 0, mails: 0, skipped: 0, gone: 0, err: 0 };
  const skipSamples = [];

  for (const [folder, list] of byFolder) {
    let lock;
    try {
      lock = await imap.getMailboxLock(folder);
    } catch (e) {
      console.log(`  폴더 열기 실패 ${folder}: ${e.message}`);
      stat.err += list.length;
      continue;
    }
    try {
      for (const m of list) {
        let msg;
        try {
          msg = await imap.fetchOne(String(m.uid), { bodyStructure: true }, { uid: true });
        } catch (e) {
          stat.err++;
          continue;
        }
        if (!msg?.bodyStructure) { stat.gone++; continue; } // 원본이 지워진 메일

        const parts = collectParts(msg.bodyStructure);

        // 파일명별로 묶어 둔다. 서명 이미지처럼 image001.jpg 가 두 개 붙는 메일이 흔한데,
        // "정확히 하나"만 허용하면 그런 메일이 통째로 복구되지 않는다.
        // 이름도 같고 개수도 같으면 순서대로 대응시킨다 — mailparser 와 BODYSTRUCTURE 는
        // 같은 MIME 트리를 같은 순서로 훑으므로 이 대응은 어긋나지 않는다.
        const serverByName = new Map();
        for (const p of parts) {
          if (!p.filename) continue;
          if (!serverByName.has(p.filename)) serverByName.set(p.filename, []);
          serverByName.get(p.filename).push(p.part);
        }
        const dbCount = new Map();
        for (const a of m.attachments) dbCount.set(a.filename, (dbCount.get(a.filename) || 0) + 1);

        const used = new Map(); // 파일명 → 지금까지 쓴 개수
        const next = m.attachments.map((a) => {
          if (a.partId) return a;
          const cand = serverByName.get(a.filename) || [];
          // 개수가 다르면 어느 것이 어느 것인지 확신할 수 없으므로 손대지 않는다.
          // 엉뚱한 파트를 넣으면 "못 받는다"가 "다른 파일이 받아진다"로 바뀌어 더 나쁘다.
          if (cand.length !== (dbCount.get(a.filename) || 0)) return a;
          const i = used.get(a.filename) || 0;
          used.set(a.filename, i + 1);
          return cand[i] ? { ...a, partId: cand[i] } : a;
        });

        const gained = next.filter((a, i) => a.partId && !m.attachments[i].partId).length;
        const stillMissing = next.filter((a) => !a.partId).length;

        if (!gained) {
          stat.skipped++;
          if (skipSamples.length < 5) {
            skipSamples.push(`${folder} uid=${m.uid} · DB[${m.attachments.map((a) => a.filename).join(', ').slice(0, 60)}]`
              + ` · 서버[${parts.map((p) => p.filename || p.type).join(', ').slice(0, 60)}]`);
          }
          continue;
        }

        if (!DRY) await mails.updateOne({ _id: m._id }, { $set: { attachments: next } });
        stat.filled += gained;
        stat.mails++;
        if (stat.mails % 25 === 0) console.log(`  … ${stat.mails}통 처리 (첨부 ${stat.filled}개 복구)`);
        if (stillMissing) stat.skipped++;
      }
    } finally {
      lock.release();
    }
  }

  await imap.logout();

  console.log('');
  console.log(`복구한 첨부   : ${stat.filled}개  (메일 ${stat.mails}통)`);
  console.log(`못 채운 메일  : ${stat.skipped}통  ← 파일명이 서버 구조와 일치하지 않음`);
  console.log(`원본 없음     : ${stat.gone}통  ← 메일함에서 지워진 메일`);
  console.log(`오류          : ${stat.err}통`);
  if (skipSamples.length) {
    console.log('');
    console.log('못 채운 사례:');
    skipSamples.forEach((s) => console.log('  · ' + s));
  }
  if (DRY) console.log('\n미리보기였습니다. 실제로 적용하려면 --dry 없이 다시 실행하세요.');

  await client.close();
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
