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
    /** RSS 与搜索引擎 meta 描述 */
    description: z.string().optional(),
    /** 文章首屏导语 & 归档时间轴卡片梗概（留空则自动抽取正文首段） */
    lead: z.string().optional(),
    /** 象限分类标签 */
    tags: z.array(z.string()).default([]),
    /** 归档坐标徽标代号（如 LATEST / ESSAY / TOOLKIT / 3D MESH / LLM BRIDGE） */
    entryBadge: z.string().optional(),
    /** 16:9 封面图路径或资源文件名（留空则自动取正文首张图片） */
    cover: z.string().optional(),
    /** 封面底栏遥测图注（如 FRP / JAVA 21 / PAPERMC） */
    coverCaption: z.string().optional(),
    /** 是否在主页文章象限设为默认焦点文章 */
    featured: z.boolean().optional(),
    /** 文章详细页右侧三体画布底栏遥测副标题（如 LOCAL : 25565 <-> FRP） */
    kineticCaption: z.string().optional(),
    /** 文章详细页右侧悬浮栏模式：follow(跟随站点设置) | custom(单篇自定义速查卡) | topology(含拓扑图解+速查卡) */
    railMode: z.enum(['follow', 'custom', 'topology']).optional(),
    /** 单篇专属右侧悬浮栏「环境/文档速查卡」键值对 */
    railSpecs: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      )
      .optional(),
    /** 单篇专属右侧悬浮栏「拓扑图解卡」配置 */
    railTopology: z
      .object({
        enabled: z.boolean().optional(),
        kicker: z.string().optional(),
        badge: z.string().optional(),
        node1Title: z.string().optional(),
        node1Sub: z.string().optional(),
        node2Title: z.string().optional(),
        node2Sub: z.string().optional(),
        node3Title: z.string().optional(),
        node3Sub: z.string().optional(),
        line1: z.string().optional(),
        line2: z.string().optional(),
      })
      .optional(),
    /** 草稿不会出现在任何列表、RSS 或 sitemap 里 */
    draft: z.boolean().default(false),
    /**
     * 后台保存时要不要把「修订于」自动盖成今天。
     * **缺省 = 跟随全局开关**（site.data.json 的 studio.autoUpdated）；写 true/false 就是这一篇的例外。
     */
    autoUpdated: z.boolean().optional(),
  }),
});

/**
 * 友链
 * 单独一个 JSON 文件，支持单字徽章(avatar)、领域标签(tag)、站长信息(owner)与描述
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
    avatar: z.string().optional(),
    tag: z.string().optional(),
    owner: z.string().optional(),
  }),
});

/**
 * 照片墙（含单张照片的 EXIF 光学遥测参数与影调直方图数据）
 * 若某项摄影参数为空串 ""，用户侧展示页将自动启用「模糊化乱码」艺术化渲染。
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
          /** 单张照片标题（对应光学检视台标题） */
          title: z.string().optional(),
          /** 影像叙事长文 */
          story: z.string().optional(),
          /** 归档分组（latest / earlier） */
          group: z.string().optional(),
          /** 档案编号坐标 */
          coord: z.string().optional(),
          /** DATE // 拍摄日期 */
          date: z.string().optional(),
          /** LOCATION // 拍摄地点 */
          location: z.string().optional(),
          /** ASPECT // 原生画幅描述 */
          aspect: z.string().optional(),
          /** 精确宽高比 */
          ar: z.number().optional(),
          /** 画框比例角标 */
          ratioPill: z.string().optional(),
          /** CAMERA // 器材机身 */
          camera: z.string().optional(),
          /** LENS // 镜头焦段 */
          lens: z.string().optional(),
          /** EXPOSURE // 曝光参数 */
          exposure: z.string().optional(),
          /** COLOR // 色彩科学 */
          color: z.string().optional(),
          /** COORDINATES // 经纬坐标 */
          gps: z.string().optional(),
          /** LUMINANCE // 曝光补偿与动态范围 */
          ev: z.string().optional(),
          /** 16 段亮度直方图数组 */
          hist: z.array(z.number()).optional(),
          /** 哪些字段由原图 EXIF 自动读取（后台用于区分“自动读取/手动覆写”） */
          autoFields: z
            .array(
              z.enum(['date', 'location', 'aspect', 'camera', 'lens', 'exposure', 'color', 'gps', 'ev'])
            )
            .optional(),
        })
      )
      .default([]),
  }),
});

export const collections = { posts, links, photoWalls };
