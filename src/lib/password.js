/**
 * 접근 비밀번호 — DB(settings) 에 scrypt 해시로 저장하고 앱 안에서 변경한다.
 * Node 런타임 전용 (미들웨어에서 import 하지 말 것).
 *
 * 최초 실행 시:
 *   - DB 에 해시가 없고 APP_PASSWORD 도 없으면 → 로그인 화면이 "초기 비밀번호 설정" 모드로 뜬다.
 *   - APP_PASSWORD 가 있으면 그 값으로 로그인할 수 있고, 최초 로그인 시 DB 로 이관된다.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual as _tse } from 'node:crypto';
import { promisify } from 'node:util';
import { collections } from './db';

const scrypt = promisify(_scrypt);
const SETTINGS_ID = 'main';
const KEYLEN = 64;

async function hash(password, salt = randomBytes(16).toString('hex')) {
  const buf = await scrypt(String(password), salt, KEYLEN);
  return `scrypt:${salt}:${buf.toString('hex')}`;
}

async function verify(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const buf = await scrypt(String(password), salt, KEYLEN);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(buf);
  return a.length === b.length && _tse(a, b);
}

async function readHash() {
  try {
    const col = await collections.settings();
    const doc = await col.findOne({ _id: SETTINGS_ID }, { projection: { appPasswordHash: 1 } });
    return doc?.appPasswordHash || null;
  } catch {
    return null; // DB 미연결 — 아래 env 폴백으로 처리
  }
}

async function writeHash(password) {
  const col = await collections.settings();
  await col.updateOne(
    { _id: SETTINGS_ID },
    { $set: { appPasswordHash: await hash(password), appPasswordUpdatedAt: new Date() } },
    { upsert: true },
  );
}

/** 비밀번호가 아직 하나도 설정되지 않았는가 (로그인 화면의 초기 설정 모드 판단) */
export async function needsSetup() {
  if (await readHash()) return false;
  return !process.env.APP_PASSWORD;
}

/** 로그인 검증. env 비밀번호로 처음 들어오면 DB 로 이관한다. */
export async function checkPassword(input) {
  const pw = String(input || '');
  if (!pw) return false;

  const stored = await readHash();
  if (stored) return verify(pw, stored);

  const envPw = process.env.APP_PASSWORD;
  if (envPw) {
    const ok = pw.length === envPw.length &&
      _tse(Buffer.from(pw), Buffer.from(envPw));
    if (ok) {
      // 이후에는 DB 해시로 검증되도록 이관 (실패해도 로그인 자체는 통과)
      try { await writeHash(pw); } catch { /* DB 쓰기 실패는 무시 */ }
    }
    return ok;
  }
  return false;
}

/** 최초 설정 — 이미 설정돼 있으면 거부 */
export async function setupPassword(newPassword) {
  if (!(await needsSetup())) throw new Error('비밀번호가 이미 설정되어 있습니다.');
  validate(newPassword);
  await writeHash(newPassword);
}

/** 변경 — 현재 비밀번호 확인 필요 */
export async function changePassword(current, next) {
  if (!(await checkPassword(current))) throw new Error('현재 비밀번호가 올바르지 않습니다.');
  validate(next);
  await writeHash(next);
}

function validate(pw) {
  const s = String(pw || '');
  if (s.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
  if (s.length > 200) throw new Error('비밀번호가 너무 깁니다.');
}
