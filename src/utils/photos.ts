import type { ImageMetadata } from 'astro';

/**
 * 照片扫描
 *
 * 为什么不用内容集合：照片会有几百张并持续增加，
 * 「一张照片配一个 Markdown 文件」的维护成本太高。
 * 直接把图片丢进 src/assets/photos/ 就会自动出现在照片页。
 *
 * 命名约定（日期前缀必需，其余可选）：
 *   2026-03-09-鸡煲.jpg   → 日期 2026-03-09，说明「鸡煲」
 *   2026-03-09.jpg        → 日期 2026-03-09，无说明
 *   鸡煲.jpg              → 无日期，排在最后
 *
 * 图片由 Astro 在构建时自动压缩并转成 WebP，不需要手工处理。
 */

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/*.{jpg,jpeg,png,webp,avif}',
  { eager: true }
);

export interface Photo {
  /** 用于链接的稳定标识 */
  id: string;
  image: ImageMetadata;
  date: Date | null;
  caption: string;
  /** 竖构图，网格里用 3:4 而不是 4:3，避免把画面裁坏 */
  portrait: boolean;
}

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:[-_\s]+(.*))?$/;

function parse(path: string, image: ImageMetadata): Photo {
  const file = path.split('/').pop() ?? '';
  const base = file.replace(/\.[^.]+$/, '');
  const m = DATE_PREFIX.exec(base);

  let date: Date | null = null;
  let caption = base;

  if (m) {
    const [, y, mo, d, rest] = m;
    const parsed = new Date(Number(y), Number(mo) - 1, Number(d));
    // 拒绝 2026-13-45 这种非法日期
    if (!Number.isNaN(parsed.valueOf()) && parsed.getDate() === Number(d)) {
      date = parsed;
      caption = (rest ?? '').trim();
    }
  } else {
    console.warn(
      `[photos] 「${file}」没有日期前缀，会排在照片页最后。正确写法如 2026-03-09-说明.jpg`
    );
  }

  return {
    id: base,
    image,
    date,
    caption,
    portrait: image.height > image.width,
  };
}

/** 全部照片，按日期倒序；无日期的排在最后 */
export function getPhotos(): Photo[] {
  return Object.entries(modules)
    .map(([path, mod]) => parse(path, mod.default))
    .sort((a, b) => {
      if (!a.date && !b.date) return a.id.localeCompare(b.id);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.valueOf() - a.date.valueOf();
    });
}

/** 按年份分组，年份倒序 —— 照片页的时间轴骨架 */
export function groupPhotosByYear(photos: Photo[]): Array<{
  year: number | null;
  photos: Photo[];
}> {
  const map = new Map<number | null, Photo[]>();
  for (const p of photos) {
    const key = p.date ? p.date.getFullYear() : null;
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return [...map.entries()]
    .sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return b[0] - a[0];
    })
    .map(([year, list]) => ({ year, photos: list }));
}
