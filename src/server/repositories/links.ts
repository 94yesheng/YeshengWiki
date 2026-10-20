/** 友链与友链申请数据访问层。 */
import { getDb } from '../db';

export interface Link {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar: string | null;
  tag: string | null;
  owner: string | null;
  sortOrder: number;
}

export interface LinkApplication {
  id: number;
  owner: string;
  name: string;
  url: string;
  description: string;
  avatar: string | null;
  tag: string | null;
  status: 'pending' | 'approved';
  createdAt: string;
}

interface LinkRow {
  link_id: string;
  name: string;
  url: string;
  description: string;
  avatar: string | null;
  tag: string | null;
  owner: string | null;
  sort_order: number;
}

interface LinkApplicationRow {
  id: number;
  owner: string;
  name: string;
  url: string;
  description: string;
  avatar: string | null;
  tag: string | null;
  status: string;
  created_at: string;
}

export function listLinks(): Link[] {
  const rows = getDb()
    .prepare('SELECT * FROM links ORDER BY sort_order, id')
    .all() as LinkRow[];
  return rows.map((row) => ({
    id: row.link_id,
    name: row.name,
    url: row.url,
    description: row.description,
    avatar: row.avatar,
    tag: row.tag,
    owner: row.owner,
    sortOrder: row.sort_order,
  }));
}

export function replaceLinks(links: Array<Omit<Link, 'sortOrder'>>): Link[] {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM links').run();
    const stmt = db.prepare(
      `INSERT INTO links (link_id, name, url, description, avatar, tag, owner, sort_order)
       VALUES (@id, @name, @url, @description, @avatar, @tag, @owner, @sortOrder)`
    );
    links.forEach((link, i) => {
      stmt.run({
        id: link.id || `peer-${Date.now().toString(36)}-${i}`,
        name: link.name,
        url: link.url,
        description: link.description ?? '',
        avatar: link.avatar ?? null,
        tag: link.tag ?? null,
        owner: link.owner ?? null,
        sortOrder: i,
      });
    });
  })();
  return listLinks();
}

export function countLinks(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM links').get() as { n: number }).n;
}

function mapApplication(row: LinkApplicationRow): LinkApplication {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    url: row.url,
    description: row.description,
    avatar: row.avatar,
    tag: row.tag,
    status: row.status === 'approved' ? 'approved' : 'pending',
    createdAt: row.created_at,
  };
}

export function listLinkApplications(): LinkApplication[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM link_applications
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC`
    )
    .all() as LinkApplicationRow[];
  return rows.map(mapApplication);
}

export function createLinkApplication(input: {
  owner: string;
  name: string;
  url: string;
  description: string;
  avatar?: string | null;
  tag?: string | null;
}): LinkApplication {
  const db = getDb();
  const owner = input.owner.trim();
  const name = input.name.trim();
  const url = input.url.trim();
  const description = input.description.trim();
  const avatar = input.avatar?.trim() || name.slice(0, 1) || '友';
  const tag = input.tag?.trim() || '独立博客';

  const info = db
    .prepare(
      `INSERT INTO link_applications (owner, name, url, description, avatar, tag, status)
       VALUES (@owner, @name, @url, @description, @avatar, @tag, 'pending')`
    )
    .run({
      owner,
      name,
      url,
      description,
      avatar,
      tag,
    });

  const row = db
    .prepare('SELECT * FROM link_applications WHERE id = ?')
    .get(info.lastInsertRowid) as LinkApplicationRow;
  return mapApplication(row);
}

export function approveLinkApplication(id: number): {
  application: LinkApplication | null;
  links: Link[];
} {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM link_applications WHERE id = ?')
    .get(id) as LinkApplicationRow | undefined;
  if (!row) return { application: null, links: listLinks() };

  db.transaction(() => {
    db.prepare(`UPDATE link_applications SET status = 'approved' WHERE id = ?`).run(id);

    const existingByUrl = db
      .prepare('SELECT id FROM links WHERE LOWER(url) = LOWER(?)')
      .get(row.url) as { id: number } | undefined;

    if (!existingByUrl) {
      let hostSlug = '';
      try {
        hostSlug = new URL(row.url).hostname
          .replace(/^www\./i, '')
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase();
      } catch {
        hostSlug = '';
      }
      const baseId = hostSlug || `peer-${row.id}`;
      let linkId = baseId;
      let suffix = 2;
      while (db.prepare('SELECT 1 FROM links WHERE link_id = ?').get(linkId)) {
        linkId = `${baseId}-${suffix++}`;
      }

      const maxOrderRow = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM links')
        .get() as { m: number };
      const ownerFormatted = row.owner.startsWith('站长')
        ? row.owner
        : `站长：${row.owner} · 持续更新`;
      const avatarChar = (row.avatar ?? '').trim() || row.name.trim().slice(0, 1) || '友';

      db.prepare(
        `INSERT INTO links (link_id, name, url, description, avatar, tag, owner, sort_order)
         VALUES (@linkId, @name, @url, @description, @avatar, @tag, @owner, @sortOrder)`
      ).run({
        linkId,
        name: row.name,
        url: row.url,
        description: row.description,
        avatar: avatarChar,
        tag: row.tag?.trim() || '独立博客 · 友链',
        owner: ownerFormatted,
        sortOrder: (maxOrderRow?.m ?? -1) + 1,
      });
    }
  })();

  const updated = db
    .prepare('SELECT * FROM link_applications WHERE id = ?')
    .get(id) as LinkApplicationRow;
  return {
    application: mapApplication(updated),
    links: listLinks(),
  };
}

export function deleteLinkApplication(id: number): boolean {
  const info = getDb().prepare('DELETE FROM link_applications WHERE id = ?').run(id);
  return info.changes > 0;
}
