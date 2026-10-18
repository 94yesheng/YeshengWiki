/**
 * 管理员认证：scrypt 密码 + 会话 Cookie + CSRF。
 *
 * 只有一个管理员，不做注册。首次启动时可用环境变量
 * BLOG_ADMIN_USER / BLOG_ADMIN_PASSWORD 播种账号。
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';
import { getDb } from './db';

export const SESSION_COOKIE = 'blog_session';
export const CSRF_HEADER = 'x-csrf-token';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export interface SessionUser {
  id: number;
  username: string;
}

export interface AuthContext {
  sessionId: string;
  csrf: string;
  user: SessionUser;
}

interface SessionRow {
  id: string;
  user_id: number;
  csrf: string;
  expires_at: number;
  username: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const actual = scryptSync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createUser(username: string, password: string): SessionUser {
  const db = getDb();
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hashPassword(password));
  return { id: Number(info.lastInsertRowid), username };
}

/** 首次启动播种管理员；已存在则什么都不做。 */
export function ensureAdminFromEnv(): void {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) return;

  const username = process.env.BLOG_ADMIN_USER?.trim();
  const password = process.env.BLOG_ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('[auth] 没有管理员账号：设置 BLOG_ADMIN_USER / BLOG_ADMIN_PASSWORD 后重启，或运行 scripts/create-admin.mjs');
    return;
  }
  createUser(username, password);
  console.info(`[auth] 已创建管理员 ${username}`);
}

export function createSession(userId: number): { token: string; csrf: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  getDb()
    .prepare('INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, csrf, expiresAt);
  return { token, csrf, expiresAt };
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(tokenHash(token));
}

export function getAuth(context: APIContext): AuthContext | null {
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT s.id, s.user_id, s.csrf, s.expires_at, u.username
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`
    )
    .get(tokenHash(token)) as SessionRow | undefined;

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(token);
    return null;
  }

  return {
    sessionId: row.id,
    csrf: row.csrf,
    user: { id: row.user_id, username: row.username },
  };
}

export function hasValidCsrf(context: APIContext, auth: AuthContext): boolean {
  const header = context.request.headers.get(CSRF_HEADER);
  return Boolean(header) && header === auth.csrf;
}

export function setSessionCookie(context: APIContext, token: string, expiresAt: number): void {
  const forwardedProto = context.request.headers.get('x-forwarded-proto');
  const secure = context.url.protocol === 'https:' || forwardedProto === 'https';
  context.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(context: APIContext): void {
  context.cookies.delete(SESSION_COOKIE, { path: '/' });
}

/* --------------------------------------------------------------------------
   登录限流：内存 Map，单进程足够；重启后清零
   -------------------------------------------------------------------------- */
interface Attempt {
  count: number;
  resetAt: number;
}
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.delete(key);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    a.count += 1;
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function cleanupExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
