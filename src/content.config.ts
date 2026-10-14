import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/**
 * 文章
 * 每篇一个 Markdown 文件，放在 src/content/posts/
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** 列表页不显示摘要，只有 RSS 和 meta 用得上 */
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    /** 草稿不会出现在任何列表、RSS 或 sitemap 里 */
    draft: z.boolean().default(false),
  }),
});

/**
 * 友链
 * 单独一个 JSON 文件，方便手工增删；以后接管理端也只需改写它
 *
 * 顶层是对象 `{ links: [...] }` 而不是数组：网页后台（Sveltia）的
 * 「单文件集合」把字段映射到对象的属性上，根是数组就没有可映射的字段名。
 * 所以用 parser 在读取时把 links 数组拆出来，schema 与消费方都不受影响。
 */
const links = defineCollection({
  loader: file('./src/content/links.json', {
    parser: (text) => JSON.parse(text).links,
  }),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    description: z.string().default(''),
  }),
});

/**
 * 照片墙
 *
 * 【为什么这里从"扫描图片目录"改成了内容集合】
 * 早先的做法是扫描 src/assets/photos/，从**文件名**解析日期和说明。但照片墙需要
 * 标题、地点、记录文字 —— 这些都塞不进文件名（不能含 `/`、长度有限，改一次等于
 * 重命名文件）。而且"一面墙可以只有一张照片、也可以有很多张"这个**分组关系**
 * 必须显式记录下来，光靠文件系统表达不了。所以改成数据文件。
 *
 * 【为什么一面墙一个文件，而不是一个大 JSON】
 * 后台改一面墙就只动一个文件，diff 干净、不会和别的墙互相干扰；增删一面墙就是
 * 增删一个文件。这和文章（一篇文章一个 .md）是同一套思路。
 *
 * 图片本身仍然放在 src/assets/photos/，靠 photos[].file 按文件名关联，
 * 由 src/utils/photos.ts 解析回可用的图片对象。
 */
const photoWalls = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/photos' }),
  schema: z.object({
    title: z.string(),
    /** 可留空：没标注时间的墙会排在时间轴最后 */
    date: z
      .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期要写成 2024-07-17 这种格式')])
      .optional(),
    place: z.string().default(''),
    note: z.string().default(''),
    photos: z
      .array(
        z.object({
          file: z.string(),
          /** 单张的说明，可留空 */
          caption: z.string().default(''),
        })
      )
      .default([]),
  }),
});

export const collections = { posts, links, photoWalls };
