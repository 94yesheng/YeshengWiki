/**
 * 内容层：把"仓库里的文件"变成后台能编辑的数据，以及反过来。
 *
 * 这里的每个写函数**只管一个文件** —— 这是刻意的：diff 干净，出错影响面小，
 * 也不会像现成 CMS 那样一次提交顺手改一堆无关文件。
 * （"一次保存可能连着写好几个文件"是上一层 app.ts 编排的：它把暂存的那几笔
 * 逐个交给这里的函数，每个仍然是一个文件一次提交。）
 */
import { Github, type DirEntry } from './github';
import { buildJson, buildPost, effectiveChanges, parsePost, parseJson, type ParsedFile } from './frontmatter';
import { isoDate } from '../utils/date';

/* --------------------------------------------------------------------------
   路径常量 —— 与站点结构一一对应，改这里就能换目录
   -------------------------------------------------------------------------- */
export const DIRS = {
  posts: 'src/content/posts',
  walls: 'src/content/photos',
  photos: 'src/assets/photos',
} as const;

export const FILES = {
  links: 'src/content/links.json',
  site: 'src/site.data.json',
} as const;

/* --------------------------------------------------------------------------
   文章
   -------------------------------------------------------------------------- */
export interface PostEntry {
  path: string;
  sha: string;
  id: string;
  parsed: ParsedFile;
}

export async function loadPosts(gh: Github): Promise<PostEntry[]> {
  const entries = await gh.listDir(DIRS.posts);
  const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md'));
  const loaded = await Promise.all(
    files.map(async (f): Promise<PostEntry | null> => {
      const remote = await gh.getFile(f.path);
      if (!remote) return null;
      const parsed = parsePost(remote.text);
      if (!parsed) return null;
      return { path: f.path, sha: remote.sha, id: f.name.replace(/\.md$/, ''), parsed };
    })
  );
  const posts = loaded.filter((p): p is PostEntry => p !== null);
  // 按日期倒序，与站点的时间轴一致
  return posts.sort((a, b) => String(b.parsed.data.pubDate ?? '').localeCompare(String(a.parsed.data.pubDate ?? '')));
}

export function postTitle(p: PostEntry): string {
  return String(p.parsed.data.title ?? '(无标题)');
}

/**
 * 比较"打开时的值"与"现在的值"，只返回真正变了的字段。
 *
 * 这里是"外科式保存"的入口：没变过的字段根本不会进入 changed，
 * 于是 frontmatter 里那几行会原样保留。
 */
export function diffFields(
  original: Record<string, unknown>,
  next: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of fields) {
    const a = original[key];
    const b = next[key];
    const same = Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b;
    if (!same) changed[key] = b;
  }
  return changed;
}

export const POST_FIELDS = ['title', 'pubDate', 'description', 'tags', 'updatedDate', 'draft', 'autoUpdated'] as const;

/** 生成新全文（界面在保存前会先拿它和原文比对，判断"其实没改"） */
export function buildPostText(post: PostEntry, changed: Record<string, unknown>, body: string): string {
  return buildPost(post.parsed, effectiveChanges(post.parsed, changed), body);
}

export async function savePost(
  gh: Github,
  post: PostEntry,
  changed: Record<string, unknown>,
  body: string
): Promise<void> {
  const text = buildPostText(post, changed, body);
  const title = String(changed.title ?? post.parsed.data.title ?? post.id);
  // sha 为空 = 这个文件在仓库里还不存在（暂存着的新文章第一次落盘）→ 不带 sha 就是"新建"
  const verb = post.sha ? '更新' : '新建';
  await gh.putText(post.path, text, `content: ${verb}文章「${title}」\n\n（经后台编辑，只改动实际修改的字段）`, post.sha);
}

export function newPostTemplate(title: string, date: string, tags: string[], draft = false): string {
  const lines = [`title: ${JSON.stringify(title)}`, `pubDate: ${date}`];
  if (tags.length) lines.push(`tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`);
  if (draft) lines.push('draft: true');
  // 正文留白：新条目是"空壳"，想写什么写什么 —— 不再预置一句占位文字（那行会被存进
  // 文件，等于每次新建都得先删一句废话）
  return `---\n${lines.join('\n')}\n---\n`;
}

/**
 * 造一条**还没写进仓库**的文章（`sha: ''`）。
 *
 * 先把模板文字解析成 `parsed`，是为了让后面走的是同一条路：保存时 `buildPost(parsed, …)`
 * 照常把用户改过的字段写进去，跟"改一篇已有文章"没有任何区别 —— 不用另写一条"新建"分支。
 */
export function newPostEntry(id: string, date: string): PostEntry | null {
  const parsed = parsePost(newPostTemplate('草稿', date, [], true));
  if (!parsed) return null;
  return { path: `${DIRS.posts}/${id}.md`, sha: '', id, parsed };
}

/** 文章还是照片墙 —— 暂存那一套要按这个分岔（墙没有 parsed，用 extra 记着不认识的键） */
export function isPost(e: PostEntry | WallEntry): e is PostEntry {
  return 'parsed' in e;
}

export function draftId(taken: (id: string) => boolean): string {
  const base = `draft-${isoDate(new Date()).replace(/-/g, '')}`;
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

/** 造一面**还没写进仓库**的照片墙（`sha: ''`）。日期一定要给：墙按日期倒序排，没有日期的沉到底。 */
export function newWallEntry(id: string, date: string): WallEntry {
  return {
    path: `${DIRS.walls}/${id}.json`,
    sha: '',
    id,
    title: '草稿',
    date,
    place: '',
    note: '',
    photos: [],
    extra: {},
  };
}

export async function createPost(gh: Github, slug: string, text: string): Promise<void> {
  await gh.putText(`${DIRS.posts}/${slug}.md`, text, `content: 新建文章「${slug}」`);
}

export async function deletePost(gh: Github, post: PostEntry): Promise<void> {
  await gh.deleteFile(post.path, post.sha, `content: 删除文章「${postTitle(post)}」`);
}

/* --------------------------------------------------------------------------
   照片墙
   -------------------------------------------------------------------------- */
export interface WallPhoto {
  file: string;
  caption: string;
}

export interface WallEntry {
  path: string;
  sha: string;
  id: string;
  title: string;
  date: string;
  place: string;
  note: string;
  photos: WallPhoto[];
  /** 保留原始对象里的其他键，避免保存时把它们丢掉 */
  extra: Record<string, unknown>;
}

function toWall(path: string, sha: string, raw: Record<string, unknown>): WallEntry {
  const id = path.split('/').pop()!.replace(/\.json$/, '');
  const { title, date, place, note, photos, ...extra } = raw as Record<string, unknown>;
  const list = Array.isArray(photos) ? photos : [];
  return {
    path,
    sha,
    id,
    title: String(title ?? ''),
    date: String(date ?? ''),
    place: String(place ?? ''),
    note: String(note ?? ''),
    photos: list.map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { file: String(o.file ?? ''), caption: String(o.caption ?? '') };
    }),
    extra,
  };
}

export async function loadWalls(gh: Github): Promise<WallEntry[]> {
  const entries = await gh.listDir(DIRS.walls);
  const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.json'));
  const loaded = await Promise.all(
    files.map(async (f): Promise<WallEntry | null> => {
      const remote = await gh.getFile(f.path);
      if (!remote) return null;
      const json = parseJson(remote.text);
      if (!json) return null;
      return toWall(f.path, remote.sha, json);
    })
  );
  const walls = loaded.filter((w): w is WallEntry => w !== null);
  return walls.sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title, 'zh-Hans-CN');
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

export function wallToJson(w: WallEntry): Record<string, unknown> {
  // 字段顺序固定成和现有文件一致，避免每次保存都产生顺序 diff
  const out: Record<string, unknown> = {
    title: w.title,
    date: w.date,
    place: w.place,
    note: w.note,
    photos: w.photos.map((p) => ({ file: p.file, caption: p.caption })),
  };
  // 原始文件里若有我们不认识的键，原样保留在最后
  for (const [k, v] of Object.entries(w.extra)) if (!(k in out)) out[k] = v;
  return out;
}

export async function saveWall(gh: Github, wall: WallEntry): Promise<void> {
  // sha 为空 = 仓库里还没有这个文件（暂存着的新墙第一次落盘）
  const verb = wall.sha ? '更新' : '新建';
  await gh.putText(wall.path, buildJson(wallToJson(wall)), `content: ${verb}照片墙「${wall.title || wall.id}」`, wall.sha);
}

export async function createWall(gh: Github, id: string, wall: WallEntry): Promise<void> {
  await gh.putText(`${DIRS.walls}/${id}.json`, buildJson(wallToJson(wall)), `content: 新建照片墙「${wall.title || id}」`);
}

export async function deleteWall(gh: Github, wall: WallEntry): Promise<void> {
  await gh.deleteFile(wall.path, wall.sha, `content: 删除照片墙「${wall.title || wall.id}」`);
}

/** 列出现有的照片文件名（上传时用来查重、给后台挑选已有图片用） */
export async function listPhotoFiles(gh: Github): Promise<DirEntry[]> {
  const entries = await gh.listDir(DIRS.photos);
  return entries.filter((e) => e.type === 'file' && /\.(jpe?g|png|webp|avif)$/i.test(e.name));
}

/* --------------------------------------------------------------------------
   友链 / 站点 —— 单文件，整体读写
   -------------------------------------------------------------------------- */
export interface LinksFile {
  sha: string;
  links: Array<{ id: string; name: string; url: string; description: string }>;
}

export async function loadLinks(gh: Github): Promise<LinksFile> {
  const remote = await gh.getFile(FILES.links);
  if (!remote) return { sha: '', links: [] };
  const json = (parseJson(remote.text) ?? {}) as { links?: unknown };
  const list = Array.isArray(json.links) ? json.links : [];
  return {
    sha: remote.sha,
    links: list.map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return {
        id: String(o.id ?? ''),
        name: String(o.name ?? ''),
        url: String(o.url ?? ''),
        description: String(o.description ?? ''),
      };
    }),
  };
}

export async function saveLinks(gh: Github, file: LinksFile): Promise<void> {
  await gh.putText(FILES.links, buildJson({ links: file.links }), 'content: 更新友链', file.sha);
}

export interface SiteFile {
  sha: string;
  data: Record<string, unknown>;
}

export async function loadSite(gh: Github): Promise<SiteFile> {
  const remote = await gh.getFile(FILES.site);
  if (!remote) return { sha: '', data: {} };
  return { sha: remote.sha, data: parseJson(remote.text) ?? {} };
}

export async function saveSite(gh: Github, file: SiteFile): Promise<void> {
  await gh.putText(FILES.site, buildJson(file.data), 'content: 更新站点信息与主页文案', file.sha);
}

/* --------------------------------------------------------------------------
   图片上传：在浏览器里先压到长边 2560px 再提交
   -------------------------------------------------------------------------- */
export interface PreparedImage {
  bytes: Uint8Array;
  filename: string;
  width: number;
  height: number;
  /** 压缩前后的字节数，用来在界面上说明"压了多少" */
  originalBytes: number;
}

/** 文件名清洗：去掉路径分隔符与危险字符，空格换成连字符 */
export function safeFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[/\\:*?"<>|!]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/**
 * 把用户选的原图压到长边 2560px、转成 JPEG。
 * 为什么在浏览器里压：手机原图一张 2–6MB，几十张就能让仓库胀到几百 MB；
 * 而网页上最宽也就 1100px 左右，2560 已经留了 2 倍余量。
 */
export async function prepareImage(file: File, maxEdge = 2560, quality = 0.88): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`这个格式浏览器读不了：${file.name}（HEIC 之类请先转成 JPG）`);
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas，无法压缩图片');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('图片压缩失败');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    filename: `${safeFilename(file.name)}.jpg`,
    width,
    height,
    originalBytes: file.size,
  };
}

/** 上传一张照片到图片目录；文件名冲突时自动加 -2、-3 */
export async function uploadPhoto(
  gh: Github,
  prepared: PreparedImage,
  datePrefix: string,
  existing: string[]
): Promise<string> {
  const base = datePrefix ? `${datePrefix}-${prepared.filename}` : prepared.filename;
  let name = base;
  let n = 1;
  while (existing.includes(name)) {
    n += 1;
    name = base.replace(/\.jpg$/, `-${n}.jpg`);
  }
  await gh.putBinary(`${DIRS.photos}/${name}`, prepared.bytes, `content: 上传照片 ${name}`);
  return name;
}
