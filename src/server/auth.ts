/**
 * 管理员认证：scrypt 密码 + 会话 Cookie + CSRF。
 *
 * 只有一个管理员，不做注册。首次启动时可用环境变量
 * BLOG_ADMIN_USER / BLOG_ADMIN_PASSWORD 播种账号。
 */
import { createHash, randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual } from 'node:crypto';
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

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
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

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
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
    r: r,
    p: p,
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const actual = await scryptAsync(password, salt, expected.length, {
    N: n,
    r: r,
    p: p,
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

/**
 * 规范化 IP 字符串：
 * - 去除空白、引号、方括号与端口后缀（如 1.2.3.4:56789 或 [240e::1]:443）
 * - 将 IPv4-mapped IPv6（::ffff:1.2.3.4）还原为标准 IPv4
 * - 校验 IPv4 / IPv6 格式合法性，过滤非法伪造字符
 */
export function normalizeIp(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim().replace(/^["']+|["']+$/g, '');
  if (!s || s.toLowerCase() === 'unknown') return '';

  // RFC 7239 Forwarded: for=1.2.3.4;proto=https
  if (/^for=/i.test(s)) {
    s = s.slice(4).split(';')[0]?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  }

  // 处理 [IPv6]:port 或 [IPv6]
  if (s.startsWith('[')) {
    const closeIdx = s.indexOf(']');
    if (closeIdx > 1) {
      s = s.slice(1, closeIdx);
    }
  } else if (s.includes('.') && /^[0-9.]+:\d+$/.test(s)) {
    // 处理 IPv4:port
    s = s.split(':')[0] ?? s;
  }

  // 剥离 IPv4-mapped IPv6 前缀 ::ffff:
  if (/^::ffff:/i.test(s)) {
    const v4 = s.slice(7);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
      s = v4;
    }
  }

  // 校验标准 IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const parts = s.split('.').map(Number);
    if (parts.every((n) => n >= 0 && n <= 255)) return s;
    return '';
  }

  // 校验标准 IPv6（含冒号且仅由十六进制、冒号、点号组成）
  if (s.includes(':') && /^[0-9a-fA-F:.]+$/.test(s) && s.length <= 45) {
    return s.toLowerCase();
  }

  return '';
}

/** 判断 IP 是否为本机环回、局域网私网或保留网段 */
export function isPrivateOrLoopbackIp(ip: string): boolean {
  const clean = normalizeIp(ip);
  if (!clean) return true;
  if (clean === '127.0.0.1' || clean === '0.0.0.0' || clean === '::1' || clean === '::') {
    return true;
  }
  if (clean.includes('.')) {
    const [a, b] = clean.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
    return false;
  }
  const lower = clean.toLowerCase();
  if (
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  return false;
}

/**
 * 解析真实客户端 IP：
 * 1. 优先读取主流 CDN / 边缘节点透传的真实客户端 IP 头（Cloudflare、阿里云 CDN/DCDN/ESA、腾讯云 EdgeOne 等）；
 * 2. 解析 X-Forwarded-For 代理链，提取第一个非私网/非环回的公网 IP（避免被末跳 Nginx $remote_addr 覆盖为代理节点 IP）；
 * 3. 依次回退读取 X-Real-IP、Forwarded 头与底层 socket 地址，并统一剥离 ::ffff: 前缀与端口号。
 */
export function getClientIp(context: APIContext): string {
  const headers = context.request.headers;

  const cdnHeaders = [
    'cf-connecting-ip',
    'ali-cdn-real-ip',
    'eo-connecting-ip',
    'true-client-ip',
    'x-client-ip',
    'x-cluster-client-ip',
    'x-original-forwarded-for',
  ];

  let firstValidFallback = '';

  for (const h of cdnHeaders) {
    const raw = headers.get(h);
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const candidate = normalizeIp(part);
      if (!candidate) continue;
      if (!isPrivateOrLoopbackIp(candidate)) return candidate;
      if (!firstValidFallback) firstValidFallback = candidate;
    }
  }

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    for (const part of xff.split(',')) {
      const candidate = normalizeIp(part);
      if (!candidate) continue;
      if (!isPrivateOrLoopbackIp(candidate)) return candidate;
      if (!firstValidFallback) firstValidFallback = candidate;
    }
  }

  const realIp = normalizeIp(headers.get('x-real-ip'));
  if (realIp) {
    if (!isPrivateOrLoopbackIp(realIp)) return realIp;
    if (!firstValidFallback) firstValidFallback = realIp;
  }

  const forwarded = headers.get('forwarded');
  if (forwarded) {
    for (const part of forwarded.split(',')) {
      const candidate = normalizeIp(part);
      if (!candidate) continue;
      if (!isPrivateOrLoopbackIp(candidate)) return candidate;
      if (!firstValidFallback) firstValidFallback = candidate;
    }
  }

  let rawAddr = '';
  try {
    rawAddr = context.clientAddress || '';
  } catch {
    rawAddr = '';
  }
  const socketIp = normalizeIp(rawAddr);
  if (socketIp && !isPrivateOrLoopbackIp(socketIp)) {
    return socketIp;
  }

  return firstValidFallback || socketIp || '127.0.0.1';
}

/* --------------------------------------------------------------------------
   内存速率限制：支持容量上限与过期自动清理，防止随机键耗尽内存
   -------------------------------------------------------------------------- */
interface Attempt {
  count: number;
  resetAt: number;
}
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_KEYS = 5000;

export function cleanupExpiredRateLimits(now = Date.now()): void {
  for (const [k, v] of attempts) {
    if (v.resetAt <= now) attempts.delete(k);
  }
}

function pruneAttempts(now: number): void {
  if (attempts.size < MAX_TRACKED_KEYS) return;
  cleanupExpiredRateLimits(now);
  if (attempts.size >= MAX_TRACKED_KEYS) {
    const oldestKey = attempts.keys().next().value;
    if (oldestKey !== undefined) attempts.delete(oldestKey);
  }
}

export function isRateLimited(
  key: string,
  maxAttempts = MAX_ATTEMPTS,
  windowMs = WINDOW_MS
): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt <= now || a.resetAt - now > windowMs) {
    attempts.delete(key);
    return false;
  }
  return a.count >= maxAttempts;
}

export function recordFailure(key: string, windowMs = WINDOW_MS): void {
  const now = Date.now();
  pruneAttempts(now);
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    a.count += 1;
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  for (const [k, v] of attempts) {
    if (v.resetAt < now) attempts.delete(k);
  }
}
