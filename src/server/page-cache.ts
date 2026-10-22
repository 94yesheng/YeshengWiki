/**
 * 公开页面内存缓存 + 内容版本号。
 *
 * - 页面缓存：按 `pathname + search` 缓存 200 HTML，命中后直接返回，避免重复 SSR。
 * - 内容版本：任何内容/设置写入调用 `bumpContentVersion()`，让页面缓存与各 repository
 *   的派生缓存一起失效，保证后台修改后前台立刻可见。
 */
import { createHash } from 'node:crypto';

export interface CachedPage {
  html: string;
  contentType: string;
  etag: string;
  version: number;
  expiresAt: number;
}

const PAGE_CACHE_TTL_MS = 5 * 60_000;
const PAGE_CACHE_MAX_ENTRIES = 64;

let contentVersion = 0;
const pageCache = new Map<string, CachedPage>();

export function getContentVersion(): number {
  return contentVersion;
}

/** 内容或设置发生变化：递增版本并清空页面缓存。 */
export function bumpContentVersion(): void {
  contentVersion += 1;
  pageCache.clear();
}

export function getCachedPage(key: string): CachedPage | null {
  const entry = pageCache.get(key);
  if (!entry) return null;

  if (entry.version !== contentVersion || entry.expiresAt <= Date.now()) {
    pageCache.delete(key);
    return null;
  }

  // Map 的插入顺序即 LRU 顺序：命中后移到末尾。
  pageCache.delete(key);
  pageCache.set(key, entry);
  return entry;
}

export function setCachedPage(
  key: string,
  html: string,
  contentType: string
): CachedPage {
  const etag = `"${createHash('sha1').update(html).digest('hex').slice(0, 16)}"`;
  const entry: CachedPage = {
    html,
    contentType,
    etag,
    version: contentVersion,
    expiresAt: Date.now() + PAGE_CACHE_TTL_MS,
  };

  if (pageCache.has(key)) {
    pageCache.delete(key);
  } else if (pageCache.size >= PAGE_CACHE_MAX_ENTRIES) {
    const oldest = pageCache.keys().next().value;
    if (oldest !== undefined) pageCache.delete(oldest);
  }

  pageCache.set(key, entry);
  return entry;
}
