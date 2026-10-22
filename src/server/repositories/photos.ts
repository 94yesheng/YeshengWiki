/**
 * 照片墙数据访问层。
 */
import { getDb } from '../db';
import { bumpContentVersion, getContentVersion } from '../page-cache';

export interface Photo {
  id: number;
  wallId: number;
  file: string;
  url: string;
  caption: string;
  title: string | null;
  story: string | null;
  group: string | null;
  coord: string | null;
  date: string | null;
  location: string | null;
  aspect: string | null;
  ar: number | null;
  ratioPill: string | null;
  camera: string | null;
  lens: string | null;
  exposure: string | null;
  color: string | null;
  gps: string | null;
  ev: string | null;
  hist: number[] | null;
  autoFields: string[] | null;
  sortOrder: number;
}

export interface PhotoWall {
  id: number;
  slug: string;
  title: string;
  date: string | null;
  place: string;
  note: string;
  sortOrder: number;
  photos: Photo[];
  cover: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoInput {
  file: string;
  caption?: string;
  title?: string | null;
  story?: string | null;
  group?: string | null;
  coord?: string | null;
  date?: string | null;
  location?: string | null;
  aspect?: string | null;
  ar?: number | null;
  ratioPill?: string | null;
  camera?: string | null;
  lens?: string | null;
  exposure?: string | null;
  color?: string | null;
  gps?: string | null;
  ev?: string | null;
  hist?: number[] | null;
  autoFields?: string[] | null;
}

export interface WallInput {
  slug: string;
  title: string;
  date?: string | null;
  place?: string;
  note?: string;
  sortOrder?: number;
  photos: PhotoInput[];
}

interface WallRow {
  id: number;
  slug: string;
  title: string;
  date: string | null;
  place: string;
  note: string;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface PhotoRow {
  id: number;
  wall_id: number;
  file: string;
  caption: string;
  title: string | null;
  story: string | null;
  group_name: string | null;
  coord: string | null;
  date: string | null;
  location: string | null;
  aspect: string | null;
  ar: number | null;
  ratio_pill: string | null;
  camera: string | null;
  lens: string | null;
  exposure: string | null;
  color: string | null;
  gps: string | null;
  ev: string | null;
  hist_json: string | null;
  auto_fields_json: string | null;
  sort_order: number;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function photoUrl(file: string): string {
  return `/uploads/photos/${encodeURIComponent(file)}`;
}

function mapPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    wallId: row.wall_id,
    file: row.file,
    url: photoUrl(row.file),
    caption: row.caption,
    title: row.title,
    story: row.story,
    group: row.group_name,
    coord: row.coord,
    date: row.date,
    location: row.location,
    aspect: row.aspect,
    ar: row.ar,
    ratioPill: row.ratio_pill,
    camera: row.camera,
    lens: row.lens,
    exposure: row.exposure,
    color: row.color,
    gps: row.gps,
    ev: row.ev,
    hist: parseJson<number[] | null>(row.hist_json, null),
    autoFields: parseJson<string[] | null>(row.auto_fields_json, null),
    sortOrder: row.sort_order,
  };
}

function mapWall(row: WallRow, photos: Photo[]): PhotoWall {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    date: row.date,
    place: row.place,
    note: row.note,
    sortOrder: row.sort_order,
    photos,
    cover: photos[0]?.url ?? null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

let wallsCacheVersion = -1;
let cachedAllWalls: PhotoWall[] | null = null;

function ensureWallsCacheFresh(): PhotoWall[] {
  const currentVer = getContentVersion();
  if (wallsCacheVersion === currentVer && cachedAllWalls) {
    return cachedAllWalls;
  }
  const db = getDb();
  const walls = db
    .prepare('SELECT * FROM photo_walls ORDER BY (date IS NULL), date DESC, sort_order ASC, id ASC')
    .all() as WallRow[];
  const allPhotos = db
    .prepare('SELECT * FROM photos ORDER BY wall_id, sort_order, id')
    .all() as PhotoRow[];

  const photosByWall = new Map<number, Photo[]>();
  for (const pRow of allPhotos) {
    let list = photosByWall.get(pRow.wall_id);
    if (!list) {
      list = [];
      photosByWall.set(pRow.wall_id, list);
    }
    list.push(mapPhoto(pRow));
  }

  cachedAllWalls = walls.map((wall) => mapWall(wall, photosByWall.get(wall.id) ?? []));
  wallsCacheVersion = currentVer;
  return cachedAllWalls;
}

function invalidateWallsCache(): void {
  cachedAllWalls = null;
  bumpContentVersion();
}

export function listWalls(options: { includeEmpty?: boolean } = {}): PhotoWall[] {
  const walls = ensureWallsCacheFresh();
  return options.includeEmpty ? walls : walls.filter((wall) => wall.photos.length > 0);
}

export function getWallBySlug(slug: string): PhotoWall | null {
  const walls = ensureWallsCacheFresh();
  return walls.find((w) => w.slug === slug) ?? null;
}

export function countWalls(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM photo_walls').get() as { n: number }).n;
}

function writePhotos(wallId: number, photos: PhotoInput[]): void {
  const db = getDb();
  db.prepare('DELETE FROM photos WHERE wall_id = ?').run(wallId);
  const stmt = db.prepare(
    `INSERT INTO photos (
      wall_id, file, caption, title, story, group_name, coord, date, location, aspect,
      ar, ratio_pill, camera, lens, exposure, color, gps, ev, hist_json, auto_fields_json, sort_order
    ) VALUES (
      @wallId, @file, @caption, @title, @story, @group, @coord, @date, @location, @aspect,
      @ar, @ratioPill, @camera, @lens, @exposure, @color, @gps, @ev, @histJson, @autoFieldsJson, @sortOrder
    )`
  );
  photos.forEach((p, i) => {
    stmt.run({
      wallId,
      file: p.file,
      caption: p.caption ?? '',
      title: p.title ?? null,
      story: p.story ?? null,
      group: p.group ?? null,
      coord: p.coord ?? null,
      date: p.date ?? null,
      location: p.location ?? null,
      aspect: p.aspect ?? null,
      ar: p.ar ?? null,
      ratioPill: p.ratioPill ?? null,
      camera: p.camera ?? null,
      lens: p.lens ?? null,
      exposure: p.exposure ?? null,
      color: p.color ?? null,
      gps: p.gps ?? null,
      ev: p.ev ?? null,
      histJson: p.hist ? JSON.stringify(p.hist) : null,
      autoFieldsJson: p.autoFields ? JSON.stringify(p.autoFields) : null,
      sortOrder: i,
    });
  });
}

export function createWall(input: WallInput): PhotoWall {
  const db = getDb();
  db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO photo_walls (slug, title, date, place, note, sort_order)
         VALUES (@slug, @title, @date, @place, @note, @sortOrder)`
      )
      .run({
        slug: input.slug,
        title: input.title,
        date: input.date ?? null,
        place: input.place ?? '',
        note: input.note ?? '',
        sortOrder: input.sortOrder ?? 0,
      });
    writePhotos(Number(info.lastInsertRowid), input.photos);
  })();
  invalidateWallsCache();
  return getWallBySlug(input.slug)!;
}

export function updateWall(
  id: number,
  input: Partial<WallInput>,
  expectedVersion?: number
): PhotoWall | null {
  const db = getDb();
  const current = db.prepare('SELECT * FROM photo_walls WHERE id = ?').get(id) as
    | WallRow
    | undefined;
  if (!current) return null;
  if (expectedVersion !== undefined && current.version !== expectedVersion) return null;

  const next = {
    slug: input.slug ?? current.slug,
    title: input.title ?? current.title,
    date: input.date === undefined ? current.date : input.date,
    place: input.place ?? current.place,
    note: input.note ?? current.note,
    sortOrder: input.sortOrder ?? current.sort_order,
  };
  const updated = db.transaction(() => {
    const info = db
      .prepare(
        `UPDATE photo_walls SET slug = @slug, title = @title, date = @date, place = @place,
          note = @note, sort_order = @sortOrder, version = version + 1,
          updated_at = datetime('now')
         WHERE id = @id AND version = @expectedVersion`
      )
      .run({ ...next, id, expectedVersion: current.version });
    if (info.changes === 0) return false;
    if (input.photos) writePhotos(id, input.photos);
    return true;
  })();
  if (!updated) return null;
  invalidateWallsCache();
  return getWallBySlug(next.slug);
}

export function deleteWall(id: number): boolean {
  const db = getDb();
  const deleted = db.transaction(() => {
    db.prepare('DELETE FROM photos WHERE wall_id = ?').run(id);
    const info = db.prepare('DELETE FROM photo_walls WHERE id = ?').run(id);
    return info.changes > 0;
  })();
  if (deleted) invalidateWallsCache();
  return deleted;
}
