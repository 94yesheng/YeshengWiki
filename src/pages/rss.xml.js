export const prerender = false;

import rss from '@astrojs/rss';
import { listPosts } from '../server/repositories/posts';
import { getSiteConfig } from '../server/site';
import { renderMarkdown } from '../server/markdown';

function deriveExcerpt(markdown) {
  const text = String(markdown ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`#>~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export async function GET(context) {
  const site = getSiteConfig();
  const posts = listPosts();

  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: new Date(`${post.pubDate}T00:00:00`),
      description: post.description?.trim() || post.lead?.trim() || deriveExcerpt(post.bodyMarkdown),
      content: renderMarkdown(post.bodyMarkdown).html,
      link: `/posts/${post.slug}/`,
      categories: post.tags,
    })),
    customData: '<language>zh-cn</language>',
  });
}
