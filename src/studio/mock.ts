/**
 * 后台「UI 交互演示模式」的数据。
 *
 * 2026-10-18 从 demo/studio_hud.html 的原型数据重建，并按当前项目包的类型收敛：
 *   · 文章使用 3 篇演示稿（不是仓库里的真实草稿，避免把未发布内容打进前端包）
 *   · 照片墙直接复用 src/content/photos/demo-wall.json
 *   · 友链 / 站点配置直接复用仓库里的 JSON
 */
import type { LinksFile, PostEntry, SiteFile, WallEntry, WallPhoto } from './content';
import type { ParsedFile } from './frontmatter';
import siteJson from '../site.data.json';
import linksJson from '../content/links.json';
import demoWallJson from '../content/photos/demo-wall.json';

export interface MockData {
  posts: PostEntry[];
  walls: WallEntry[];
  links: LinksFile;
  site: SiteFile;
  photoFiles: string[];
  postAssetFiles: string[];
}

function parsed(data: Record<string, unknown>, body: string): ParsedFile {
  return {
    data,
    body,
    layout: [],
    raw: '',
    separator: '\n',
  };
}

function post(
  id: string,
  data: Record<string, unknown>,
  body: string
): PostEntry {
  return {
    path: `src/content/posts/${id}.md`,
    sha: '',
    id,
    parsed: parsed({ draft: false, autoUpdated: true, ...data }, body),
  };
}

const mockPosts: PostEntry[] = [
  post(
    'demo-ji-bao',
    {
      title: '3月9号，想吃鸡煲',
      pubDate: '2026-03-09',
      description: '校外那间普通的重庆鸡公煲贴上了旺铺出租，记下这些微不足道却真实存在的生活切片。',
      lead: '有些念头其实没有什么严密的逻辑推导，就像在三月初春的傍晚突然很想吃一锅热气腾腾的炭火鸡煲。',
      tags: ['随笔', '日常'],
      entryBadge: 'ESSAY',
      featured: true,
      kineticCaption: 'THERMAL EQUILIBRIUM // 砂锅热传导与美拉德焦化反应曲线',
      railMode: 'default',
      railSpecs: [
        { label: '烹饪耗时', value: '35 MIN · 砂锅慢焗' },
        { label: '火候基准', value: '220°C 啫啫焦化' },
      ],
      railTopology: {
        enabled: true,
        node1Title: '01 MARINATE',
        node1Sub: '腌制锁水',
        node2Title: '02 SIZZLE',
        node2Sub: '砂锅爆香',
        node3Title: '03 GLAZE',
        node3Sub: '淋酒收汁',
      },
    },
    `今天做了一次鸡煲，味道非常好，给大家分享一下。

## 01 · 备料与切配清单

- 一只鸡，或者直接用四个鸡琵琶腿代替，切块。
- 大蒜 10 个，剥好就行。
- 小葱五根，葱白和葱绿分开，切段。

## 02 · 腌鸡与调汁配比

加两勺生抽、半勺老抽、一勺蚝油、半勺盐、少许白糖与半勺淀粉，抓匀后封上一层花生油锁水。

> **火候备忘**：下锅前务必确认砂锅烧至微微冒烟。

## 03 · 砂锅爆香与收汁火候

砂锅烧热下底油，姜蒜铺底爆出焦边，平铺鸡块焗八分钟，沿锅边淋一圈米酒即可。`
  ),
  post(
    'demo-toolbox',
    {
      title: '我的工具箱',
      pubDate: '2025-10-16',
      description: '主力机、屏幕、音频、开发环境与日常顺手软件的一份清单。',
      lead: '工具是思维的外骨骼。这里持续记录我日常写代码、处理照片与维护这座静态站点时真正高频使用的软硬件配置。',
      tags: ['工具', '效率'],
      entryBadge: 'TOOLKIT',
      kineticCaption: 'WORKFLOW TOPOLOGY // 软硬件外骨骼协同链路',
      railMode: 'default',
      railSpecs: [{ label: '主力系统', value: 'Windows 11 + WSL2' }],
    },
    `记一下自己平时写代码、写字、看东西在用的软硬件。

## 01 · 桌面硬件与外设

主力笔记本外接一台 27 寸 4K 显示器，搭配静电容键盘与轨迹球鼠标。

## 02 · 终端与开发环境

保持极简配置，所有核心快捷键与 dotfiles 均纳入 Git 版本追踪。

## 03 · 静态建站与摄影流程

使用 Astro 构建零运行时负担的内容归档，配合自建 /studio/ 蓝图工作台管理全文与照片墙。`
  ),
  post(
    'demo-yearbook',
    {
      title: '2025 年终总结',
      pubDate: '2025-12-31',
      description: '写下 2025 这一年的读书、出游、折腾与心境。',
      lead: '站在岁末回看，真正留下痕迹的往往不是宏大的计划，而是山城江畔的一次日落、几顿亲手做的晚饭。',
      tags: ['总结', '生活'],
      entryBadge: 'ESSAY',
      kineticCaption: '',
      railMode: 'default',
    },
    `又到年底，把这一年零碎的片段拢一拢。

## 01 · 山城行迹与日常切片

这一年走了几个地方，也拍下了一些无需过多解释的光影瞬间。

## 02 · 阅读与代码手记

慢下来读完了几本早就列在书单里的书，同时把个人博客重构成如今这幅干净的象限蓝图。`
  ),
];

const demoWall = demoWallJson as unknown as {
  title: string;
  date: string;
  place: string;
  note: string;
  photos: WallPhoto[];
};

const photoFiles = [
  '2022-06-01-IMG_20220601_195659.jpg',
  '2024-07-08-2R9A9476.jpg',
  '2024-07-17-chongqing.jpg',
  '2024-10-07-日落.jpg',
  '2025-03-07-接入效果.png',
  '2026-02-24-Blender练习.png',
  '2026-03-09-另一张.jpg',
  '2026-03-09-城市壁纸.png',
  '2026-03-09-鸡煲.jpg',
  '2026-03-13-服务器截图.png',
];

const postAssetFiles = [
  'blender-01.png', 'blender-02.png', 'blender-03.png', 'blender-04.png', 'blender-06.png', 'blender-07.png',
  'deepseek-wechat-01.png', 'deepseek-wechat-02.png', 'deepseek-wechat-05.png', 'deepseek-wechat-06.png',
  'deepseek-wechat-07.png', 'deepseek-wechat-08.png', 'deepseek-wechat-09.png', 'deepseek-wechat-10.png',
  'deepseek-wechat-11.png', 'deepseek-wechat-12.png', 'deepseek-wechat-13.png', 'deepseek-wechat-14.png',
  'deepseek-wechat-15.png', 'deepseek-wechat-16.png', 'deepseek-wechat-17.png', 'deepseek-wechat-18.png',
  'deepseek-wechat-19.png', 'ji-bao-01.jpg', 'ji-bao-02.jpg', 'maptoposter-01.png', 'maptoposter-03.png',
  'maptoposter-04.png', 'maptoposter-06.png', 'maptoposter-08.png', 'mc-server-01.png', 'mc-server-02.png',
  'mc-server-03.png', 'mc-server-04.png', 'mc-server-06.png', 'mc-server-07.png', 'mc-server-08.png',
  'mc-server-09.png',
];

export function loadMockAll(): MockData {
  const links = linksJson as unknown as LinksFile;
  const site = siteJson as unknown as Record<string, unknown>;
  const wall: WallEntry = {
    path: 'src/content/photos/demo-wall.json',
    sha: '',
    id: 'demo-wall',
    title: demoWall.title,
    date: demoWall.date,
    place: demoWall.place,
    note: demoWall.note,
    photos: demoWall.photos.map((p) => ({ ...p })),
    extra: {},
  };
  return {
    posts: mockPosts.map((p) => ({
      ...p,
      parsed: {
        ...p.parsed,
        data: JSON.parse(JSON.stringify(p.parsed.data)) as Record<string, unknown>,
      },
    })),
    walls: [wall],
    links: { sha: '', links: links.links.map((l) => ({ ...l })) },
    site: { sha: '', data: JSON.parse(JSON.stringify(site)) as Record<string, unknown> },
    photoFiles,
    postAssetFiles,
  };
}
