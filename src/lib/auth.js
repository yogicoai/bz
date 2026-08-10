/**
 * 세션 쿠키 — Edge 미들웨어에서도 동작해야 하므로 node:crypto 대신 Web Crypto 만 쓴다.
 * 비밀번호 자체의 검증·변경은 DB 를 읽어야 하므로 Node 런타임 전용인 password.js 에 있다.
 */

export const COOKIE_NAME = 'ed_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14일

/** 로컬 개발에서만 인증을 끌 수 있다. 기본은 항상 켜짐(웹 공개 전제). */
export function authEnabled() {
  return process.env.APP_AUTH_DISABLED !== '1';
}

function secret() {
  return process.env.APP_SECRET || 'insecure-dev-secret-set-APP_SECRET';
}

async function hmac(message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** "만료시각.서명" */
export async function issueToken() {
  const exp = String(Date.now() + MAX_AGE_SEC * 1000);
  return `${exp}.${await hmac(exp)}`;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyToken(token) {
  if (!token) return false;
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig) return false;
  if (!Number(exp) || Number(exp) < Date.now()) return false;
  return timingSafeEqual(sig, await hmac(exp));
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SEC,
  };
}
