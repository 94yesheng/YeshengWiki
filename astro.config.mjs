// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

/**
 * 默认仍然是静态构建（`npm run build`），保持线上可用。
 * 动态版用 `BLOG_DYNAMIC=1 npm run build`：输出 SSR standalone，
 * 由 systemd 跑 Node，Nginx 反代。
 */
const dynamic = process.env.BLOG_DYNAMIC === '1';

export default defineConfig({
  // sitemap 与 RSS 生成绝对 URL 依赖这一项，必填
  site: 'https://www.yesheng.wiki',

  // 静态版强制尾斜杠；SSR 版忽略，避免 /api/* 被 301（POST 会丢 body）
  trailingSlash: dynamic ? 'ignore' : 'always',
  build: { format: 'directory' },

  // 静态版与动态版分开输出，避免动态构建覆盖线上要传的 dist/
  outDir: dynamic ? './dist-dynamic' : './dist',

  output: dynamic ? 'server' : 'static',
  ...(dynamic ? { adapter: node({ mode: 'standalone' }) } : {}),

  integrations: [],

  vite: {
    ssr: {
      // better-sqlite3 是原生模块，不要被 Vite 打进 bundle
      external: ['better-sqlite3'],
    },
  },
});
