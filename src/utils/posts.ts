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

/** 按年份分组，年份倒序 */
export function groupByYear(posts: Post[]): Array<{ year: number; posts: Post[] }> {
  const map = new Map<number, Post[]>();
  for (const post of posts) {
    const year = post.data.pubDate.getFullYear();
    const list = map.get(year);
    if (list) list.push(post);
    else map.set(year, [post]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({ year, posts: list }));
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
