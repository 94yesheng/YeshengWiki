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
import { getContentVersion } from '../page-cache';
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
    desc: '首屏主视觉自述、加载动画、四象限入口与五屏顶栏说明',
    fields: [
      { key: 'home.loader.status', label: '开屏加载动画状态文字', default: 'INFINITY MANIFOLD // 正在展开立体无限流形', hint: '全站开屏加载遮罩中央显示的遥测状态文字' },
      { key: 'home.hero.originBadge', label: '首屏左上角坐标徽标', default: 'ORIGIN (0, 0, L3)', hint: '显示在主页站名上方的橙色坐标铭牌' },
      {
        key: 'home.hero.topbarTag',
        label: '首屏顶栏状态标语',
        default: 'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场',
        hint: '白天模式首屏顶栏左侧标语',
      },
      {
        key: 'home.hero.coordText',
        label: '首屏顶栏居中说明',
        default: 'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）',
        hint: '白天模式首屏顶栏居中显示的几何流形说明',
      },
      {
        key: 'home.hero.equation',
        label: '首屏画布上方数学方程',
        default: 'L3 : x = a·cos(t)/(1+sin²t), y = b·sin(t)cos(t)/(1+sin²t), z = c·sin(t)',
        hint: '主页右侧 3D 流形画布顶栏展示的参数方程',
      },
      {
        key: 'home.hero.intro',
        label: '首屏个人自述段落',
        type: 'lines',
        default:
          '这里是夜笙的小世界。写点技术笔记，也写点没什么用但想记下来的事。\n如果抵达不了人生的高度，那就尽可能的探索世界的广度吧。',
        hint: '每行自动渲染为一个独立段落',
      },
      { key: 'home.hero.metaPosts', label: '首屏象限入口 01 · 文章角标', default: '{count} 篇', hint: '支持 {count} 自动替换为文章总数' },
      { key: 'home.hero.metaPhotos', label: '首屏象限入口 02 · 照片角标', default: '最新组' },
      { key: 'home.hero.metaPrograms', label: '首屏象限入口 03 · 程序角标', default: '工坊' },
      { key: 'home.hero.metaLinks', label: '首屏象限入口 04 · 友链角标', default: '邻人·我' },
      {
        key: 'home.posts.note',
        label: '主页第 02 屏（文章屏）顶栏说明',
        type: 'textarea',
        default:
          '三层阅读架构：点击顶栏「文章」或本栏标题进入「文章归档子页（时间轴）」，点击文章标题可直接进入「文章详细页」。',
      },
      {
        key: 'home.photos.note',
        label: '主页第 03 屏（相册屏）顶栏说明',
        type: 'textarea',
        default:
          '展示最新一组照片（保持原图宽高比），当图片宽度超出本栏右边界时自动隐藏不越界；点击进入照片信息详细页。',
      },
      {
        key: 'home.programs.note',
        label: '主页第 04 屏（程序屏）顶栏说明',
        type: 'textarea',
        default: '做过的小工具与实验项目。左侧为核心物理渲染控制台，右侧为模块化工具插槽。',
      },
      {
        key: 'home.links.note',
        label: '主页第 05 屏（友链屏）顶栏说明',
        type: 'textarea',
        default: '常来常往的邻人独立博客友链，以及关于「我」与「本站」的建站自述。',
      },
    ],
  },
  {
    key: 'posts',
    label: '文章',
    route: '/posts/',
    desc: '文章时间轴归档页首屏、检索筛选、统计卡片与文章右栏全局默认配置',
    fields: [
      { key: 'posts.title', label: '浏览器标签页标题 (SEO Title)', default: '文章', hint: '显示在浏览器标签页与站点标题栏' },
      { key: 'posts.description', label: '页面 SEO 摘要描述', type: 'textarea', default: '按时间从近及远排列的全部文章，支持标签筛选与关键词检索。' },
      { key: 'posts.heroKicker', label: '归档页首屏上方坐标铭牌', default: 'LAYER 02 // CHRONICLE TIMELINE ARCHIVE' },
      { key: 'posts.heroTitle', label: '归档页首屏主标题 (H1)', default: '文章归档 · 时间轴纪事', hint: '显示在 /posts/ 首屏左侧的大标题' },
      {
        key: 'posts.heroLead',
        label: '归档页首屏导语段落',
        type: 'textarea',
        default:
          '按时间从近及远排列的全部长短文字。沿左侧时间轴（年 → 月 → 日）展开归档，支持点击年份或月份节点平滑折叠/展开、按标签或关键词过滤；点击任意文章条目即可进入第三层「文章详细页」阅读全文。',
        hint: '显示在 /posts/ 首屏主标题下方的导读说明',
      },
      { key: 'posts.topbarNote', label: '归档页顶栏居中说明', default: '/posts/ · 主页 → 文章子页面（时间轴归档） → 文章详细页 三层架构' },
      { key: 'posts.allTag', label: '筛选栏「全部」标签文案', default: '全部' },
      { key: 'posts.uncategorized', label: '无标签文章的占位标签', default: '未分类' },
      { key: 'posts.searchPlaceholder', label: '搜索框占位提示词', default: '检索标题 / 摘要 / 标签...' },
      { key: 'posts.readLabel', label: '文章卡片阅读按钮文案', default: '进入详细页阅读' },
      { key: 'posts.empty', label: '无文章时的空态文案', default: '还没有文章。去 /studio/ 写第一篇。' },
      { key: 'posts.origin', label: '时间轴底部起点说明', default: 'ORIGIN (0, 0) // 时间从这里开始' },
      { key: 'posts.now', label: '时间轴顶端说明', default: 'NOW // PRESENT HORIZON · 时间轴顶端（由近及远）' },
      { key: 'posts.statTotal', label: '统计卡 01 · 归档总数格式', default: '{count} 篇长短文', hint: '{count} 自动替换为文章总数' },
      { key: 'posts.statVisible', label: '统计卡 03 · 当前可见格式', default: '{count} / {count} 篇可见' },
      { key: 'posts.statWords', label: '统计卡 04 · 累计字数格式', default: '约 {chars} 字', hint: '{chars} 自动替换为总字数' },
      { key: 'posts.unit', label: '时间轴年月计数单位', default: '篇' },
      {
        key: 'posts.randomWalkText',
        label: '右栏「随机漫游」说明文字',
        type: 'textarea',
        default: '不知道先读哪一篇？可以随机抽选一篇归档文章直接进入详细页伴读视图：',
      },
      { key: 'posts.randomWalkBtn', label: '右栏「随机漫游」按钮文案', default: '随机抽选一篇阅读' },
    ],
  },
  {
    key: 'photos',
    label: '相册',
    route: '/photos/',
    desc: '照片光学检视台、画幅筛选、分组标题与档案网格文案',
    fields: [
      { key: 'photos.title', label: '浏览器标签页标题 (SEO Title)', default: '照片' },
      { key: 'photos.description', label: '页面 SEO 摘要描述', type: 'textarea', default: '保持原始比例的照片档案，可检视拍摄参数与完整影集。' },
      { key: 'photos.topbarTitle', label: '检视台顶栏左侧标题', default: 'PHOTO SHOWCASE STAGE // 照片子页 · 一屏自适应光学检视台' },
      { key: 'photos.topbarNote', label: '检视台顶栏居中说明', default: '/photos/ · 横向框与竖向框双模态智能适配 · 最大化无裁切展示 · 右侧信息栏联动伸缩' },
      { key: 'photos.specTitle', label: '右侧参数栏顶栏标题', default: 'PHOTO SPECIFICATION // 影像档案与拍摄信息' },
      { key: 'photos.filmstripTitle', label: '快速切换胶片条标题', default: 'QUICK FILMSTRIP // 快速切换影像' },
      { key: 'photos.histTitle', label: '影调直方图卡片标题', default: 'LUMINANCE & SPECTRUM // 影调直方分布' },
      { key: 'photos.all', label: '底部筛选栏「全部」按钮', default: '全部影像' },
      { key: 'photos.latest', label: '最新一组照片分组名称', default: '最新一组' },
      { key: 'photos.earlier', label: '早期照片分组名称', default: '早期与数字造物' },
      { key: 'photos.scrollLabel', label: '首屏底栏向下滚动按钮文案', default: '↓ 向下滚动浏览全部影集网格' },
      { key: 'photos.gridHint', label: '底部网格右上角操作提示', default: 'CLICK CARD TO INSPECT ABOVE // 点击任意卡片自动滚回上方一屏画框检视' },
      { key: 'photos.empty', label: '无照片时的空态文案', default: '暂无照片。去 /studio/ 上传第一组。' },
    ],
  },
  {
    key: 'programs',
    label: '项目',
    route: '/programs/',
    desc: '程序项目页标题、导语、按钮文案与空态说明',
    fields: [
      { key: 'programs.title', label: '页面主标题 (H1 & SEO)', default: '程序' },
      { key: 'programs.note', label: '页面副标题导语', type: 'textarea', default: '小工具与物理渲染实验' },
      { key: 'programs.description', label: '页面 SEO 摘要描述', type: 'textarea', default: '做过的小工具与实验项目。' },
      { key: 'programs.viewCta', label: '项目卡片默认跳转按钮文案', default: '查看项目 →' },
      { key: 'programs.statusFallback', label: '项目模块默认状态文案', default: '运行中' },
      { key: 'programs.hostCta', label: '核心引擎控制台底部跳转文案', default: '前往主页体验 →' },
      { key: 'programs.emptyTitle', label: '无项目时的空态卡片标题', default: '暂无程序数据' },
      {
        key: 'programs.emptyText',
        label: '无项目时的空态卡片说明',
        type: 'textarea',
        default: '程序数据已清空。可在 /studio/ 的「项目」板块里添加控制台与实验模块，保存后这里会立即显示。',
      },
      { key: 'programs.emptyCta', label: '无项目时的空态操作按钮', default: '打开后台 →' },
    ],
  },
  {
    key: 'links',
    label: '友链',
    route: '/links/',
    desc: '友链名录、本站互换名片、关于我个人档案卡与站点说明志',
    fields: [
      { key: 'links.title', label: '页面主标题 (H1 & SEO)', default: '友链' },
      { key: 'links.note', label: '页面副标题导语', type: 'textarea', default: '友链名录 · 本站规格 · 架构志' },
      { key: 'links.description', label: '页面 SEO 摘要描述', type: 'textarea', default: '常看的独立博客友链，以及关于「夜笙的小世界」的站点架构与排版说明。' },
      { key: 'links.peersTitle', label: '第一部分 · 友链名录小节标题', default: '一、邻人友链与本站名片' },
      { key: 'links.peersCount', label: '已收录友链数量说明', default: '已收录 {count} 个独立站点', hint: '{count} 自动替换为友链数量' },
      { key: 'links.peersEmpty', label: '无友链时的副标说明', default: '虚位以待 · 欢迎互换友链' },
      { key: 'links.cardTitle', label: '本站互换名片标题', default: '本站名片 · 友链互换信息' },
      { key: 'links.cardBadge', label: '本站互换名片右上角徽标', default: 'YESHENG.WIKI' },
      {
        key: 'links.cardIntro',
        label: '本站互换名片导言说明',
        type: 'textarea',
        default:
          '如果你也在维护一个认真写字、记录技术笔记或生活广度的独立博客，欢迎通过下方规格互换友链。友链数据存储在服务器的 SQLite 数据库中，可通过 /studio/ 后台即时维护。',
      },
      { key: 'links.specName', label: '名片规格标签 · 站点名称', default: '站点名称' },
      { key: 'links.specTagline', label: '名片规格标签 · 站点副标', default: '站点副标' },
      { key: 'links.specUrl', label: '名片规格标签 · 站点地址', default: '站点地址' },
      { key: 'links.specRss', label: '名片规格标签 · RSS 订阅', default: 'RSS 订阅' },
      { key: 'links.copyBtn', label: '复制名片按钮文案', default: '复制本站友链信息' },
      { key: 'links.copyDone', label: '复制成功提示文字', default: '已复制本站名片' },
      { key: 'links.rssBtn', label: '打开 RSS 订阅源按钮文案', default: '打开 RSS 全文订阅源 →' },
      { key: 'links.colophonTitle', label: '第二部分 · 站点说明志小节标题', default: '二、站点说明（Site Colophon）' },
      { key: 'links.colophonNote', label: '站点说明志小节副标', default: '建站初衷 · 服务端渲染 · SQLite · 昼夜双模态' },
      { key: 'links.empty', label: '说明志空态文案', default: '暂无站点说明条目。' },
    ],
  },
];

const DEFAULTS: Record<string, string> = Object.fromEntries(
  PAGE_DEFS.flatMap((page) => page.fields.map((field) => [field.key, field.default]))
);

export const PAGE_KEYS: string[] = Object.keys(DEFAULTS);

export type PageValues = Record<string, string>;

let pageValuesCacheVer = -1;
let cachedPageValues: PageValues | null = null;

/** 读「默认值 ← 数据库覆盖」合并后的文案表（带内存版本号缓存）。 */
export function getPageValues(): PageValues {
  const ver = getContentVersion();
  if (pageValuesCacheVer === ver && cachedPageValues) {
    return cachedPageValues;
  }
  const stored = getSetting<Record<string, unknown>>('pages', {});
  const values: PageValues = { ...DEFAULTS };
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(stored)) {
      if (!(key in DEFAULTS)) continue;
      if (typeof value === 'string') values[key] = value;
    }
  }
  cachedPageValues = values;
  pageValuesCacheVer = ver;
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
