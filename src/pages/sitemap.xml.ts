import type { APIRoute } from 'astro';
import { listPostMeta } from '../server/repositories/posts';

export const prerender = false;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Entry {
  loc: string;
  lastmod?: string | null;
  changefreq?: string;
  priority?: string;
}

export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('https://www.yesheng.wiki')).origin;
  const posts = listPostMeta();

  const entries: Entry[] = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/posts/', changefreq: 'daily', priority: '0.8' },
    { loc: '/photos/', changefreq: 'weekly', priority: '0.8' },
    { loc: '/programs/', changefreq: 'monthly', priority: '0.5' },
    { loc: '/links/', changefreq: 'monthly', priority: '0.5' },
    ...posts.map((post) => ({
      loc: `/posts/${post.slug}/`,
      lastmod: post.updatedDate ?? post.pubDate,
      changefreq: 'monthly',
      priority: '0.7',
    })),
  ];

  const body = entries
    .map(
      (e) => `  <url>
    <loc>${esc(base + e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${esc(e.lastmod)}</lastmod>` : ''}${
        e.changefreq ? `\n    <changefreq>${e.changefreq}</changefreq>` : ''
      }${e.priority ? `\n    <priority>${e.priority}</priority>` : ''}
  </url>`
    )
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
};
