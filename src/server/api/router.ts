/**
 * `/api/*` 路由：由 middleware 调用，而不是 Astro 的 pages/api。
 *
 * 这样静态构建（`npm run build`）不会因为 API 端点缺少 adapter 而失败；
 * 动态构建时 middleware 每个请求都会经过这里。
 */
import type { APIContext } from 'astro';
import {
  clearFailures,
  clearSessionCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  getAuth,
  getClientIp,
  getRateLimitRetryAfterSec,
  hasValidCsrf,
  hashPasswordAsync,
  recordFailure,
  SESSION_COOKIE,
  setSessionCookie,
  validatePasswordStrength,
  verifyDummyPasswordAsync,
  verifyPasswordAsync,
  type AuthContext,
} from '../auth';
import { getDb } from '../db';
import {
  countPosts,
  createPost,
  deletePost,
  getPostBySlug,
  listPosts,
  updatePost,
  type PostInput,
} from '../repositories/posts';
import { listWalls } from '../repositories/photos';
import {
  deleteMedia,
  listMedia,
  migratePostSlugAssets,
  rewritePostSlugReferences,
} from '../repositories/media';
import {
  approveLinkApplication,
  createLinkApplication,
  deleteLinkApplication,
  listLinkApplications,
  listLinks,
  replaceLinks,
} from '../repositories/links';
import { getSettings, SETTING_KEYS, setSetting, type SettingKey } from '../repositories/settings';
import {
  clearAnalyticsLogs,
  getAnalyticsDashboard,
  getTodayUvSummary,
  listVisitorLogs,
  recordVisitBeacon,
  type ClientBeaconPayload,
  type StatsGranularity,
} from '../repositories/analytics';
import { handleFs } from './fs';
import { fail, json, readJson } from './http';
import {
  getPageValues,
  PAGE_COPY_DEFAULTS,
  PAGE_DEFS,
  sanitizePageValues,
} from '../pages';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

interface AccountBody {
  currentPassword?: unknown;
  username?: unknown;
  newPassword?: unknown;
}

interface LinkApplyBody {
  owner?: string;
  name?: string;
  url?: string;
  description?: string;
  avatar?: string;
  tag?: string;
  website?: string;
  honeypot?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_PER_IP_USER = 5;
const LOGIN_MAX_PER_IP = 15;
const LOGIN_MAX_PER_ACCOUNT = 20;

export async function handleApi(context: APIContext): Promise<Response | null> {
  const { pathname } = context.url;
  if (!pathname.startsWith('/api/')) return null;

  const method = context.request.method.toUpperCase();
  const parts = pathname
    .slice('/api/'.length)
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);

  // /api/fs/*：后台的虚拟文件接口
  if (parts[0] === 'fs') {
    return handleFs(context);
  }

  // /api/health
  if (parts.length === 1 && parts[0] === 'health' && method === 'GET') {
    return health(context);
  }

  // /api/auth/*
  if (parts[0] === 'auth') {
    if (parts[1] === 'login' && parts.length === 2 && method === 'POST') return login(context);
    if (parts[1] === 'logout' && parts.length === 2 && method === 'POST') return logout(context);
    if (parts[1] === 'me' && parts.length === 2 && method === 'GET') return me(context);
    if (parts[1] === 'account' && parts.length === 2 && (method === 'POST' || method === 'PUT')) {
      return changeAccount(context);
    }
  }

  // /api/analytics：访客统计信标上报与后台「统计」模块接口
  if (parts[0] === 'analytics') {
    // 公开前端遥测信标入口（sendBeacon 异步非阻塞，立即返回 204）
    if (parts.length === 2 && parts[1] === 'collect' && method === 'POST') {
      const payload = await readJson<ClientBeaconPayload>(context.request);
      await recordVisitBeacon(context, payload);
      return new Response(null, { status: 204 });
    }

    const auth = getAuth(context);
    if (!auth) return fail('未登录', 401);

    if (parts.length === 1 && method === 'GET') {
      const sp = context.url.searchParams;
      const g = (sp.get('granularity') ?? 'day') as StatsGranularity;
      const bucket = sp.get('bucket');
      const country = sp.get('country');
      const device = sp.get('device');
      const q = sp.get('q');
      const page = Number(sp.get('page') ?? '1');
      const pageSize = Number(sp.get('pageSize') ?? '20');
      return json(
        getAnalyticsDashboard({
          granularity: g,
          bucket,
          country,
          device,
          q,
          page,
          pageSize,
        })
      );
    }

    if (parts.length === 2 && parts[1] === 'summary' && method === 'GET') {
      return json({
        summary: getTodayUvSummary(),
        clientIp: getClientIp(context),
      });
    }

    if (parts.length === 2 && parts[1] === 'raw' && method === 'GET') {
      return json({
        logs: listVisitorLogs(5000),
        clientIp: getClientIp(context),
      });
    }

    if (parts.length === 2 && parts[1] === 'clear' && method === 'DELETE') {
      const denied = requireCsrf(context);
      if (denied) return denied;
      clearAnalyticsLogs();
      return json({ ok: true });
    }
  }

  // /api/posts
  if (parts[0] === 'posts') {
    return posts(context, parts.slice(1), method);
  }

  // /api/walls
  if (parts[0] === 'walls' && method === 'GET') {
    const auth = getAuth(context);
    if (!auth) return fail('未登录', 401);
    return json({ walls: listWalls({ includeEmpty: true }) });
  }

  // /api/links & /api/links/apply & /api/links/applications
  if (parts[0] === 'links') {
    if (parts.length === 1) {
      if (method === 'GET') return json({ links: listLinks() });
      if (method === 'PUT') {
        const denied = requireCsrf(context);
        if (denied) return denied;
        const body = await readJson<{ links?: unknown }>(context.request);
        if (!Array.isArray(body?.links)) return fail('links 必须是数组', 400);
        try {
          return json({ links: replaceLinks(body.links as never) });
        } catch (error) {
          console.error('[api/links]', error);
          return fail('保存友链失败', 500);
        }
      }
    }

    // 访客提交友链申请（公开接口：带 IP 速率限制、蜜罐校验与待审队列上限）
    if (parts.length === 2 && parts[1] === 'apply' && method === 'POST') {
      const ipKey = `link-apply:${getClientIp(context)}`;
      const retryAfter = getRateLimitRetryAfterSec(ipKey, 5, 10 * 60 * 1000);
      if (retryAfter > 0) {
        return fail('提交过于频繁，请稍后再试', 429, {}, { 'Retry-After': String(retryAfter) });
      }

      const body = await readJson<LinkApplyBody>(context.request);
      if (body?.website || body?.honeypot) {
        return json({ ok: true }, 201);
      }

      const owner = typeof body?.owner === 'string' ? body.owner.trim() : '';
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const url = typeof body?.url === 'string' ? body.url.trim() : '';
      const description = typeof body?.description === 'string' ? body.description.trim() : '';
      const avatar = typeof body?.avatar === 'string' ? body.avatar.trim() : '';
      const tag = typeof body?.tag === 'string' ? body.tag.trim() : '';

      if (!owner) return fail('请填写站长称呼', 400);
      if (!name) return fail('请填写站点标题', 400);
      if (!url || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) {
        return fail('请填写以 http:// 或 https:// 开头的完整站点链接', 400);
      }
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return fail('仅支持 http:// 或 https:// 协议的站点链接', 400);
        }
      } catch {
        return fail('请填写合法的完整站点链接', 400);
      }
      if (!description) return fail('请填写自我介绍或站点简介', 400);
      if (owner.length > 48 || name.length > 64 || url.length > 256 || description.length > 320) {
        return fail('填写的字段长度超出限制', 400);
      }

      const existingApps = listLinkApplications();
      const pendingCount = existingApps.filter((a) => a.status === 'pending').length;
      if (pendingCount >= 50) {
        return fail('当前待审核友链申请较多，请稍后再试', 429);
      }

      try {
        recordFailure(ipKey, 10 * 60 * 1000, 5);
        const application = createLinkApplication({
          owner,
          name,
          url,
          description,
          avatar: avatar ? avatar.slice(0, 2) : null,
          tag: tag ? tag.slice(0, 32) : null,
        });
        return json({ ok: true, application }, 201);
      } catch (error) {
        console.error('[api/links/apply]', error);
        return fail('提交友链申请失败，请稍后重试', 500);
      }
    }

    // 后台查看友链申请列表
    if (parts.length === 2 && parts[1] === 'applications' && method === 'GET') {
      const auth = getAuth(context);
      if (!auth) return fail('未登录', 401);
      return json({ applications: listLinkApplications() });
    }

    // 后台一键批准并添加进友链列表
    if (parts.length === 4 && parts[1] === 'applications' && parts[3] === 'approve' && method === 'POST') {
      const denied = requireCsrf(context);
      if (denied) return denied;
      const appId = Number(parts[2]);
      if (!Number.isInteger(appId) || appId <= 0) return fail('申请 ID 无效', 400);
      try {
        const result = approveLinkApplication(appId);
        if (!result.application) return fail('该友链申请不存在', 404);
        return json({
          ok: true,
          application: result.application,
          links: result.links,
          applications: listLinkApplications(),
        });
      } catch (error) {
        console.error('[api/links/applications/approve]', error);
        return fail('批准友链申请失败', 500);
      }
    }

    // 后台删除/忽略友链申请
    if (parts.length === 3 && parts[1] === 'applications' && method === 'DELETE') {
      const denied = requireCsrf(context);
      if (denied) return denied;
      const appId = Number(parts[2]);
      if (!Number.isInteger(appId) || appId <= 0) return fail('申请 ID 无效', 400);
      try {
        if (!deleteLinkApplication(appId)) return fail('该友链申请不存在', 404);
        return json({ ok: true, applications: listLinkApplications() });
      } catch (error) {
        console.error('[api/links/applications/delete]', error);
        return fail('删除友链申请失败', 500);
      }
    }
  }

  // /api/media
  if (parts[0] === 'media' && parts.length === 1) {
    if (method === 'GET') {
      const auth = getAuth(context);
      if (!auth) return fail('未登录', 401);
      return json({ media: listMedia() });
    }
    if (method === 'DELETE') {
      const denied = requireCsrf(context);
      if (denied) return denied;
      const target = context.url.searchParams.get('path') ?? '';
      if (!target) return fail('缺少 path', 400);
      try {
        if (!deleteMedia(target)) return fail('媒体不存在', 404);
        return json({ ok: true });
      } catch (error) {
        console.error('[api/media] delete', error);
        return fail('删除媒体失败', 500);
      }
    }
  }

  // /api/pages：后台「页面」板块的文案 schema 与读写
  if (parts[0] === 'pages' && parts.length === 1) {
    if (method === 'GET') {
      const auth = getAuth(context);
      if (!auth) return fail('未登录', 401);
      return json({ pages: PAGE_DEFS, values: getPageValues(), defaults: PAGE_COPY_DEFAULTS });
    }
    if (method === 'PUT') {
      const denied = requireCsrf(context);
      if (denied) return denied;
      const body = await readJson<{ values?: unknown }>(context.request);
      if (!body || typeof body !== 'object') return fail('请求体不是合法 JSON', 400);
      const merged = { ...getPageValues(), ...(body.values as Record<string, unknown> | undefined) };
      setSetting('pages', sanitizePageValues(merged));
      return json({ ok: true, values: getPageValues() });
    }
  }

  // /api/settings[/key]
  if (parts[0] === 'settings') {
    if (method === 'GET' && parts.length === 1) {
      const auth = getAuth(context);
      if (!auth) return fail('未登录', 401);
      return json({ settings: getSettings() });
    }
    if (method === 'PUT' && parts.length === 2) {
      const denied = requireCsrf(context);
      if (denied) return denied;
      const key = parts[1] as SettingKey;
      if (!SETTING_KEYS.includes(key)) return fail('未知的设置项', 404);
      const body = await readJson<{ value?: unknown }>(context.request);
      const value = body && Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body;
      if (value === undefined) return fail('缺少 value', 400);
      setSetting(key, value);
      return json({ ok: true, key });
    }
  }

  return fail('接口不存在', 404);
}

/* --------------------------------------------------------------------------
   health / auth
   -------------------------------------------------------------------------- */

function health(context: APIContext): Response {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    const auth = getAuth(context);
    if (!auth) {
      return json({ ok: true });
    }
    const schema = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
      version: number | null;
    };
    return json({
      ok: true,
      schema: schema.version ?? 0,
      posts: countPosts(true),
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[api/health]', error);
    return json({ ok: false, error: '数据库不可用' }, 503);
  }
}

async function login(context: APIContext): Promise<Response> {
  const body = await readJson<LoginBody>(context.request);
  if (!body || typeof body !== 'object') {
    return fail('请输入账号和密码', 400);
  }
  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return fail('账号或密码格式不正确', 400);
  }

  const username = body.username.trim();
  const password = body.password;

  if (!username || !password) return fail('请输入账号和密码', 400);
  if (username.length > 32 || password.length > 200) {
    return fail('账号或密码长度超出限制', 400);
  }

  const clientIp = getClientIp(context);
  const normUser = username.toLowerCase();
  const ipKey = `login-ip:${clientIp}`;
  const userKey = `login-user:${clientIp}:${normUser}`;
  const acctKey = `login-acct:${normUser}`;

  const retryIp = getRateLimitRetryAfterSec(ipKey, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  const retryUser = getRateLimitRetryAfterSec(userKey, LOGIN_MAX_PER_IP_USER, LOGIN_WINDOW_MS);
  const retryAcct = getRateLimitRetryAfterSec(acctKey, LOGIN_MAX_PER_ACCOUNT, LOGIN_WINDOW_MS);
  const retryAfter = Math.max(retryIp, retryUser, retryAcct);
  if (retryAfter > 0) {
    return fail(
      '尝试次数过多，请 10 分钟后再试',
      429,
      {},
      { 'Retry-After': String(retryAfter) }
    );
  }

  const row = getDb()
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username) as { id: number; username: string; password_hash: string } | undefined;

  const passwordValid = row
    ? await verifyPasswordAsync(password, row.password_hash)
    : await verifyDummyPasswordAsync(password);

  if (!row || !passwordValid) {
    recordFailure(ipKey, LOGIN_WINDOW_MS, LOGIN_MAX_PER_IP);
    recordFailure(userKey, LOGIN_WINDOW_MS, LOGIN_MAX_PER_IP_USER);
    if (row) {
      recordFailure(acctKey, LOGIN_WINDOW_MS, LOGIN_MAX_PER_ACCOUNT);
    }
    return fail('账号或密码不对', 401);
  }

  clearFailures(ipKey);
  clearFailures(userKey);
  clearFailures(acctKey);

  const oldToken = context.cookies.get(SESSION_COOKIE)?.value;
  if (oldToken) {
    destroySession(oldToken);
  }

  const { token, csrf, expiresAt } = createSession(row.id);
  setSessionCookie(context, token, expiresAt);
  return json({ user: { id: row.id, username: row.username }, csrf });
}

async function logout(context: APIContext): Promise<Response> {
  const auth = getAuth(context);
  if (auth && !hasValidCsrf(context, auth)) {
    return fail('CSRF 校验失败', 403);
  }
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  clearSessionCookie(context);
  return json({ ok: true, wasLoggedIn: Boolean(auth) });
}

async function me(context: APIContext): Promise<Response> {
  const auth = getAuth(context);
  if (!auth) return fail('未登录', 401);
  return json({ user: auth.user, csrf: auth.csrf });
}

async function changeAccount(context: APIContext): Promise<Response> {
  const auth = getAuth(context);
  if (!auth) return fail('未登录', 401);
  if (!hasValidCsrf(context, auth)) return fail('CSRF 校验失败', 403);

  const body = await readJson<AccountBody>(context.request);
  if (!body || typeof body !== 'object') return fail('请求体不是合法 JSON', 400);
  if (
    typeof body.currentPassword !== 'string' ||
    (body.username !== undefined && typeof body.username !== 'string') ||
    (body.newPassword !== undefined && typeof body.newPassword !== 'string')
  ) {
    return fail('字段格式不正确', 400);
  }

  const currentPassword = body.currentPassword;
  const username = (body.username ?? '').trim();
  const newPassword = body.newPassword ?? '';

  if (!currentPassword) return fail('请输入当前密码', 400);
  if (currentPassword.length > 200) return fail('当前密码长度超出限制', 400);
  if (!username) return fail('账号不能为空', 400);
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
    return fail('账号需为 3-32 位中英文、数字或 ._-', 400);
  }
  if (newPassword) {
    const strengthError = validatePasswordStrength(newPassword, username);
    if (strengthError) return fail(strengthError, 400);
  }

  const key = `account:${auth.user.id}:${getClientIp(context)}`;
  const retryAfter = getRateLimitRetryAfterSec(key);
  if (retryAfter > 0) {
    return fail('尝试次数过多，请 10 分钟后再试', 429, {}, { 'Retry-After': String(retryAfter) });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT id, username, password_hash FROM users WHERE id = ?')
    .get(auth.user.id) as { id: number; username: string; password_hash: string } | undefined;
  if (!row) return fail('账号不存在', 404);

  if (!(await verifyPasswordAsync(currentPassword, row.password_hash))) {
    recordFailure(key);
    return fail('当前密码不对', 400);
  }

  const passwordChanged = newPassword.length > 0;
  if (username === row.username && !passwordChanged) {
    return fail('账号和密码都没有变化', 400);
  }

  if (username !== row.username) {
    const occupied = db
      .prepare('SELECT id FROM users WHERE username = ? AND id <> ?')
      .get(username, auth.user.id);
    if (occupied) return fail('这个账号已被占用', 409);
  }

  const passwordHash = passwordChanged ? await hashPasswordAsync(newPassword) : row.password_hash;

  try {
    db.transaction(() => {
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(
        username,
        passwordHash,
        auth.user.id
      );
      destroyUserSessions(auth.user.id);
    })();
  } catch (error) {
    console.error('[api/account]', error);
    return fail('更新账号失败，请稍后重试', 500);
  }

  const rotated = createSession(auth.user.id);
  setSessionCookie(context, rotated.token, rotated.expiresAt);

  clearFailures(key);
  return json({
    ok: true,
    user: { id: auth.user.id, username },
    passwordChanged,
    csrf: rotated.csrf,
  });
}

/* --------------------------------------------------------------------------
   posts
   -------------------------------------------------------------------------- */

async function posts(context: APIContext, rest: string[], method: string): Promise<Response> {
  const slug = rest[0];

  if (rest.length === 0 && method === 'GET') {
    const auth = getAuth(context);
    return json({ posts: listPosts({ includeDrafts: Boolean(auth) }) });
  }

  if (rest.length === 1 && method === 'GET') {
    const auth = getAuth(context);
    const post = getPostBySlug(slug!, Boolean(auth));
    if (!post) return fail('文章不存在', 404);
    return json({ post });
  }

  if (rest.length === 0 && method === 'POST') {
    const denied = requireCsrf(context);
    if (denied) return denied;
    const body = await readJson<Partial<PostInput>>(context.request);
    const error = validatePostInput(body, true);
    if (error) return fail(error, 400);
    if (getPostBySlug(body!.slug!, true)) return fail('slug 已存在', 409);
    try {
      return json({ post: createPost(body as PostInput) }, 201);
    } catch (e) {
      console.error('[api/posts] create', e);
      return fail('创建文章失败', 500);
    }
  }

  if (rest.length === 1 && method === 'PUT') {
    const denied = requireCsrf(context);
    if (denied) return denied;
    const current = getPostBySlug(slug!, true);
    if (!current) return fail('文章不存在', 404);
    const body = await readJson<Partial<PostInput> & { version?: number }>(context.request);
    if (!body) return fail('请求体不是合法 JSON', 400);
    const error = validatePostInput(body, false);
    if (error) return fail(error, 400);
    if (body.slug && body.slug !== current.slug) {
      if (getPostBySlug(body.slug, true)) {
        return fail('slug 已存在', 409);
      }
      migratePostSlugAssets(current.slug, body.slug);
      body.bodyMarkdown = rewritePostSlugReferences(
        body.bodyMarkdown ?? current.bodyMarkdown,
        current.slug,
        body.slug
      );
      if (body.rawMarkdown ?? current.rawMarkdown) {
        body.rawMarkdown = rewritePostSlugReferences(
          body.rawMarkdown ?? current.rawMarkdown,
          current.slug,
          body.slug
        );
      }
      if (body.cover ?? current.cover) {
        body.cover = rewritePostSlugReferences(
          (body.cover ?? current.cover) || '',
          current.slug,
          body.slug
        );
      }
    }
    const updated = updatePost(current.id, body, body.version);
    if (!updated) return fail('文章已在别处被修改，请刷新后重试', 409);
    return json({ post: updated });
  }

  if (rest.length === 1 && method === 'DELETE') {
    const denied = requireCsrf(context);
    if (denied) return denied;
    const current = getPostBySlug(slug!, true);
    if (!current) return fail('文章不存在', 404);
    deletePost(current.id);
    return json({ ok: true });
  }

  return fail('接口不存在', 404);
}

function validatePostInput(body: Partial<PostInput> | null, requireSlug: boolean): string | null {
  if (!body) return '请求体不是合法 JSON';
  if (requireSlug || body.slug !== undefined) {
    if (!body.slug || !SLUG_RE.test(body.slug)) return 'slug 只能用小写字母、数字、-、_';
  }
  if (requireSlug || body.title !== undefined) {
    if (!body.title?.trim()) return '标题不能为空';
  }
  if (requireSlug || body.pubDate !== undefined) {
    if (!body.pubDate || !DATE_RE.test(body.pubDate)) return 'pubDate 必须是 YYYY-MM-DD';
  }
  if (requireSlug || body.bodyMarkdown !== undefined) {
    if (typeof body.bodyMarkdown !== 'string') return 'bodyMarkdown 必须是字符串';
  }
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string'))) {
    return 'tags 必须是字符串数组';
  }
  return null;
}

/* --------------------------------------------------------------------------
   权限小工具
   -------------------------------------------------------------------------- */

export function requireAuth(
  context: APIContext
): { auth: AuthContext } | { response: Response } {
  const auth = getAuth(context);
  if (!auth) return { response: fail('未登录', 401) };
  return { auth };
}

export function requireCsrf(context: APIContext): Response | null {
  const auth = getAuth(context);
  if (!auth) return fail('未登录', 401);
  if (!hasValidCsrf(context, auth)) return fail('CSRF 校验失败', 403);
  return null;
}
