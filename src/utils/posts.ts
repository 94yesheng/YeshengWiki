import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';

export type Post = CollectionEntry<'posts'>;

/**
 * 文章配图，按文件名索引：'ji-bao-01.jpg' → ImageMetadata
 * （和 utils/photos.ts 里那套完全一样的写法 —— 图片资源都在 src/assets/ 下，
 *   Astro 在构建时统一压成多尺寸 WebP）
 */
const postImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/posts/*.{jpg,jpeg,png,webp,avif}',
  { eager: true }
);

const imagesByName = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(postImages)) {
  imagesByName.set(path.split('/').pop() ?? path, mod.default);
}

/** markdown 图片语法。只认 `![](...)` —— 原始 HTML 块里的 <iframe>/<img> 一律不算 */
const MD_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)/;

/** 行内 markdown 记号 → 纯文本（梗概是给人看的，不该带着 ** 和 []() ） */
function stripInlineMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片整段去掉
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只留文字
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]+>/g, '') // 残留的内联标签
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 文章的开头一段 —— 给主页「最新一篇」那块当梗概。
 *
 * 【为什么不直接用 frontmatter 的 description】
 * 那是当初从旧站搬过来时硬截断的，5 条都恰好 55 字，末句常常断在半句、
 * 甚至断在没闭合的括号里（mc-server 那条停在「（主要是我也不」）。
 *
 * 【为什么不是字面意义上的"第一个段落"】
 * 因为那会取到垃圾：maptoposter 和 mc-server 的第一段都只有一行 `**前言：**`，
 * deepseek 那篇以 `-` 列表项开头，ji-bao 正文开头还有个网易云播放器的 HTML 块。
 * 所以规则是"第一个**有实质内容**的段落"：跳过 HTML 块、纯图片段、分隔符、
 * 标题、以及太短的标签行；如果这一段本身太短（ji-bao 的开场只有 21 字），
 * 就续上后面几段让它凑成一个像样的开头。太长的由 CSS 的 line-clamp 收尾。
 */
export function getPostLead(post: Post): string {
  const blocks = (post.body ?? '').split(/\n\s*\n/);
  const parts: string[] = [];
  let length = 0;

  for (const block of blocks) {
    const raw = block.trim();
    if (!raw) continue;
    if (/^</.test(raw)) continue; // 原始 HTML 块
    if (/^\*(\s+\*)+$/.test(raw)) continue; // ＊ ＊ ＊ 分隔符
    if (/^(#{1,6}\s|>|\||```)/.test(raw)) continue; // 标题 / 引用 / 表格 / 代码

    const text = stripInlineMarkdown(raw);
    if (text.length < 12) continue; // 光秃秃的"前言："这种标签行
    parts.push(text);
    length += text.length;
    // 够一段像样的开头就收手；最多也只看前 3 个有效段落
    if (length >= 45 || parts.length >= 3) break;
  }

  return parts.join(' ') || post.data.description || '';
}

/**
 * 文章的封面 —— **正文里的第一张图**，没有就返回 null。
 *
 * 为什么不从 frontmatter 取：那要给每篇文章多加一个字段、每篇手动选图，
 * 而"正文第一张图"本来就是作者最先想让人看到的那张，零维护。
 * 想某篇换封面时再说（到那时再加字段覆盖也不迟）。
 *
 * 为什么要读 `post.body`（原始 markdown）而不是 `post.rendered.html`：
 * 后者里图片还是 `__ASTRO_IMAGE_` 占位符，要等 render() 才会变成真正的 <img>，
 * 在页面里解析它拿不到文件名。
 *
 * 注意 ji-bao 那篇：正文第一个媒体元素是网易云播放器的 <iframe>（在原始 HTML 块里）。
 * 只匹配 markdown 图片语法，天然跳过它 —— 这是个踩过的坑，别改成"找第一个 <img"。
 */
export function getPostCover(post: Post): ImageMetadata | null {
  const match = MD_IMAGE.exec(post.body ?? '');
  if (!match) return null;
  const fileName = match[1].split('/').pop() ?? '';
  return imagesByName.get(fileName) ?? null;
}

/** 已发布文章，按时间倒序 —— 全站唯一的时间轴顺序来源 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}


export interface TagInfo {
  tag: string;
  count: number;
}

/** 全部标签及出现次数，按次数降序、同次数按拼音序 */
export function collectTags(posts: Post[]): TagInfo[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hans-CN'));
}

/** 筛选出带某个标签的文章 */
export function postsWithTag(posts: Post[], tag: string): Post[] {
  return posts.filter((p) => p.data.tags.includes(tag));
}
