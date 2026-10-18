/** 友链数据访问层。 */
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
        id: link.id,
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
