/**
 * 内容层：把"仓库里的文件"变成后台能编辑的数据，以及反过来。
 */
import { Github, type DirEntry } from './github';
import { buildJson, buildPost, effectiveChanges, parsePost, parseJson, type ParsedFile } from './frontmatter';
import { isoDate } from '../utils/date';
import type { PhotoMetadata } from './exif';

/* --------------------------------------------------------------------------
   路径常量 —— 与站点结构一一对应
   -------------------------------------------------------------------------- */
export const DIRS = {
  posts: 'src/content/posts',
  walls: 'src/content/photos',
  photos: 'src/assets/photos',
  postAssets: 'src/assets/posts',
  audio: 'src/assets/audio',
  site: 'src/assets/site',
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
  /** 改过路由、但还没保存时，旧文件的路径与 sha；保存成功后清空 */
  prevPath?: string;
  prevSha?: string;
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
  return posts.sort((a, b) => String(b.parsed.data.pubDate ?? '').localeCompare(String(a.parsed.data.pubDate ?? '')));
}

export function postTitle(p: PostEntry): string {
  return String(p.parsed.data.title ?? '(无标题)');
}

/**
 * 比较"打开时的值"与"现在的值"，只返回真正变了的字段。
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
    const same = JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (!same) changed[key] = b;
  }
  return changed;
}

export const POST_FIELDS = [
  'title',
  'pubDate',
  'description',
  'lead',
  'tags',
  'entryBadge',
  'cover',
  'coverCaption',
  'featured',
  'kineticCaption',
  'railMode',
  'railSpecs',
  'railTopology',
  'updatedDate',
  'draft',
  'autoUpdated',
] as const;

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
  const verb = post.sha ? '更新' : '新建';
  const message = `content: ${verb}文章「${title}」\n\n（经后台编辑，只改动实际修改的字段）`;

  // 改过路由：先写新文件，成功后再删旧文件。
  // 顺序不能反 —— 先删后写一旦写入失败，文章就没了；这个顺序最坏只是留下两个文件，可以重试。
  if (post.prevPath && post.prevSha && post.prevPath !== post.path) {
    // 上一次可能已经写成功、只差删旧文件；新路径已存在时用它的 sha 更新，避免 422。
    const existingNew = await gh.getFile(post.path);
    await gh.putText(
      post.path,
      text,
      `content: 重命名文章「${title}」\n\n${post.prevPath} -> ${post.path}`,
      existingNew?.sha
    );
    await gh.deleteFile(
      post.prevPath,
      post.prevSha,
      `content: 重命名文章「${title}」，删除旧文件 ${post.prevPath}`
    );
    post.prevPath = undefined;
    post.prevSha = undefined;
    return;
  }

  await gh.putText(post.path, text, message, post.sha);
}

export function newPostTemplate(title: string, date: string, tags: string[], draft = false): string {
  const lines = [`title: ${JSON.stringify(title)}`, `pubDate: ${date}`];
  if (tags.length) lines.push(`tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`);
  if (draft) lines.push('draft: true');
  return `---\n${lines.join('\n')}\n---\n`;
}

export function newPostEntry(id: string, date: string): PostEntry | null {
  const parsed = parsePost(newPostTemplate('草稿', date, [], true));
  if (!parsed) return null;
  return { path: `${DIRS.posts}/${id}.md`, sha: '', id, parsed };
}

export function isPost(e: PostEntry | WallEntry): e is PostEntry {
  return 'parsed' in e;
}

export function draftId(taken: (id: string) => boolean): string {
  const base = `draft-${isoDate(new Date()).replace(/-/g, '')}`;
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

export function newWallEntry(id: string, date: string): WallEntry {
  return {
    path: `${DIRS.walls}/${id}.json`,
    sha: '',
    id,
    title: '新建影集草稿',
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
   照片墙（含单张照片的 EXIF 光学遥测参数）
   -------------------------------------------------------------------------- */
export type WallPhoto = PhotoMetadata;

export interface WallEntry {
  path: string;
  sha: string;
  id: string;
  title: string;
  date: string;
  place: string;
  note: string;
  photos: WallPhoto[];
  extra: Record<string, unknown>;
}

function toWallPhoto(raw: unknown): WallPhoto {
  const o = (raw ?? {}) as Record<string, unknown>;
  const histRaw = Array.isArray(o.hist) ? o.hist.map((n) => Number(n) || 0) : undefined;
  const arVal = typeof o.ar === 'number' && !Number.isNaN(o.ar) ? o.ar : undefined;
  return {
    file: String(o.file ?? ''),
    caption: String(o.caption ?? ''),
    title: o.title !== undefined ? String(o.title) : undefined,
    story: o.story !== undefined ? String(o.story) : undefined,
    group: o.group !== undefined ? String(o.group) : undefined,
    coord: o.coord !== undefined ? String(o.coord) : undefined,
    date: o.date !== undefined ? String(o.date) : undefined,
    location: o.location !== undefined ? String(o.location) : undefined,
    aspect: o.aspect !== undefined ? String(o.aspect) : undefined,
    ar: arVal,
    ratioPill: o.ratioPill !== undefined ? String(o.ratioPill) : undefined,
    camera: o.camera !== undefined ? String(o.camera) : undefined,
    lens: o.lens !== undefined ? String(o.lens) : undefined,
    exposure: o.exposure !== undefined ? String(o.exposure) : undefined,
    color: o.color !== undefined ? String(o.color) : undefined,
    gps: o.gps !== undefined ? String(o.gps) : undefined,
    ev: o.ev !== undefined ? String(o.ev) : undefined,
    hist: histRaw,
    autoFields: Array.isArray(o.autoFields)
      ? (o.autoFields.filter((x) => typeof x === 'string') as WallPhoto['autoFields'])
      : undefined,
  };
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
    photos: list.map(toWallPhoto),
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

function serializeWallPhoto(p: WallPhoto): Record<string, unknown> {
  const item: Record<string, unknown> = {
    file: p.file,
    caption: p.caption,
  };
  const optKeys: Array<keyof WallPhoto> = [
    'title',
    'story',
    'group',
    'coord',
    'date',
    'location',
    'aspect',
    'ar',
    'ratioPill',
    'camera',
    'lens',
    'exposure',
    'color',
    'gps',
    'ev',
    'hist',
    'autoFields',
  ];
  for (const k of optKeys) {
    const val = p[k];
    if (val !== undefined) item[k] = val;
  }
  return item;
}

export function wallToJson(w: WallEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: w.title,
    date: w.date,
    place: w.place,
    note: w.note,
    photos: w.photos.map(serializeWallPhoto),
  };
  for (const [k, v] of Object.entries(w.extra)) if (!(k in out)) out[k] = v;
  return out;
}

export async function saveWall(gh: Github, wall: WallEntry): Promise<void> {
  const verb = wall.sha ? '更新' : '新建';
  await gh.putText(wall.path, buildJson(wallToJson(wall)), `content: ${verb}照片墙「${wall.title || wall.id}」`, wall.sha);
}

export async function createWall(gh: Github, id: string, wall: WallEntry): Promise<void> {
  await gh.putText(`${DIRS.walls}/${id}.json`, buildJson(wallToJson(wall)), `content: 新建照片墙「${wall.title || id}」`);
}

export async function deleteWall(gh: Github, wall: WallEntry): Promise<void> {
  await gh.deleteFile(wall.path, wall.sha, `content: 删除照片墙「${wall.title || wall.id}」`);
}

export async function listPhotoFiles(gh: Github): Promise<DirEntry[]> {
  const entries = await gh.listDir(DIRS.photos);
  return entries.filter((e) => e.type === 'file' && /\.(jpe?g|png|webp|avif)$/i.test(e.name));
}

export async function listPostAssetFiles(gh: Github): Promise<DirEntry[]> {
  const imageName = /\.(jpe?g|png|webp|avif|gif|svg)$/i;
  try {
    const entries = await gh.listDir(DIRS.postAssets);
    const files: DirEntry[] = [];
    for (const entry of entries) {
      if (entry.type === 'file') {
        if (imageName.test(entry.name)) files.push(entry);
        continue;
      }
      // 兼容真实 GitHub：子目录单独列一次，name 用 `<slug>/<file>`，
      // 这样上传去重和编辑器里的兜底缩略图都能直接定位。
      if (entry.type !== 'dir') continue;
      try {
        const children = await gh.listDir(entry.path);
        for (const child of children) {
          if (child.type !== 'file' || !imageName.test(child.name)) continue;
          files.push({ ...child, name: `${entry.name}/${child.name}` });
        }
      } catch {
        // 子目录不可读就跳过，不影响其它配图
      }
    }
    return files;
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------------------
   友链 / 站点 —— 单文件，整体读写
   -------------------------------------------------------------------------- */
export interface LinkItem {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar?: string;
  tag?: string;
  owner?: string;
}

export interface LinksFile {
  sha: string;
  links: LinkItem[];
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
        avatar: o.avatar !== undefined ? String(o.avatar) : undefined,
        tag: o.tag !== undefined ? String(o.tag) : undefined,
        owner: o.owner !== undefined ? String(o.owner) : undefined,
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
  await gh.putText(FILES.site, buildJson(file.data), 'content: 更新站点信息、主页与右侧伴读栏配置', file.sha);
}

/* --------------------------------------------------------------------------
   图片上传：在浏览器里先压到长边 2560px 再提交
   -------------------------------------------------------------------------- */
export interface PreparedImage {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  width: number;
  height: number;
  originalBytes: number;
}

export function safeFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[/\\:*?"<>|!]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

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

  // PNG / WebP / GIF 优先编码为 WebP（若浏览器不支持 WebP 编码则回退 PNG），保留透明通道避免背景变黑
  const keepAlpha =
    /^image\/(png|webp|gif)$/i.test(file.type) || /\.(png|webp|gif)$/i.test(file.name);
  let targetMime = keepAlpha ? 'image/webp' : 'image/jpeg';
  let blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, targetMime, quality)
  );
  if (keepAlpha && (!blob || blob.type !== 'image/webp')) {
    targetMime = 'image/png';
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  if (!blob) throw new Error('图片压缩失败');
  const actualMime = blob.type || targetMime;
  const ext =
    actualMime === 'image/webp' ? '.webp' : actualMime === 'image/png' ? '.png' : '.jpg';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    filename: `${safeFilename(file.name)}${ext}`,
    mime: actualMime,
    width,
    height,
    originalBytes: file.size,
  };
}

export async function uploadPhoto(
  gh: Github,
  prepared: PreparedImage,
  datePrefix: string,
  existing: string[]
): Promise<string> {
  const ext = /\.[a-z0-9]+$/i.exec(prepared.filename)?.[0] ?? '.jpg';
  const extRe = new RegExp(`${ext.replace('.', '\\.')}$`, 'i');
  const base = datePrefix ? `${datePrefix}-${prepared.filename}` : prepared.filename;
  let name = base;
  let n = 1;
  while (existing.includes(name)) {
    n += 1;
    name = base.replace(extRe, `-${n}${ext}`);
  }
  await gh.putBinary(`${DIRS.photos}/${name}`, prepared.bytes, `content: 上传照片 ${name}`);
  return name;
}

/**
 * 把 state.postAssetFiles 里的条目归一成 `<slug>/<file>` 或 `<file>`。
 * 这些条目可能是旧版扁平文件名、`<slug>/<file>`，也可能已经被调用方
 * 换成了 `../../assets/posts/...` 这样的正文相对路径。
 */
function postAssetName(name: string): string {
  return name
    .replace(/^\.\.\/\.\.\/assets\/posts\//, '')
    .replace(/^\/?src\/assets\/posts\//, '')
    .replace(/^\/?uploads\/posts\//, '')
    .replace(/^\/+/, '');
}

/**
 * 上传文章配图：归档到 `src/assets/posts/<slug>/<slug>-NN.jpg`，
 * 返回可直接写进正文的 `../../assets/posts/<slug>/<file>`。
 *
 * 目录用 safeFilename(postSlug) 再兜一层；上传接口（fs.ts 的 assetTarget）
 * 只接受一层子目录，`..` / 空段 / 绝对路径都会被拒绝。
 */
export async function uploadPostAsset(
  gh: Github,
  prepared: PreparedImage,
  postSlug: string,
  existing: string[]
): Promise<string> {
  const safeSlug = safeFilename(postSlug || 'post');
  const folder = safeSlug && safeSlug !== '.' && safeSlug !== '..' ? safeSlug : 'post';
  const ext = /\.[a-z0-9]+$/i.exec(prepared.filename)?.[0] ?? '.jpg';
  const existingNames = new Set(existing.map(postAssetName));
  let n = 1;
  let name = `${folder}-${String(n).padStart(2, '0')}${ext}`;
  // 同时避开旧版扁平文件名与新版归档目录里的同名文件
  while (existingNames.has(`${folder}/${name}`) || existingNames.has(name)) {
    n += 1;
    name = `${folder}-${String(n).padStart(2, '0')}${ext}`;
  }
  await gh.putBinary(`${DIRS.postAssets}/${folder}/${name}`, prepared.bytes, `content: 上传文章配图 ${folder}/${name}`);
  return `../../assets/posts/${folder}/${name}`;
}

/**
 * 上传音频文件：归档到 `src/assets/audio/<slug>/<file>` 或 `src/assets/audio/<file>`，
 * 返回可直接用于音乐播放模块的公开路径 `/uploads/audio/...`。
 */
export async function uploadAudioAsset(
  gh: Github,
  file: File,
  postSlug?: string
): Promise<string> {
  const extMatch = /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.exec(file.name);
  const ext = extMatch ? extMatch[0].toLowerCase() : '.mp3';
  const baseName = safeFilename(file.name) || 'track';
  const stamp = Date.now().toString(36).slice(-4);
  const fileName = `${baseName}-${stamp}${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('音频文件为空');

  if (postSlug && postSlug.trim()) {
    const safeSlug = safeFilename(postSlug);
    const folder = safeSlug && safeSlug !== '.' && safeSlug !== '..' ? safeSlug : 'post';
    await gh.putBinary(`${DIRS.audio}/${folder}/${fileName}`, bytes, `content: 上传文章伴读音频 ${folder}/${fileName}`);
    return `/uploads/audio/${folder}/${fileName}`;
  }

  await gh.putBinary(`${DIRS.audio}/${fileName}`, bytes, `content: 上传媒体库音频 ${fileName}`);
  return `/uploads/audio/${fileName}`;
}

/**
 * 上传站点图标：写入 `src/assets/site/<file>`（公开路径 `/uploads/site/<file>`）。
 * 支持 SVG / PNG / ICO / WebP，最大 512 KB。
 */
export async function uploadSiteIcon(gh: Github, file: File): Promise<string> {
  const extMatch = /\.(svg|png|ico|webp|jpe?g|gif)$/i.exec(file.name);
  const ext = extMatch ? extMatch[0].toLowerCase() : '.png';
  if (file.size > 512 * 1024) throw new Error('图标文件不能超过 512 KB');
  const stamp = Date.now().toString(36).slice(-6);
  const name = `favicon-${stamp}${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('图标文件为空');
  await gh.putBinary(`${DIRS.site}/${name}`, bytes, `content: 上传站点图标 ${name}`);
  return `/uploads/site/${name}`;
}
