/**
 * 子页文案配置（`site_settings.pages`）。
 *
 * 设计要点：
 * - 扁平 key（`posts.title` / `home.hero.intro`…），值一律是字符串；
 *   需要多行的地方用 `\n` 分隔，页面自己 split。
 * - 每个 key 在 SCHEMA 里有默认值，数据库里只存改过的值：
 *   读的时候「默认值 ← 数据库覆盖」合并，所以新增字段永远有兜底。
 * - 后台「页面」板块直接按 SCHEMA 生成表单，不需要为每个字段写 UI。
 * - 文案里可以用 `{count}` / `{total}` / `{chars}` 这类占位符，由页面传入。
 */
import { getSetting } from '../repositories/settings';

export type PageKey = 'home' | 'posts' | 'photos' | 'programs' | 'links';

export interface PageField {
  key: string;
  label: string;
  default: string;
  /** text=单行；textarea=多行；lines=多行且按行拆成数组（页面里自己 split('\n')） */
  type?: 'text' | 'textarea' | 'lines';
  hint?: string;
}

export interface PageDef {
  key: PageKey;
  label: string;
  route: string;
  desc: string;
  fields: PageField[];
}

export const PAGE_DEFS: PageDef[] = [
  {
    key: 'home',
    label: '主页',
    route: '/',
    desc: '首屏自述、加载动画与五屏导航角标',
    fields: [
      { key: 'home.loader.status', label: '加载动画状态文字', default: 'INFINITY MANIFOLD // 正在展开立体无限流形' },
      { key: 'home.hero.originBadge', label: '首屏左上角坐标徽标', default: 'ORIGIN (0, 0, L3)' },
      {
        key: 'home.hero.topbarTag',
        label: '首屏顶栏标签',
        default: 'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场',
        hint: '切换夜间模式后会被脚本替换成黑洞模式文案',
      },
      {
        key: 'home.hero.coordText',
        label: '首屏坐标说明',
        default: 'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）',
      },
      {
        key: 'home.hero.intro',
        label: '首屏自述段落',
        type: 'lines',
        default:
          '这里是夜笙的小世界。写点技术笔记，也写点没什么用但想记下来的事。\n如果抵达不了人生的高度，那就尽可能的探索世界的广度吧。',
        hint: '一行一段',
      },
      { key: 'home.hero.metaPosts', label: '首屏导航 · 文章角标', default: '{count} 篇' },
      { key: 'home.hero.metaPhotos', label: '首屏导航 · 照片角标', default: '最新组' },
      { key: 'home.hero.metaPrograms', label: '首屏导航 · 程序角标', default: '工坊' },
      { key: 'home.hero.metaLinks', label: '首屏导航 · 友链角标', default: '邻人·我' },
    ],
  },
  {
    key: 'posts',
    label: '文章',
    route: '/posts/',
    desc: '文章页文案 + 主页文章屏说明 + 文章右栏',
    fields: [
      { key: 'posts.title', label: '页面标题', default: '文章' },
      { key: 'posts.description', label: 'SEO 描述', type: 'textarea', default: '按时间从近及远排列的全部文章，支持标签筛选与关键词检索。' },
      { key: 'posts.allTag', label: '「全部」标签文案', default: '全部' },
      { key: 'posts.uncategorized', label: '无标签文章的占位标签', default: '未分类' },
      { key: 'posts.readLabel', label: '卡片阅读按钮文案', default: '进入详细页阅读' },
      { key: 'posts.empty', label: '空态文案', default: '还没有文章。去 /studio/ 写第一篇。' },
      { key: 'posts.origin', label: '时间轴起点说明', default: 'ORIGIN (0, 0) // 时间从这里开始' },
      { key: 'posts.now', label: '时间轴顶端说明', default: 'NOW // PRESENT HORIZON · 时间轴顶端（由近及远）' },
      { key: 'posts.statTotal', label: '右栏统计 · 总数', default: '{count} 篇长短文' },
      { key: 'posts.statVisible', label: '右栏统计 · 可见', default: '{count} / {count} 篇可见' },
      { key: 'posts.statWords', label: '右栏统计 · 字数', default: '约 {chars} 字' },
      { key: 'posts.unit', label: '篇数单位', default: '篇' },
      {
        key: 'home.posts.note',
        label: '主页文章屏 · 顶栏说明',
        type: 'textarea',
        default:
          '三层阅读架构：点击顶栏「文章」或本栏标题进入「文章归档子页（时间轴）」，点击文章标题可直接进入「文章详细页」。',
      },
    ],
  },
  {
    key: 'photos',
    label: '相册',
    route: '/photos/',
    desc: '照片页文案 + 主页相册屏说明',
    fields: [
      { key: 'photos.title', label: '页面标题', default: '照片' },
      { key: 'photos.description', label: 'SEO 描述', type: 'textarea', default: '保持原始比例的照片档案，可检视拍摄参数与完整影集。' },
      { key: 'photos.all', label: '「全部」筛选项', default: '全部影像' },
      { key: 'photos.latest', label: '最新一组的分组名', default: '最新一组' },
      { key: 'photos.earlier', label: '早期照片的分组名', default: '早期与数字造物' },
      { key: 'photos.scrollLabel', label: '向下滚动提示', default: '↓ 向下滚动浏览全部影集网格' },
      { key: 'photos.empty', label: '空态文案', default: '暂无照片。去 /studio/ 上传第一组。' },
      {
        key: 'home.photos.note',
        label: '主页相册屏 · 顶栏说明',
        type: 'textarea',
        default:
          '展示最新一组照片（保持原图宽高比），当图片宽度超出本栏右边界时自动隐藏不越界；点击进入照片信息详细页。',
      },
    ],
  },
  {
    key: 'programs',
    label: '项目',
    route: '/programs/',
    desc: '项目页文案 + 主页程序屏说明',
    fields: [
      { key: 'programs.title', label: '页面标题', default: '程序' },
      { key: 'programs.note', label: '页面导语', type: 'textarea', default: '小工具与物理渲染实验' },
      { key: 'programs.description', label: 'SEO 描述', type: 'textarea', default: '做过的小工具与实验项目。' },
      { key: 'programs.emptyTitle', label: '空态标题', default: '暂无程序数据' },
      {
        key: 'programs.emptyText',
        label: '空态说明',
        type: 'textarea',
        default: '程序数据已清空。可在 /studio/ 的「程序工坊」里添加模块，保存后这里会立即显示。',
      },
      { key: 'programs.emptyCta', label: '空态按钮', default: '打开后台 →' },
      { key: 'programs.viewCta', label: '模块链接兜底文案', default: '查看项目 →' },
      { key: 'programs.statusFallback', label: '模块状态兜底文案', default: '运行中' },
      { key: 'programs.hostCta', label: '控制台底部按钮', default: '前往主页体验 →' },
      {
        key: 'home.programs.note',
        label: '主页程序屏 · 顶栏说明',
        type: 'textarea',
        default: '做过的小工具与实验项目。左侧为核心物理渲染控制台，右侧为模块化工具插槽。',
      },
    ],
  },
  {
    key: 'links',
    label: '友链',
    route: '/links/',
    desc: '友链页文案 + 主页友链屏说明 + 关于我与架构志',
    fields: [
      { key: 'links.title', label: '页面标题', default: '友链' },
      { key: 'links.note', label: '页面导语', type: 'textarea', default: '友链名录 · 本站规格 · 架构志' },
      { key: 'links.description', label: 'SEO 描述', type: 'textarea', default: '常看的独立博客友链，以及关于「夜笙的小世界」的站点架构与排版说明。' },
      { key: 'links.peersTitle', label: '友链小节标题', default: '一、邻人友链与本站名片' },
      { key: 'links.peersCount', label: '已收录数量说明', default: '已收录 {count} 个独立站点' },
      { key: 'links.peersEmpty', label: '没有友链时的说明', default: '虚位以待 · 欢迎互换友链' },
      { key: 'links.cardTitle', label: '本站名片标题', default: '本站名片 · 友链互换信息' },
      {
        key: 'links.cardIntro',
        label: '本站名片导言',
        type: 'textarea',
        default:
          '如果你也在维护一个认真写字、记录技术笔记或生活广度的独立博客，欢迎通过下方规格互换友链。友链数据存储在服务器的 SQLite 数据库中，可通过 /studio/ 后台即时维护。',
      },
      { key: 'links.specName', label: '规格 · 站点名称', default: '站点名称' },
      { key: 'links.specTagline', label: '规格 · 站点副标', default: '站点副标' },
      { key: 'links.specUrl', label: '规格 · 站点地址', default: '站点地址' },
      { key: 'links.specRss', label: '规格 · RSS 订阅', default: 'RSS 订阅' },
      { key: 'links.copyBtn', label: '复制名片按钮', default: '复制本站友链信息' },
      { key: 'links.copyDone', label: '复制成功提示', default: '已复制本站名片' },
      { key: 'links.colophonTitle', label: '架构志小节标题', default: '二、站点说明（Site Colophon）' },
      { key: 'links.colophonNote', label: '架构志小节说明', default: '建站初衷 · 服务端渲染 · SQLite · 昼夜双模态' },
      { key: 'links.empty', label: '空态文案', default: '暂无友链。' },
      {
        key: 'home.links.note',
        label: '主页友链屏 · 顶栏说明',
        type: 'textarea',
        default: '常来常往的邻人独立博客友链，以及关于「我」与「本站」的建站自述。',
      },
    ],
  },
];

const DEFAULTS: Record<string, string> = Object.fromEntries(
  PAGE_DEFS.flatMap((page) => page.fields.map((field) => [field.key, field.default]))
);

export const PAGE_KEYS: string[] = Object.keys(DEFAULTS);

export type PageValues = Record<string, string>;

/** 读「默认值 ← 数据库覆盖」合并后的文案表。 */
export function getPageValues(): PageValues {
  const stored = getSetting<Record<string, unknown>>('pages', {});
  const values: PageValues = { ...DEFAULTS };
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(stored)) {
      if (!(key in DEFAULTS)) continue; // 只认 schema 里有的 key，避免脏数据
      if (typeof value === 'string') values[key] = value;
    }
  }
  return values;
}

/** 取一条文案并替换 `{foo}` 占位符；缺失时回落到默认值。 */
export function copy(
  values: PageValues,
  key: string,
  vars?: Record<string, string | number>
): string {
  const raw = values[key] ?? DEFAULTS[key] ?? '';
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/** 多行文案 → 数组（去掉空行与首尾空白）。 */
export function copyLines(values: PageValues, key: string): string[] {
  return (values[key] ?? DEFAULTS[key] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 只保留 schema 里认识的 key，并丢掉与默认值相同的项（数据库只存改过的）。 */
export function sanitizePageValues(input: unknown): PageValues {
  const out: PageValues = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(key in DEFAULTS)) continue;
    if (typeof value !== 'string') continue;
    if (value === DEFAULTS[key]) continue;
    out[key] = value;
  }
  return out;
}

export { DEFAULTS as PAGE_COPY_DEFAULTS };
