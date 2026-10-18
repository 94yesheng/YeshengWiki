export const prerender = false;

import rss from '@astrojs/rss';
import { listPosts } from '../server/repositories/posts';
import { getSetting } from '../server/repositories/settings';
import { site as staticSite } from '../site.config';

export async function GET(context) {
  const site = getSetting('site', staticSite);
  const posts = listPosts();

  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: new Date(`${post.pubDate}T00:00:00`),
      description: post.description ?? '',
      link: `/posts/${post.slug}/`,
      categories: post.tags,
    })),
    customData: '<language>zh-cn</language>',
  });
}
