/**
 * 站点级配置的读取层 —— 真正的数据在 src/site.data.json
 *
 * 为什么拆成两个文件：网页后台（Sveltia CMS）只能编辑数据文件，改不了 TypeScript。
 * 所以数据搬进 JSON，这个 .ts 只负责"读进来 + 标注类型"，对外的导出名与形状
 * 与拆开之前完全一致 —— 五个消费者（BaseLayout / SiteHeader / SiteFooter /
 * rss.xml.js / index.astro）的 import 一行都不用改。
 *
 * 为什么用 `satisfies` 而不是原来的 `as const`：`as const` 对 JSON 导入无效
 * （JSON 模块的类型是推导出来的，不能被断言成字面量）。而 `satisfies` 的作用是
 * 「必须符合这个形状」——如果后台把字段名写错、或漏掉一个必填项，构建会直接报错。
 * 也就是说，这一层同时是类型标注和**后台写坏数据时的护栏**。
 *
 * 字段含义（原注释在搬移时保留在这里）：
 *   site.url         站点绝对地址，RSS 与 sitemap 拼链接靠它（换域名要改）
 *   site.title       og:site_name 与 RSS 标题
 *   site.description 默认 meta description
 *   site.nav         主导航。加一个新板块在这里加一行即可，页面文件另建
 *   home.intro       主页自我介绍，每个段落是一个字符串
 *   home.sections    主页上的各子页导览，顺序即显示顺序
 */

import raw from './site.data.json';

export interface NavItem {
  href: string;
  label: string;
}

export interface SiteConfig {
  url: string;
  title: string;
  tagline: string;
  description: string;
  author: string;
  nav: NavItem[];
}

export interface HomeSection {
  href: string;
  title: string;
  desc: string;
}

export interface HomeConfig {
  intro: string[];
  sections: HomeSection[];
}

export const site = raw.site satisfies SiteConfig;
export const home = raw.home satisfies HomeConfig;
