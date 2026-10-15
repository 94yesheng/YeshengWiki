import { getCollection } from 'astro:content';
import type { ImageMetadata } from 'astro';

/**
 * 照片墙
 *
 * 【这一版改了什么】早先是扫描 src/assets/photos/ 目录、从**文件名**解析日期和说明。
 * 现在元数据（标题、地点、记录文字）存在 src/content/photos/ 下的数据文件里，
 * 一面墙一个文件；图片本身还是放在 src/assets/photos/，靠 photos[].file 按文件名关联。
 * 原因写在 src/content.config.ts 的 photoWalls 注释里。
 *
 * 所以现在有两件事分开：
 *   · 图片 = 二进制资源，放 src/assets/photos/，构建时由 Astro 自动压成多尺寸 WebP
 *   · 元数据 = 数据文件，放 src/content/photos/，由后台或手工编辑
 *
 * 文件名不再承载语义，但仍然建议保留日期前缀（如 2026-03-09-鸡煲.jpg）——
 * 这样在文件夹里排序看着清楚，而且迁移前的旧图不用改名。
 */

/** 按文件名索引所有照片：'鸡煲.jpg' → ImageMetadata */
const images = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/*.{jpg,jpeg,png,webp,avif}',
  { eager: true }
);

const byFileName = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(images)) {
  byFileName.set(path.split('/').pop() ?? path, mod.default);
}

export interface WallPhoto {
  /** 原始文件名，用于和元数据里的 file 字段对上 */
  file: string;
  image: ImageMetadata;
  /** 这一张单独的说明，可空 */
  caption: string;
  /** 竖构图 —— 网格里用于决定占几列 */
  portrait: boolean;
}

export interface PhotoWall {
  id: string;
  title: string;
  /** ISO 字符串（2024-07-17），空串表示未标注时间 */
  dateText: string;
  date: Date | null;
  place: string;
  note: string;
  photos: WallPhoto[];
  /** 封面：第一张照片，时间轴上用它做缩略图 */
  cover: ImageMetadata | null;
}

/** 2024-07-17 → Date；格式不对或非法日期返回 null */
function parseIsoDate(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // 拒绝 2026-13-45 这种：月份归位后日期必须还是原来的数字
  if (Number.isNaN(date.valueOf()) || date.getDate() !== Number(d)) return null;
  return date;
}

/**
 * 全部照片墙，按时间倒序；未标注时间的排在最后（彼此按标题排）。
 *
 * 引用不到的图片会打警告并跳过 —— 不静默吞掉，否则照片页会莫名其妙少图。
 */
export async function getPhotoWalls(): Promise<PhotoWall[]> {
  const entries = await getCollection('photoWalls');

  const walls = entries.map((entry): PhotoWall => {
    const { title, date, place, note, photos } = entry.data;

    const resolved: WallPhoto[] = [];
    for (const p of photos) {
      const image = byFileName.get(p.file);
      if (!image) {
        console.warn(
          `[photos] 照片墙「${entry.id}」引用的图片 ${p.file} 不在 src/assets/photos/ 里，已跳过`
        );
        continue;
      }
      resolved.push({
        file: p.file,
        image,
        caption: p.caption,
        portrait: image.height > image.width,
      });
    }

    const dateText = date ?? '';
    return {
      id: entry.id,
      title,
      dateText,
      date: parseIsoDate(dateText),
      place,
      note,
      photos: resolved,
      cover: resolved[0]?.image ?? null,
    };
  });

  return walls.sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title, 'zh-Hans-CN');
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.valueOf() - a.date.valueOf();
  });
}

