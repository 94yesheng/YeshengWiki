// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // sitemap 与 RSS 生成绝对 URL 依赖这一项，必填
  site: 'https://www.yesheng.wiki',

  // 目录式输出 + 强制尾斜杠：Apache 的 DirectoryIndex 直接服务 index.html，
  // cPanel 主机上开箱即用，不需要额外重写规则
  trailingSlash: 'always',
  build: { format: 'directory' },

  integrations: [
    // 后台不要进站点地图：它带 noindex，被搜索引擎收录没有意义
    sitemap({ filter: (page) => !page.includes('/studio') && !page.includes('/admin') }),
  ],

  // 纯静态站，不装任何 adapter
});
