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
 * 照片不走内容集合，而是直接扫描图片目录。
 * 理由：照片会有几百张且持续增加，一张照片配一个 Markdown 文件维护成本太高。
 * 约定见 src/utils/photos.ts
 */
export const collections = { posts, links };
