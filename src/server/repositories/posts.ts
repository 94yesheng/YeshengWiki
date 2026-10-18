/**
 * 文章数据访问层。所有 SQL 只在这里出现，页面/API 只拿类型化对象。
 */
import { getDb } from '../db';

export interface RailSpec {
  label: string;
  value: string;
}

export interface Post {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  lead: string | null;
  bodyMarkdown: string;
  rawMarkdown: string;
  cover: string | null;
  coverCaption: string | null;
  entryBadge: string | null;
  featured: boolean;
  draft: boolean;
  pubDate: string;
  updatedDate: string | null;
  kineticCaption: string | null;
  railMode: string | null;
  railSpecs: RailSpec[] | null;
  railTopology: Record<string, unknown> | null;
  tags: string[];
  autoUpdated: boolean | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostInput {
  slug: string;
  title: string;
  description?: string | null;
  lead?: string | null;
  bodyMarkdown: string;
  rawMarkdown?: string;
  cover?: string | null;
  coverCaption?: string | null;
  entryBadge?: string | null;
  featured?: boolean;
  draft?: boolean;
  pubDate: string;
  updatedDate?: string | null;
  kineticCaption?: string | null;
  railMode?: string | null;
  railSpecs?: RailSpec[] | null;
  railTopology?: Record<string, unknown> | null;
  tags?: string[];
  autoUpdated?: boolean | null;
}

interface PostRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  lead: string | null;
  body_markdown: string;
  raw_markdown: string;
  cover: string | null;
  cover_caption: string | null;
  entry_badge: string | null;
  featured: number;
  draft: number;
  pub_date: string;
  updated_date: string | null;
  kinetic_caption: string | null;
  rail_mode: string | null;
  rail_specs_json: string | null;
  rail_topology_json: string | null;
  tags_json: string;
  auto_updated: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    lead: row.lead,
    bodyMarkdown: row.body_markdown,
    rawMarkdown: row.raw_markdown,
    cover: row.cover,
    coverCaption: row.cover_caption,
    entryBadge: row.entry_badge,
    featured: row.featured === 1,
    draft: row.draft === 1,
    pubDate: row.pub_date,
    updatedDate: row.updated_date,
    kineticCaption: row.kinetic_caption,
    railMode: row.rail_mode,
    railSpecs: parseJson<RailSpec[] | null>(row.rail_specs_json, null),
    railTopology: parseJson<Record<string, unknown> | null>(row.rail_topology_json, null),
    tags: parseJson<string[]>(row.tags_json, []),
    autoUpdated: row.auto_updated === null ? null : row.auto_updated === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPosts(options: { includeDrafts?: boolean; tag?: string } = {}): Post[] {
  const db = getDb();
  const sql = options.includeDrafts
    ? 'SELECT * FROM posts ORDER BY pub_date DESC, id DESC'
    : 'SELECT * FROM posts WHERE draft = 0 ORDER BY pub_date DESC, id DESC';
  let posts = (db.prepare(sql).all() as PostRow[]).map(mapRow);
  if (options.tag) posts = posts.filter((p) => p.tags.includes(options.tag!));
  return posts;
}

export function getPostBySlug(slug: string, includeDrafts = false): Post | null {
  const db = getDb();
  const row = db
    .prepare(
      includeDrafts
        ? 'SELECT * FROM posts WHERE slug = ?'
        : 'SELECT * FROM posts WHERE slug = ? AND draft = 0'
    )
    .get(slug) as PostRow | undefined;
  return row ? mapRow(row) : null;
}

export function getPostById(id: number): Post | null {
  const row = getDb().prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined;
  return row ? mapRow(row) : null;
}

export function countPosts(includeDrafts = false): number {
  const row = getDb()
    .prepare(includeDrafts ? 'SELECT COUNT(*) AS n FROM posts' : 'SELECT COUNT(*) AS n FROM posts WHERE draft = 0')
    .get() as { n: number };
  return row.n;
}

export function createPost(input: PostInput): Post {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO posts (
        slug, title, description, lead, body_markdown, raw_markdown, cover, cover_caption, entry_badge,
        featured, draft, pub_date, updated_date, kinetic_caption, rail_mode,
        rail_specs_json, rail_topology_json, tags_json, auto_updated
      ) VALUES (
        @slug, @title, @description, @lead, @bodyMarkdown, @rawMarkdown, @cover, @coverCaption, @entryBadge,
        @featured, @draft, @pubDate, @updatedDate, @kineticCaption, @railMode,
        @railSpecsJson, @railTopologyJson, @tagsJson, @autoUpdated
      )`
    )
    .run({
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      lead: input.lead ?? null,
      bodyMarkdown: input.bodyMarkdown,
      rawMarkdown: input.rawMarkdown ?? input.bodyMarkdown,
      cover: input.cover ?? null,
      coverCaption: input.coverCaption ?? null,
      entryBadge: input.entryBadge ?? null,
      featured: input.featured ? 1 : 0,
      draft: input.draft ? 1 : 0,
      pubDate: input.pubDate,
      updatedDate: input.updatedDate ?? null,
      kineticCaption: input.kineticCaption ?? null,
      railMode: input.railMode ?? null,
      railSpecsJson: input.railSpecs ? JSON.stringify(input.railSpecs) : null,
      railTopologyJson: input.railTopology ? JSON.stringify(input.railTopology) : null,
      tagsJson: JSON.stringify(input.tags ?? []),
      autoUpdated:
        typeof input.autoUpdated === 'boolean' ? (input.autoUpdated ? 1 : 0) : null,
    });
  return getPostById(Number(info.lastInsertRowid))!;
}

export function updatePost(
  id: number,
  input: Partial<PostInput>,
  expectedVersion?: number
): Post | null {
  const current = getPostById(id);
  if (!current) return null;
  if (expectedVersion !== undefined && current.version !== expectedVersion) return null;

  const next: PostInput = {
    slug: input.slug ?? current.slug,
    title: input.title ?? current.title,
    description: input.description === undefined ? current.description : input.description,
    lead: input.lead === undefined ? current.lead : input.lead,
    bodyMarkdown: input.bodyMarkdown ?? current.bodyMarkdown,
    rawMarkdown: input.rawMarkdown ?? current.rawMarkdown,
    cover: input.cover === undefined ? current.cover : input.cover,
    coverCaption: input.coverCaption === undefined ? current.coverCaption : input.coverCaption,
    entryBadge: input.entryBadge === undefined ? current.entryBadge : input.entryBadge,
    featured: input.featured ?? current.featured,
    draft: input.draft ?? current.draft,
    pubDate: input.pubDate ?? current.pubDate,
    updatedDate: input.updatedDate === undefined ? current.updatedDate : input.updatedDate,
    kineticCaption:
      input.kineticCaption === undefined ? current.kineticCaption : input.kineticCaption,
    railMode: input.railMode === undefined ? current.railMode : input.railMode,
    railSpecs: input.railSpecs === undefined ? current.railSpecs : input.railSpecs,
    railTopology: input.railTopology === undefined ? current.railTopology : input.railTopology,
    tags: input.tags ?? current.tags,
    autoUpdated: input.autoUpdated === undefined ? current.autoUpdated : input.autoUpdated,
  };

  getDb()
    .prepare(
      `UPDATE posts SET
        slug = @slug, title = @title, description = @description, lead = @lead,
        body_markdown = @bodyMarkdown, raw_markdown = @rawMarkdown, cover = @cover, cover_caption = @coverCaption,
        entry_badge = @entryBadge, featured = @featured, draft = @draft,
        pub_date = @pubDate, updated_date = @updatedDate, kinetic_caption = @kineticCaption,
        rail_mode = @railMode, rail_specs_json = @railSpecsJson,
        rail_topology_json = @railTopologyJson, tags_json = @tagsJson,
        auto_updated = @autoUpdated, version = version + 1, updated_at = datetime('now')
      WHERE id = @id`
    )
    .run({
      id,
      slug: next.slug,
      title: next.title,
      description: next.description ?? null,
      lead: next.lead ?? null,
      bodyMarkdown: next.bodyMarkdown,
      rawMarkdown: next.rawMarkdown ?? next.bodyMarkdown,
      cover: next.cover ?? null,
      coverCaption: next.coverCaption ?? null,
      entryBadge: next.entryBadge ?? null,
      featured: next.featured ? 1 : 0,
      draft: next.draft ? 1 : 0,
      pubDate: next.pubDate,
      updatedDate: next.updatedDate ?? null,
      kineticCaption: next.kineticCaption ?? null,
      railMode: next.railMode ?? null,
      railSpecsJson: next.railSpecs ? JSON.stringify(next.railSpecs) : null,
      railTopologyJson: next.railTopology ? JSON.stringify(next.railTopology) : null,
      tagsJson: JSON.stringify(next.tags),
      autoUpdated:
        typeof next.autoUpdated === 'boolean' ? (next.autoUpdated ? 1 : 0) : null,
    });

  return getPostById(id);
}

export function deletePost(id: number): boolean {
  const info = getDb().prepare('DELETE FROM posts WHERE id = ?').run(id);
  return info.changes > 0;
}
