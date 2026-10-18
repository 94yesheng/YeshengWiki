/**
 * 站点级配置的读取层 —— 真正的数据在 src/site.data.json
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
  brandCoord?: string;
  footerCopyright?: string;
  divergenceMeter?: {
    enabled: boolean;
    worldline: string;
  };
  nav: NavItem[];
}

export interface HomeSection {
  href: string;
  title: string;
  meta?: string;
  desc: string;
}

export interface HomeConfig {
  originBadge?: string;
  topbarTag?: string;
  coordText?: string;
  equation?: string;
  manifold?: {
    defaultTheme?: string;
    particleCount?: number;
    speed?: number;
    snapScroll?: boolean;
    loaderText?: string;
  };
  intro: string[];
  sections: HomeSection[];
}

export interface RailCustomCard {
  id: string;
  enabled: boolean;
  kicker: string;
  badge: string;
  type: 'text' | 'kv';
  content?: string;
  items?: Array<{ label: string; value: string }>;
}

export interface ArticleRailConfig {
  sticky?: boolean;
  threeBody?: {
    eraBadge?: string;
    fluxReadout?: string;
    defaultCaption?: string;
  };
  docSpec?: {
    enabled?: boolean;
    kicker?: string;
    badge?: string;
    showPublished?: boolean;
    showChars?: boolean;
    showReading?: boolean;
    showTags?: boolean;
    customRows?: Array<{ label: string; value: string }>;
  };
  topology?: {
    enabledForMc?: boolean;
    globalEnabled?: boolean;
    kicker?: string;
    badge?: string;
    node1Title?: string;
    node1Sub?: string;
    node2Title?: string;
    node2Sub?: string;
    node3Title?: string;
    node3Sub?: string;
    line1?: string;
    line2?: string;
  };
  related?: {
    enabled?: boolean;
    kicker?: string;
    badge?: string;
    maxCount?: number;
    strategy?: string;
  };
  customCards?: RailCustomCard[];
}

export const site = raw.site satisfies SiteConfig;
export const home = raw.home satisfies HomeConfig;
// JSON 里的字符串字面量（如 customCards.type）会被推断成 string，
// 无法直接 satisfies 含字面量联合的接口；这里先按接口收窄。
export const articleRail = (raw.articleRail ?? {}) as ArticleRailConfig;
export const authorDossier = raw.authorDossier ?? {};
export const programsConfig = raw.programs ?? {};
