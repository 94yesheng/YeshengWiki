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
  getAuth,
  hasValidCsrf,
  hashPassword,
  isRateLimited,
  recordFailure,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
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
import { deleteMedia, listMedia } from '../repositories/media';
import { listLinks, replaceLinks } from '../repositories/links';
import { getSettings, SETTING_KEYS, setSetting, type SettingKey } from '../repositories/settings';
import { handleFs } from './fs';
import { fail, json, readJson } from './http';
import {
  getPageValues,
  PAGE_COPY_DEFAULTS,
  PAGE_DEFS,
  sanitizePageValues,
} from '../pages';

interface LoginBody {
  username?: string;
  password?: string;
}

interface AccountBody {
  currentPassword?: string;
  username?: string;
  newPassword?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    return health();
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

  // /api/posts
  if (parts[0] === 'posts') {
    return posts(context, parts.slice(1), method);
  }

  // /api/walls
  if (parts[0] === 'walls' && method === 'GET') {
    return json({ walls: listWalls({ includeEmpty: true }) });
  }

  // /api/links
  if (parts[0] === 'links') {
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
    if (method === 'GET' && parts.length === 1) return json({ settings: getSettings() });
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

function health(): Response {
  try {
    const db = getDb();
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
  const username = body?.username?.trim() ?? '';
  const password = body?.password ?? '';

  if (!username || !password) return fail('请输入账号和密码', 400);

  const key = `${context.clientAddress || 'unknown'}:${username}`;
  if (isRateLimited(key)) return fail('尝试次数过多，请 10 分钟后再试', 429);

  const row = getDb()
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username) as { id: number; username: string; password_hash: string } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    recordFailure(key);
    return fail('账号或密码不对', 401);
  }

  clearFailures(key);
  const { token, csrf, expiresAt } = createSession(row.id);
  setSessionCookie(context, token, expiresAt);
  return json({ user: { id: row.id, username: row.username }, csrf });
}

async function logout(context: APIContext): Promise<Response> {
  const auth = getAuth(context);
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
  const currentPassword = body?.currentPassword ?? '';
  const username = (body?.username ?? '').trim();
  const newPassword = body?.newPassword ?? '';

  if (!currentPassword) return fail('请输入当前密码', 400);
  if (!username) return fail('账号不能为空', 400);
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
    return fail('账号需为 3-32 位中英文、数字或 ._-', 400);
  }
  if (newPassword && newPassword.length < 8) return fail('新密码至少 8 位', 400);
  if (newPassword.length > 200) return fail('新密码太长', 400);

  const key = `account:${auth.user.id}:${context.clientAddress || 'unknown'}`;
  if (isRateLimited(key)) return fail('尝试次数过多，请 10 分钟后再试', 429);

  const db = getDb();
  const row = db
    .prepare('SELECT id, username, password_hash FROM users WHERE id = ?')
    .get(auth.user.id) as { id: number; username: string; password_hash: string } | undefined;
  if (!row) return fail('账号不存在', 404);

  if (!verifyPassword(currentPassword, row.password_hash)) {
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

  const passwordHash = passwordChanged ? hashPassword(newPassword) : row.password_hash;

  try {
    db.transaction(() => {
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(
        username,
        passwordHash,
        auth.user.id
      );
      // 改密后让其他设备/浏览器的旧会话失效，保留当前会话
      if (passwordChanged) {
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(
          auth.user.id,
          auth.sessionId
        );
      }
    })();
  } catch (error) {
    console.error('[api/account]', error);
    return fail('更新账号失败，请稍后重试', 500);
  }

  clearFailures(key);
  return json({
    ok: true,
    user: { id: auth.user.id, username },
    passwordChanged,
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
    if (body.slug && body.slug !== current.slug && getPostBySlug(body.slug, true)) {
      return fail('slug 已存在', 409);
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
