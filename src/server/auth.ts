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
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
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
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
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

/**
 * 预生成一条固定参数的伪造密码哈希：
 * 当登录请求的用户名不存在时，同样执行一次完整的 scrypt 异步计算，
 * 消除“账号不存在直接短路返回”带来的 CPU 时序侧信道与异常差异。
 */
const DUMMY_PASSWORD_HASH = hashPassword('__yesheng_dummy_password_for_constant_time_auth__');

export async function verifyDummyPasswordAsync(password: string): Promise<boolean> {
  const safeInput = typeof password === 'string' ? password.slice(0, 200) : '';
  await verifyPasswordAsync(safeInput, DUMMY_PASSWORD_HASH);
  return false;
}

const WEAK_PASSWORDS = new Set([
  '123456789012',
  '123456789abc',
  'password1234',
  'password12345',
  'admin1234567',
  'admin12345678',
  'qwerty123456',
  'qwertyuiop12',
  'yesheng12345',
  'yesheng123456',
  'change-me-before-first-boot',
]);

/**
 * 校验新密码强度：
 * - 长度 12 ~ 200 位
 * - 至少包含大写字母、小写字母、数字、特殊符号中的两类
 * - 拒绝单一字符重复或常见弱口令
 */
export function validatePasswordStrength(password: string, username = ''): string | null {
  if (typeof password !== 'string' || password.length < 12) {
    return '新密码至少需要 12 位';
  }
  if (password.length > 200) {
    return '新密码不能超过 200 位';
  }
  if (/^(.)\1+$/.test(password)) {
    return '新密码不能由单一重复字符组成';
  }
  const lower = password.toLowerCase();
  if (WEAK_PASSWORDS.has(lower)) {
    return '新密码过于简单，请更换更复杂的口令';
  }
  if (username && lower.includes(username.trim().toLowerCase()) && username.trim().length >= 3) {
    return '新密码不能直接包含登录账号名';
  }
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9\s]/.test(password)) classes += 1;
  if (classes < 2) {
    return '新密码需至少包含字母、数字或特殊符号中的两种组合';
  }
  return null;
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

export function destroyUserSessions(userId: number): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
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
 * 解析真实客户端 IP（防请求头伪造）：
 * 1. 默认（直连 VPS + 本机 Nginx 反代）：仅信任本机 Nginx 覆写的 `X-Real-IP`（`$remote_addr`）
 *    或 `X-Forwarded-For` 链中**最后一跳**非私网公网 IP（即本机 Nginx 追加的 `$remote_addr`），
 *    绝不信任客户端可随意伪造的 `CF-Connecting-IP`、`X-Client-IP` 或 `X-Forwarded-For` 首段；
 * 2. 仅当显式设置环境变量 `BLOG_TRUST_CDN_HEADERS=1`（已接入受控 CDN 且源站防火墙已限制仅允许 CDN 节点回源）时，
 *    才额外解析主流 CDN 透传头。
 */
export function getClientIp(context: APIContext): string {
  const headers = context.request.headers;
  const trustCdn = process.env.BLOG_TRUST_CDN_HEADERS === '1';

  let firstValidFallback = '';

  if (trustCdn) {
    const cdnHeaders = [
      'cf-connecting-ip',
      'ali-cdn-real-ip',
      'eo-connecting-ip',
      'true-client-ip',
    ];
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
  }

  // 优先读取本机 Nginx 用 `proxy_set_header X-Real-IP $remote_addr` 强制覆写的真实连接 IP
  const realIp = normalizeIp(headers.get('x-real-ip'));
  if (realIp) {
    if (!isPrivateOrLoopbackIp(realIp)) return realIp;
    if (!firstValidFallback) firstValidFallback = realIp;
  }

  // 解析 X-Forwarded-For：默认从右向左取最后一跳公网 IP（由本机反代追加，不可被客户端前置伪造）
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    const ordered = trustCdn ? parts : [...parts].reverse();
    for (const part of ordered) {
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
   内存速率限制：支持容量上限、过期自动清理与锁定态保护（防止随机键挤出已锁定记录）
   -------------------------------------------------------------------------- */
interface Attempt {
  count: number;
  resetAt: number;
  locked: boolean;
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
  if (attempts.size < MAX_TRACKED_KEYS) return;

  // 优先淘汰未锁定的低频探测键，保护已触发锁定的键不被随机字典请求挤出内存
  for (const [k, v] of attempts) {
    if (!v.locked) {
      attempts.delete(k);
      return;
    }
  }

  const oldestKey = attempts.keys().next().value;
  if (oldestKey !== undefined) attempts.delete(oldestKey);
}

export function getRateLimitRetryAfterSec(
  key: string,
  maxAttempts = MAX_ATTEMPTS,
  windowMs = WINDOW_MS
): number {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt <= now || a.resetAt - now > windowMs) {
    attempts.delete(key);
    return 0;
  }
  if (a.count >= maxAttempts) {
    a.locked = true;
    return Math.max(1, Math.ceil((a.resetAt - now) / 1000));
  }
  return 0;
}

export function isRateLimited(
  key: string,
  maxAttempts = MAX_ATTEMPTS,
  windowMs = WINDOW_MS
): boolean {
  return getRateLimitRetryAfterSec(key, maxAttempts, windowMs) > 0;
}

export function recordFailure(
  key: string,
  windowMs = WINDOW_MS,
  lockThreshold = MAX_ATTEMPTS
): void {
  const now = Date.now();
  pruneAttempts(now);
  const a = attempts.get(key);
  if (!a || a.resetAt <= now) {
    attempts.set(key, {
      count: 1,
      resetAt: now + windowMs,
      locked: 1 >= lockThreshold,
    });
  } else {
    a.count += 1;
    if (a.count >= lockThreshold) {
      a.locked = true;
    }
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  cleanupExpiredRateLimits(now);
}
