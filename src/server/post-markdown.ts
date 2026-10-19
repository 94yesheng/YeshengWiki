/**
 * 服务端解析完整 Markdown（frontmatter + 正文）→ posts 表字段。
 * 后台保存走这里，public 页面只读列。
 */
import * as YAML from 'js-yaml';
import type { Post, PostInput } from './repositories/posts';

export interface ParsedPost extends PostInput {
  rawMarkdown: string;
  bodyMarkdown: string;
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(value);
}

function rewriteAssetPaths(markdown: string): string {
  return markdown
    .replaceAll('../../assets/posts/', '/uploads/posts/')
    .replaceAll('../../assets/photos/', '/uploads/photos/')
    .replaceAll('/src/assets/posts/', '/uploads/posts/')
    .replaceAll('/src/assets/photos/', '/uploads/photos/');
}

function firstImage(markdown: string): string | null {
  const m = /!\[[^\]]*\]\(\s*([^)\s]+)/.exec(markdown);
  if (!m) return null;
  const src = rewriteAssetPaths(m[1]);
  // 站内路径已经带上了 /uploads/posts/；文章配图现在按 slug 归档（/uploads/posts/<slug>/<file>），
  // 所以不能只取 basename，否则封面会丢一层目录。
  const idx = src.indexOf('/uploads/posts/');
  const rel = idx >= 0 ? src.slice(idx + '/uploads/posts/'.length) : (src.split('/').pop() ?? '');
  return rel ? `/uploads/posts/${rel}` : null;
}

export function parsePostMarkdown(raw: string, slug: string): ParsedPost {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error('缺少 frontmatter（--- / ---）');

  let data: Record<string, unknown> = {};
  try {
    data = (YAML.load(m[1]) as Record<string, unknown>) ?? {};
  } catch (error) {
    throw new Error(`frontmatter YAML 解析失败：${(error as Error).message}`);
  }

  const bodyMarkdown = rewriteAssetPaths(m[2] ?? '');
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  const title = String(data.title ?? '').trim();
  if (!title) throw new Error('标题不能为空');
  const pubDate = isoDate(data.pubDate);
  if (!pubDate) throw new Error('pubDate 必须是 YYYY-MM-DD');

  return {
    slug,
    title,
    description: data.description ? String(data.description) : null,
    lead: data.lead ? String(data.lead) : null,
    bodyMarkdown,
    rawMarkdown: rewriteAssetPaths(text),
    cover: data.cover ? rewriteAssetPaths(String(data.cover)) : firstImage(bodyMarkdown),
    coverCaption: data.coverCaption ? String(data.coverCaption) : null,
    entryBadge: data.entryBadge ? String(data.entryBadge) : null,
    featured: Boolean(data.featured),
    draft: Boolean(data.draft),
    pubDate,
    updatedDate: data.updatedDate ? isoDate(data.updatedDate) : null,
    kineticCaption: data.kineticCaption ? String(data.kineticCaption) : null,
    railMode: data.railMode ? String(data.railMode) : null,
    railSpecs: Array.isArray(data.railSpecs)
      ? (data.railSpecs as Array<{ label: string; value: string }>)
      : null,
    railTopology:
      data.railTopology && typeof data.railTopology === 'object'
        ? (data.railTopology as Record<string, unknown>)
        : null,
    tags,
    autoUpdated: typeof data.autoUpdated === 'boolean' ? data.autoUpdated : null,
  };
}

/** 老数据没有 raw_markdown 时，从列重建一份可编辑的 Markdown。 */
export function buildPostMarkdown(post: Post): string {
  if (post.rawMarkdown?.trim()) return post.rawMarkdown;
  const data: Record<string, unknown> = {
    title: post.title,
    pubDate: post.pubDate,
  };
  if (post.description) data.description = post.description;
  if (post.lead) data.lead = post.lead;
  if (post.tags.length) data.tags = post.tags;
  if (post.entryBadge) data.entryBadge = post.entryBadge;
  if (post.cover) data.cover = post.cover;
  if (post.coverCaption) data.coverCaption = post.coverCaption;
  if (post.featured) data.featured = true;
  if (post.draft) data.draft = true;
  if (post.updatedDate) data.updatedDate = post.updatedDate;
  if (post.kineticCaption) data.kineticCaption = post.kineticCaption;
  if (post.railMode) data.railMode = post.railMode;
  if (post.railSpecs) data.railSpecs = post.railSpecs;
  if (post.railTopology) data.railTopology = post.railTopology;
  if (post.autoUpdated !== null) data.autoUpdated = post.autoUpdated;
  return `---\n${YAML.dump(data, { lineWidth: -1, noRefs: true })}---\n${post.bodyMarkdown}`;
}
