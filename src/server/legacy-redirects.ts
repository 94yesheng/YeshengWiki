/**
 * 旧 WordPress 链接 → 新站路径（301）。
 *
 * 旧站是 WordPress 默认的 plain 永久链接：`/?p=<ID>`、`/?page_id=<ID>`；
 * 导出数据里还保留了百分号编码的中文 slug，历史上也可能被直接访问。
 * 映射表在 `legacy-redirects.json`：`scripts/import-wordpress.mjs` 也从这里读 slug，
 * 不要再在别处复制一份。
 *
 * 只做精确匹配（ID / 完整 slug / 固定路径），不猜前缀，避免把正常 404 变成错误跳转。
 */
import legacyJson from './legacy-redirects.json';

interface LegacyPost {
  id: number;
  slug: string;
  legacySlugs: string[];
}

interface LegacyPage {
  id: number;
  path: string;
  legacySlugs: string[];
}

interface LegacyRedirectData {
  posts: LegacyPost[];
  pages: LegacyPage[];
  paths: Record<string, string>;
}

const data = legacyJson as LegacyRedirectData;

/** 比较用：NFC + 小写 + 去掉首尾斜杠（`/Feed/` 与 `feed` 视为同一个）。 */
function normalize(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/^\/+|\/+$/g, '');
}

/** 百分号编码的中文路径解码；坏编码就按原样比较，不抛错。 */
function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

const postById = new Map<string, string>();
const postByLegacySlug = new Map<string, string>();
for (const post of data.posts) {
  const target = `/posts/${post.slug}/`;
  postById.set(String(post.id), target);
  for (const slug of post.legacySlugs) postByLegacySlug.set(normalize(slug), target);
}

const pageById = new Map<string, string>();
const pageByLegacySlug = new Map<string, string>();
for (const page of data.pages) {
  pageById.set(String(page.id), page.path);
  for (const slug of page.legacySlugs) pageByLegacySlug.set(normalize(slug), page.path);
}

const fixedPaths = new Map<string, string>();
for (const [from, to] of Object.entries(data.paths)) {
  fixedPaths.set(normalize(from), to);
}

/**
 * 返回 301 目标路径；不是旧链接就返回 null（交给正常路由，保持原有 404 行为）。
 */
export function legacyRedirectTarget(url: URL): string | null {
  // plain permalink：查询参数只在这种旧 URL 上有意义
  if (url.pathname === '/' || url.pathname === '/index.php') {
    const postId = url.searchParams.get('p');
    if (postId) return postById.get(postId) ?? null;

    const pageId = url.searchParams.get('page_id');
    if (pageId) return pageById.get(pageId) ?? null;
  }

  const key = normalize(decodePath(url.pathname));
  return postByLegacySlug.get(key) ?? pageByLegacySlug.get(key) ?? fixedPaths.get(key) ?? null;
}
