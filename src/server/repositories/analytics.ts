/**
 * 访客统计数据层（`visitor_logs` 表）：
 *   1. 支持「服务端请求头链 + 浏览器端真实公网 IP 遥测信标（WebRTC STUN / 国内 BGP 节点 / JSONP）」双通道真实 IP 采集，彻底解决反代/内网穿透下只识别到 127.0.0.1 本地 IP 的问题；
 *   2. 采用「内存写缓冲合并 + 预编译事务落盘 + LRU 归属地缓存 + 省市级精准坐标匹配」，对前台页面加载速度零阻塞（0ms TTFB 开销）；
 *   3. 支持按日（day）、按周（week）、按月（month）、按年（year）四个时间维度整合统计，不含任何伪造/模拟样本数据。
 */
import type { APIContext } from 'astro';
import type Database from 'better-sqlite3';
import { getClientIp, isPrivateOrLoopbackIp, normalizeIp } from '../auth';
import { getDb } from '../db';

export type StatsGranularity = 'day' | 'week' | 'month' | 'year';

export interface VisitorLogItem {
  id: number;
  visitDate: string;
  ip: string;
  countryCode: string;
  countryZh: string;
  countryEn: string;
  region: string;
  lat: number;
  lon: number;
  deviceType: string;
  os: string;
  browser: string;
  userAgent: string;
  path: string;
  referrer: string;
  pvCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface TimeSeriesBucket {
  bucket: string;
  label: string;
  uv: number;
  pv: number;
  desktop: number;
  mobile: number;
  tablet: number;
  topCountry: string;
  topIp: string;
  topDevice: string;
}

export interface CountryStatItem {
  countryZh: string;
  countryEn: string;
  countryCode: string;
  lat: number;
  lon: number;
  uv: number;
  pv: number;
  share: number;
  latestIp: string;
  latestDevice: string;
  lastSeen: string;
}

export interface DeviceBreakdownItem {
  name: string;
  uv: number;
  pv: number;
  share: number;
}

export interface AnalyticsDashboardData {
  granularity: StatsGranularity;
  selectedBucket: string | null;
  selectedCountry: string | null;
  selectedDevice: string | null;
  summary: {
    todayUv: number;
    todayPv: number;
    weekUv: number;
    weekPv: number;
    monthUv: number;
    monthPv: number;
    yearUv: number;
    yearPv: number;
    totalUv: number;
    totalPv: number;
    activeCountries: number;
    desktopShare: number;
    mobileShare: number;
  };
  series: TimeSeriesBucket[];
  countries: CountryStatItem[];
  devices: {
    types: DeviceBreakdownItem[];
    os: DeviceBreakdownItem[];
    browsers: DeviceBreakdownItem[];
  };
  logs: {
    items: VisitorLogItem[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface GeoProfile {
  code: string;
  zh: string;
  en: string;
  region: string;
  lat: number;
  lon: number;
  enriched?: boolean;
}

export interface ClientBeaconPayload {
  ip?: string;
  path?: string;
  referrer?: string;
  pro?: string;
  city?: string;
  addr?: string;
  countryCode?: string;
  countryZh?: string;
  countryEn?: string;
  region?: string;
  isp?: string;
  lat?: number;
  lon?: number;
}

/* --------------------------------------------------------------------------
   全球国家元数据字典（与 stats.html 3D 粒子地球仪 174 国名称严格对齐）
   -------------------------------------------------------------------------- */
const COUNTRY_BY_CODE: Record<string, Omit<GeoProfile, 'region' | 'enriched'>> = {
  CN: { code: 'CN', zh: '中国', en: 'China', lat: 35.0, lon: 104.0 },
  HK: { code: 'CN', zh: '中国', en: 'China', lat: 22.32, lon: 114.17 },
  MO: { code: 'CN', zh: '中国', en: 'China', lat: 22.2, lon: 113.54 },
  TW: { code: 'CN', zh: '中国', en: 'China', lat: 25.03, lon: 121.56 },
  SG: { code: 'SG', zh: '新加坡', en: 'Singapore', lat: 1.35, lon: 103.82 },
  JP: { code: 'JP', zh: '日本', en: 'Japan', lat: 35.68, lon: 139.76 },
  KR: { code: 'KR', zh: '韩国', en: 'South Korea', lat: 37.57, lon: 126.98 },
  KP: { code: 'KP', zh: '朝鲜', en: 'North Korea', lat: 40.3, lon: 126.8 },
  MY: { code: 'MY', zh: '马来西亚', en: 'Malaysia', lat: 3.14, lon: 101.69 },
  TH: { code: 'TH', zh: '泰国', en: 'Thailand', lat: 13.76, lon: 100.5 },
  VN: { code: 'VN', zh: '越南', en: 'Vietnam', lat: 16.0, lon: 107.8 },
  ID: { code: 'ID', zh: '印度尼西亚', en: 'Indonesia', lat: -0.2, lon: 113.3 },
  PH: { code: 'PH', zh: '菲律宾', en: 'Philippines', lat: 15.7, lon: 120.8 },
  IN: { code: 'IN', zh: '印度', en: 'India', lat: 21.9, lon: 79.2 },
  PK: { code: 'PK', zh: '巴基斯坦', en: 'Pakistan', lat: 30.4, lon: 70.1 },
  BD: { code: 'BD', zh: '孟加拉国', en: 'Bangladesh', lat: 23.6, lon: 89.9 },
  LK: { code: 'LK', zh: '斯里兰卡', en: 'Sri Lanka', lat: 7.9, lon: 80.7 },
  NP: { code: 'NP', zh: '尼泊尔', en: 'Nepal', lat: 28.3, lon: 83.4 },
  KH: { code: 'KH', zh: '柬埔寨', en: 'Cambodia', lat: 12.9, lon: 105.0 },
  LA: { code: 'LA', zh: '老挝', en: 'Laos', lat: 18.2, lon: 102.1 },
  MM: { code: 'MM', zh: '缅甸', en: 'Myanmar', lat: 19.0, lon: 95.9 },
  MN: { code: 'MN', zh: '蒙古', en: 'Mongolia', lat: 46.8, lon: 105.3 },
  KZ: { code: 'KZ', zh: '哈萨克斯坦', en: 'Kazakhstan', lat: 48.1, lon: 66.3 },
  UZ: { code: 'UZ', zh: '乌兹别克斯坦', en: 'Uzbekistan', lat: 41.4, lon: 63.4 },
  AE: { code: 'AE', zh: '阿联酋', en: 'United Arab Emirates', lat: 24.3, lon: 55.0 },
  SA: { code: 'SA', zh: '沙特阿拉伯', en: 'Saudi Arabia', lat: 24.3, lon: 44.6 },
  IL: { code: 'IL', zh: '以色列', en: 'Israel', lat: 31.4, lon: 34.7 },
  TR: { code: 'TR', zh: '土耳其', en: 'Turkey', lat: 38.6, lon: 35.5 },
  IR: { code: 'IR', zh: '伊朗', en: 'Iran', lat: 32.3, lon: 54.1 },
  US: { code: 'US', zh: '美国', en: 'United States', lat: 39.0, lon: -98.0 },
  CA: { code: 'CA', zh: '加拿大', en: 'Canada', lat: 56.7, lon: -110.2 },
  MX: { code: 'MX', zh: '墨西哥', en: 'Mexico', lat: 23.6, lon: -102.3 },
  BR: { code: 'BR', zh: '巴西', en: 'Brazil', lat: -14.1, lon: -49.7 },
  AR: { code: 'AR', zh: '阿根廷', en: 'Argentina', lat: -37.2, lon: -64.1 },
  CL: { code: 'CL', zh: '智利', en: 'Chile', lat: -35.8, lon: -71.5 },
  CO: { code: 'CO', zh: '哥伦比亚', en: 'Colombia', lat: 4.0, lon: -72.5 },
  PE: { code: 'PE', zh: '秘鲁', en: 'Peru', lat: -9.2, lon: -75.9 },
  GB: { code: 'GB', zh: '英国', en: 'United Kingdom', lat: 54.2, lon: -1.8 },
  DE: { code: 'DE', zh: '德国', en: 'Germany', lat: 51.4, lon: 10.4 },
  FR: { code: 'FR', zh: '法国', en: 'France', lat: 46.9, lon: 2.1 },
  NL: { code: 'NL', zh: '荷兰', en: 'Netherlands', lat: 52.0, lon: 5.4 },
  CH: { code: 'CH', zh: '瑞士', en: 'Switzerland', lat: 46.8, lon: 8.3 },
  SE: { code: 'SE', zh: '瑞典', en: 'Sweden', lat: 62.3, lon: 14.8 },
  NO: { code: 'NO', zh: '挪威', en: 'Norway', lat: 64.6, lon: 12.2 },
  FI: { code: 'FI', zh: '芬兰', en: 'Finland', lat: 65.0, lon: 27.4 },
  DK: { code: 'DK', zh: '丹麦', en: 'Denmark', lat: 56.3, lon: 9.5 },
  IS: { code: 'IS', zh: '冰岛', en: 'Iceland', lat: 65.0, lon: -18.5 },
  IE: { code: 'IE', zh: '爱尔兰', en: 'Ireland', lat: 53.5, lon: -7.8 },
  BE: { code: 'BE', zh: '比利时', en: 'Belgium', lat: 50.6, lon: 4.7 },
  LU: { code: 'LU', zh: '卢森堡', en: 'Luxembourg', lat: 49.7, lon: 6.0 },
  AT: { code: 'AT', zh: '奥地利', en: 'Austria', lat: 47.9, lon: 15.0 },
  IT: { code: 'IT', zh: '意大利', en: 'Italy', lat: 42.6, lon: 12.6 },
  ES: { code: 'ES', zh: '西班牙', en: 'Spain', lat: 39.9, lon: -3.5 },
  PT: { code: 'PT', zh: '葡萄牙', en: 'Portugal', lat: 39.5, lon: -8.4 },
  PL: { code: 'PL', zh: '波兰', en: 'Poland', lat: 51.9, lon: 19.1 },
  CZ: { code: 'CZ', zh: '捷克', en: 'Czechia', lat: 49.8, lon: 15.5 },
  HU: { code: 'HU', zh: '匈牙利', en: 'Hungary', lat: 47.2, lon: 19.1 },
  RO: { code: 'RO', zh: '罗马尼亚', en: 'Romania', lat: 46.0, lon: 24.2 },
  BG: { code: 'BG', zh: '保加利亚', en: 'Bulgaria', lat: 42.7, lon: 25.1 },
  GR: { code: 'GR', zh: '希腊', en: 'Greece', lat: 39.1, lon: 21.8 },
  UA: { code: 'UA', zh: '乌克兰', en: 'Ukraine', lat: 48.8, lon: 31.0 },
  BY: { code: 'BY', zh: '白俄罗斯', en: 'Belarus', lat: 53.7, lon: 27.8 },
  RU: { code: 'RU', zh: '俄罗斯', en: 'Russia', lat: 55.75, lon: 37.62 },
  AU: { code: 'AU', zh: '澳大利亚', en: 'Australia', lat: -24.8, lon: 133.1 },
  NZ: { code: 'NZ', zh: '新西兰', en: 'New Zealand', lat: -43.7, lon: 171.2 },
  ZA: { code: 'ZA', zh: '南非', en: 'South Africa', lat: -28.4, lon: 26.1 },
  EG: { code: 'EG', zh: '埃及', en: 'Egypt', lat: 26.9, lon: 29.4 },
  NG: { code: 'NG', zh: '尼日利亚', en: 'Nigeria', lat: 8.9, lon: 7.8 },
  KE: { code: 'KE', zh: '肯尼亚', en: 'Kenya', lat: 0.3, lon: 37.5 },
};

/** 中国各省/直辖市/自治区及主要城市经纬度坐标表（城市优先匹配，省会兜底） */
const CN_PROVINCE_COORDS: Array<{ match: string; lat: number; lon: number }> = [
  { match: '深圳', lat: 22.54, lon: 114.06 },
  { match: '广州', lat: 23.13, lon: 113.26 },
  { match: '东莞', lat: 23.02, lon: 113.75 },
  { match: '佛山', lat: 23.02, lon: 113.12 },
  { match: '珠海', lat: 22.27, lon: 113.58 },
  { match: '杭州', lat: 30.27, lon: 120.15 },
  { match: '宁波', lat: 29.87, lon: 121.55 },
  { match: '温州', lat: 28.0, lon: 120.7 },
  { match: '南京', lat: 32.06, lon: 118.8 },
  { match: '苏州', lat: 31.3, lon: 120.58 },
  { match: '无锡', lat: 31.49, lon: 120.31 },
  { match: '常州', lat: 31.81, lon: 119.97 },
  { match: '成都', lat: 30.57, lon: 104.06 },
  { match: '武汉', lat: 30.59, lon: 114.31 },
  { match: '西安', lat: 34.26, lon: 108.94 },
  { match: '青岛', lat: 36.07, lon: 120.38 },
  { match: '济南', lat: 36.65, lon: 117.12 },
  { match: '厦门', lat: 24.48, lon: 118.09 },
  { match: '福州', lat: 26.08, lon: 119.3 },
  { match: '泉州', lat: 24.87, lon: 118.68 },
  { match: '长沙', lat: 28.23, lon: 112.94 },
  { match: '郑州', lat: 34.75, lon: 113.62 },
  { match: '合肥', lat: 31.82, lon: 117.23 },
  { match: '南昌', lat: 28.68, lon: 115.86 },
  { match: '沈阳', lat: 41.8, lon: 123.43 },
  { match: '大连', lat: 38.91, lon: 121.61 },
  { match: '长春', lat: 43.82, lon: 125.32 },
  { match: '哈尔滨', lat: 45.8, lon: 126.53 },
  { match: '石家庄', lat: 38.04, lon: 114.51 },
  { match: '太原', lat: 37.87, lon: 112.55 },
  { match: '南宁', lat: 22.82, lon: 108.37 },
  { match: '昆明', lat: 25.04, lon: 102.71 },
  { match: '贵阳', lat: 26.65, lon: 106.63 },
  { match: '兰州', lat: 36.06, lon: 103.83 },
  { match: '乌鲁木齐', lat: 43.83, lon: 87.62 },
  { match: '呼和浩特', lat: 40.84, lon: 111.75 },
  { match: '银川', lat: 38.49, lon: 106.23 },
  { match: '西宁', lat: 36.62, lon: 101.78 },
  { match: '拉萨', lat: 29.65, lon: 91.11 },
  { match: '海口', lat: 20.04, lon: 110.2 },
  { match: '三亚', lat: 18.25, lon: 109.51 },
  { match: '北京', lat: 39.9, lon: 116.4 },
  { match: '上海', lat: 31.23, lon: 121.47 },
  { match: '天津', lat: 39.08, lon: 117.2 },
  { match: '重庆', lat: 29.56, lon: 106.55 },
  { match: '广东', lat: 23.13, lon: 113.26 },
  { match: '浙江', lat: 30.27, lon: 120.15 },
  { match: '江苏', lat: 32.06, lon: 118.8 },
  { match: '四川', lat: 30.57, lon: 104.06 },
  { match: '湖北', lat: 30.59, lon: 114.31 },
  { match: '湖南', lat: 28.23, lon: 112.94 },
  { match: '福建', lat: 26.08, lon: 119.3 },
  { match: '山东', lat: 36.65, lon: 117.12 },
  { match: '河南', lat: 34.75, lon: 113.62 },
  { match: '河北', lat: 38.04, lon: 114.51 },
  { match: '陕西', lat: 34.26, lon: 108.94 },
  { match: '安徽', lat: 31.82, lon: 117.23 },
  { match: '江西', lat: 28.68, lon: 115.86 },
  { match: '辽宁', lat: 41.8, lon: 123.43 },
  { match: '吉林', lat: 43.82, lon: 125.32 },
  { match: '黑龙江', lat: 45.8, lon: 126.53 },
  { match: '广西', lat: 22.82, lon: 108.37 },
  { match: '云南', lat: 25.04, lon: 102.71 },
  { match: '贵州', lat: 26.65, lon: 106.63 },
  { match: '山西', lat: 37.87, lon: 112.55 },
  { match: '内蒙古', lat: 40.84, lon: 111.75 },
  { match: '新疆', lat: 43.83, lon: 87.62 },
  { match: '西藏', lat: 29.65, lon: 91.11 },
  { match: '甘肃', lat: 36.06, lon: 103.83 },
  { match: '宁夏', lat: 38.49, lon: 106.23 },
  { match: '青海', lat: 36.62, lon: 101.78 },
  { match: '海南', lat: 20.04, lon: 110.2 },
  { match: '香港', lat: 22.32, lon: 114.17 },
  { match: '澳门', lat: 22.2, lon: 113.54 },
  { match: '台湾', lat: 25.03, lon: 121.56 },
];

const CN_IPV4_FIRST_OCTETS = new Set([
  1, 14, 27, 36, 39, 42, 43, 49, 58, 59, 60, 61, 101, 106, 110, 111, 112, 113, 114, 115, 116, 117,
  118, 119, 120, 121, 122, 123, 124, 125, 139, 140, 144, 150, 153, 163, 171, 175, 180, 182, 183,
  202, 203, 210, 211, 218, 219, 220, 221, 222, 223,
]);

/** 粗略判断是否为中国大陆 IP（用于决定是否允许回退到海外库）。 */
function isLikelyChinaIp(ipRaw: string): boolean {
  const ip = normalizeIp(ipRaw);
  if (!ip) return false;
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return (
      lower.startsWith('240e:') ||
      lower.startsWith('2408:') ||
      lower.startsWith('2409:') ||
      lower.startsWith('240c:') ||
      lower.startsWith('2001:da8:') ||
      lower.startsWith('2001:250:')
    );
  }
  const firstOctet = Number(ip.split('.')[0]);
  return CN_IPV4_FIRST_OCTETS.has(firstOctet);
}

/* --------------------------------------------------------------------------
   内存级 IP 归属地 LRU 缓存（最大 4000 条，0ms 命中有记录 IP）
   -------------------------------------------------------------------------- */
const MAX_GEO_CACHE = 4000;
const ipGeoCache = new Map<string, GeoProfile>();

function setGeoCache(ip: string, profile: GeoProfile): void {
  if (!ip) return;
  if (ipGeoCache.has(ip)) ipGeoCache.delete(ip);
  else if (ipGeoCache.size >= MAX_GEO_CACHE) {
    const oldest = ipGeoCache.keys().next().value;
    if (oldest !== undefined) ipGeoCache.delete(oldest);
  }
  ipGeoCache.set(ip, profile);
}

/** 解析 User-Agent，提取设备类型、操作系统、浏览器，并过滤爬虫与监控探针 */
export function parseUserAgent(uaRaw: string): {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';
  os: string;
  browser: string;
} {
  const ua = (uaRaw || '').trim();
  if (!ua) {
    return { deviceType: 'Desktop', os: 'Unknown OS', browser: 'Direct' };
  }

  if (
    /(bot|spider|crawl|slurp|mediapartners|headless|curl|wget|python-requests|go-http-client|axios|node-fetch|uptimerobot|statuscake|petalbot|bytespider|baiduspider|bingpreview|facebookexternalhit|semrush|ahrefs|mj12bot)/i.test(
      ua
    )
  ) {
    return { deviceType: 'Bot', os: 'Crawler', browser: 'Bot' };
  }

  let deviceType: 'Desktop' | 'Mobile' | 'Tablet' = 'Desktop';
  if (/(ipad|tablet|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/(mobi|iphone|ipod|android.*mobile|harmonyos.*mobile|windows phone)/i.test(ua)) {
    deviceType = 'Mobile';
  }

  let os = 'Linux';
  if (/windows nt 10\.0/i.test(ua)) os = 'Windows 11/10';
  else if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/harmonyos/i.test(ua)) os = 'HarmonyOS';
  else if (/ipad/i.test(ua)) os = 'iPadOS';
  else if (/iphone|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/cros/i.test(ua)) os = 'ChromeOS';

  let browser = 'Browser';
  if (/micromessenger/i.test(ua)) browser = 'WeChat';
  else if (/quark/i.test(ua)) browser = 'Quark';
  else if (/ucbrowser/i.test(ua)) browser = 'UC';
  else if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/firefox\/|fxios\//i.test(ua)) browser = 'Firefox';
  else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua)) browser = 'Safari';

  return { deviceType, os, browser };
}

export function inferCoordsFromText(
  text: string,
  fallbackLat = 35.0,
  fallbackLon = 104.0
): { lat: number; lon: number } {
  for (const item of CN_PROVINCE_COORDS) {
    if (text.includes(item.match)) {
      return { lat: item.lat, lon: item.lon };
    }
  }
  return { lat: fallbackLat, lon: fallbackLon };
}

/**
 * 第一层：纯内存 0ms 确定性归属地初判（严禁随机哈希映射）。
 */
export function resolveIpGeo(ipRaw: string, headers?: Headers): GeoProfile {
  const cleanIp = normalizeIp(ipRaw);

  const cached = cleanIp ? ipGeoCache.get(cleanIp) : undefined;
  if (cached) return cached;

  if (!cleanIp || isPrivateOrLoopbackIp(cleanIp)) {
    const localProfile: GeoProfile = {
      code: 'CN',
      zh: '中国',
      en: 'China',
      region: '本地网络 · 内网终端',
      lat: 35.0,
      lon: 104.0,
      enriched: true,
    };
    if (cleanIp) setGeoCache(cleanIp, localProfile);
    return localProfile;
  }

  try {
    const prev = getStmts().findIpGeo.get(cleanIp) as
      | {
          country_code: string;
          country_zh: string;
          country_en: string;
          region: string;
          lat: number;
          lon: number;
        }
      | undefined;
    if (prev && prev.region && !prev.region.endsWith('公网节点') && !prev.region.includes('本地')) {
      const dbProfile: GeoProfile = {
        code: prev.country_code,
        zh: prev.country_zh,
        en: prev.country_en,
        region: prev.region,
        lat: prev.lat,
        lon: prev.lon,
        enriched: true,
      };
      setGeoCache(cleanIp, dbProfile);
      return dbProfile;
    }
  } catch {
    /* ignore DB lookup error during early init */
  }

  const countryHeader = (
    headers?.get('cf-ipcountry') ||
    headers?.get('ali-cdn-real-ip-country') ||
    headers?.get('x-vercel-ip-country') ||
    headers?.get('x-country-code') ||
    ''
  )
    .trim()
    .toUpperCase();

  if (countryHeader && COUNTRY_BY_CODE[countryHeader]) {
    const c = COUNTRY_BY_CODE[countryHeader]!;
    const regionLabel =
      countryHeader === 'HK'
        ? '中国香港'
        : countryHeader === 'MO'
          ? '中国澳门'
          : countryHeader === 'TW'
            ? '中国台湾'
            : `${c.zh} · 公网节点`;
    const headerProfile: GeoProfile = {
      code: c.code,
      zh: c.zh,
      en: c.en,
      region: regionLabel,
      lat: c.lat,
      lon: c.lon,
      enriched: false,
    };
    setGeoCache(cleanIp, headerProfile);
    return headerProfile;
  }

  if (cleanIp.includes(':')) {
    const lower = cleanIp.toLowerCase();
    let profile: GeoProfile;
    if (lower.startsWith('240e:')) {
      profile = { code: 'CN', zh: '中国', en: 'China', region: '中国 · 电信 IPv6', lat: 35.0, lon: 104.0, enriched: false };
    } else if (lower.startsWith('2408:')) {
      profile = { code: 'CN', zh: '中国', en: 'China', region: '中国 · 联通 IPv6', lat: 35.0, lon: 104.0, enriched: false };
    } else if (lower.startsWith('2409:')) {
      profile = { code: 'CN', zh: '中国', en: 'China', region: '中国 · 移动 IPv6', lat: 35.0, lon: 104.0, enriched: false };
    } else if (lower.startsWith('240c:') || lower.startsWith('2001:da8:') || lower.startsWith('2001:250:')) {
      profile = { code: 'CN', zh: '中国', en: 'China', region: '中国 · 教育网 IPv6', lat: 39.9, lon: 116.4, enriched: false };
    } else if (lower.startsWith('26')) {
      profile = { ...COUNTRY_BY_CODE.US!, region: '美国 · IPv6 节点', enriched: false };
    } else {
      profile = { code: 'CN', zh: '中国', en: 'China', region: '中国 · IPv6 公网节点', lat: 35.0, lon: 104.0, enriched: false };
    }
    setGeoCache(cleanIp, profile);
    return profile;
  }

  const firstOctet = Number(cleanIp.split('.')[0]);
  const fallbackProfile: GeoProfile = CN_IPV4_FIRST_OCTETS.has(firstOctet)
    ? {
        code: 'CN',
        zh: '中国',
        en: 'China',
        region: '中国 · 公网节点',
        lat: 35.0,
        lon: 104.0,
        enriched: false,
      }
    : {
        code: 'CN',
        zh: '中国',
        en: 'China',
        region: '公网节点',
        lat: 35.0,
        lon: 104.0,
        enriched: false,
      };

  setGeoCache(cleanIp, fallbackProfile);
  return fallbackProfile;
}

/**
 * 将客户端遥测信标附带的归属地信息（如太平洋 IP 库 JSONP 或 ipwho.is）转换为标准 GeoProfile
 */
function buildGeoFromBeaconPayload(ip: string, payload?: ClientBeaconPayload): GeoProfile | null {
  if (!payload) return null;
  const pro = (payload.pro || '').trim();
  const city = (payload.city || '').trim();
  const addr = (payload.addr || '').trim();
  if (pro || city) {
    const loc = pro && city && pro !== city ? `${pro}${city}` : pro || city;
    const ispRaw = addr.replace(pro, '').replace(city, '').trim();
    const region = [loc, ispRaw].filter(Boolean).join(' · ').slice(0, 64) || '中国';
    const coords = inferCoordsFromText(`${pro}${city}${addr}`, 35.0, 104.0);
    const profile: GeoProfile = {
      code: 'CN',
      zh: '中国',
      en: 'China',
      region,
      lat: coords.lat,
      lon: coords.lon,
      enriched: true,
    };
    setGeoCache(ip, profile);
    return profile;
  }

  const cc = (payload.countryCode || '').trim().toUpperCase();
  if (cc) {
    const known = COUNTRY_BY_CODE[cc];
    const code = known ? known.code : cc;
    const zh = known ? known.zh : (payload.countryZh || payload.countryEn || cc).trim();
    const en = known ? known.en : (payload.countryEn || zh).trim();
    const reg = (payload.region || '').trim();
    const isp = (payload.isp || '').trim();
    const region = [reg || zh, isp].filter(Boolean).join(' · ').slice(0, 64) || zh;
    const baseCoords = inferCoordsFromText(region, known?.lat ?? 35.0, known?.lon ?? 104.0);
    const lat =
      typeof payload.lat === 'number' && Number.isFinite(payload.lat)
        ? Number(payload.lat.toFixed(2))
        : baseCoords.lat;
    const lon =
      typeof payload.lon === 'number' && Number.isFinite(payload.lon)
        ? Number(payload.lon.toFixed(2))
        : baseCoords.lon;
    const profile: GeoProfile = {
      code,
      zh,
      en,
      region,
      lat,
      lon,
      enriched: true,
    };
    setGeoCache(ip, profile);
    return profile;
  }

  return null;
}

/* --------------------------------------------------------------------------
   第二层：服务端异步非阻塞精准 IP 归属地查询（国内优先太平洋 IP 库，海外回退 ip-api）
   -------------------------------------------------------------------------- */
const pendingGeoIps = new Set<string>();
const failedGeoIps = new Map<string, number>();
let geoWorkerRunning = false;

export async function fetchAccurateIpGeo(ip: string): Promise<GeoProfile | null> {
  // 方案 A：优先调用国内极速太平洋 IP 库（国内服务器响应约 20~40ms，精准到省、市、三大运营商）
  try {
    const res = await fetch(
      `https://whois.pconline.com.cn/ipJson.jsp?ip=${encodeURIComponent(ip)}&json=true`,
      // 生产环境到太平洋的 RTT 可能达到 ~3s；后台异步补全可以接受更长等待，避免误判超时
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buf);
      const data = JSON.parse(text) as {
        pro?: string;
        city?: string;
        addr?: string;
      };
      const pro = (data.pro || '').trim();
      const city = (data.city || '').trim();
      const addr = (data.addr || '').trim();
      // 若 pro 非空，说明明确属于中国省/直辖市/特区
      if (pro) {
        const loc = pro && city && pro !== city ? `${pro}${city}` : pro || city;
        const ispPart = addr.replace(pro, '').replace(city, '').trim();
        const region = [loc, ispPart].filter(Boolean).join(' · ').slice(0, 64) || '中国';
        const coords = inferCoordsFromText(`${pro}${city}${addr}`, 35.0, 104.0);
        return {
          code: 'CN',
          zh: '中国',
          en: 'China',
          region,
          lat: coords.lat,
          lon: coords.lon,
          enriched: true,
        };
      }
    }
  } catch {
    /* fallback to global provider */
  }

  // 中国 IP 不允许回退到 ip-api：该库对国内移动 IP 的省级数据经常错误（如贵州 IP 返回广东）。
  // 失败时返回 null，由 enqueueGeoEnrichment 稍后重试太平洋库，避免把错误省份写入统计。
  if (isLikelyChinaIp(ip)) return null;

  // 方案 B：海外或 IPv6 节点调用 ip-api.com (UTF-8 JSON，自带全球国家代码、城市、ISP 与经纬度)
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,lat,lon&lang=zh-CN`,
      { signal: AbortSignal.timeout(2200) }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string;
        country?: string;
        countryCode?: string;
        regionName?: string;
        city?: string;
        isp?: string;
        org?: string;
        lat?: number;
        lon?: number;
      };
      if (data.status === 'success' && data.countryCode) {
        const cc = data.countryCode.toUpperCase();
        const known = COUNTRY_BY_CODE[cc];
        const code = known ? known.code : cc;
        const zh = known ? known.zh : data.country || cc;
        const en = known ? known.en : data.country || cc;

        const rName = (data.regionName || '').trim();
        const cName = (data.city || '').trim();
        const locPart =
          rName && cName && rName !== cName
            ? `${rName}${cName}`
            : rName || cName || (cc === 'HK' ? '中国香港' : cc === 'MO' ? '中国澳门' : cc === 'TW' ? '中国台湾' : zh);

        const rawIsp = (data.isp || data.org || '').trim();
        let ispShort = '';
        if (/chinanet|telecom|电信/i.test(rawIsp)) ispShort = '电信';
        else if (/unicom|联通/i.test(rawIsp)) ispShort = '联通';
        else if (/mobile|cmnet|移动/i.test(rawIsp)) ispShort = '移动';
        else if (/cernet|education|教育网/i.test(rawIsp)) ispShort = '教育网';
        else if (/alibaba|aliyun|阿里云/i.test(rawIsp)) ispShort = '阿里云';
        else if (/tencent|腾讯云/i.test(rawIsp)) ispShort = '腾讯云';
        else if (/huawei|华为云/i.test(rawIsp)) ispShort = '华为云';
        else if (/cloudflare/i.test(rawIsp)) ispShort = 'Cloudflare';
        else if (rawIsp && rawIsp.length <= 24) ispShort = rawIsp;

        const region = [locPart, ispShort].filter(Boolean).join(' · ').slice(0, 64) || zh;
        const lat =
          typeof data.lat === 'number' && Number.isFinite(data.lat)
            ? Number(data.lat.toFixed(2))
            : (known?.lat ?? 35.0);
        const lon =
          typeof data.lon === 'number' && Number.isFinite(data.lon)
            ? Number(data.lon.toFixed(2))
            : (known?.lon ?? 104.0);

        return { code, zh, en, region, lat, lon, enriched: true };
      }
    }
  } catch {
    /* ignore timeout */
  }

  return null;
}

function enqueueGeoEnrichment(ip: string): void {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp || isPrivateOrLoopbackIp(cleanIp)) return;
  const cached = ipGeoCache.get(cleanIp);
  if (cached?.enriched) return;

  const lastFail = failedGeoIps.get(cleanIp);
  if (lastFail && Date.now() - lastFail < 30 * 60 * 1000) return;

  pendingGeoIps.add(cleanIp);
  if (geoWorkerRunning) return;
  geoWorkerRunning = true;

  setImmediate(async () => {
    try {
      while (pendingGeoIps.size > 0) {
        const nextIp = pendingGeoIps.values().next().value;
        if (!nextIp) break;
        pendingGeoIps.delete(nextIp);

        const enriched = await fetchAccurateIpGeo(nextIp);
        if (enriched) {
          setGeoCache(nextIp, enriched);
          try {
            getStmts().updateIpGeo.run(
              enriched.code,
              enriched.zh,
              enriched.en,
              enriched.region,
              enriched.lat,
              enriched.lon,
              nextIp
            );
          } catch (err) {
            console.error('[analytics] updateIpGeo failed:', err);
          }
        } else {
          failedGeoIps.set(nextIp, Date.now());
        }
      }
    } finally {
      geoWorkerRunning = false;
    }
  });
}

/* --------------------------------------------------------------------------
   SQLite 预编译语句缓存与零阻塞内存写缓冲队列
   -------------------------------------------------------------------------- */
interface PreparedStatements {
  db: Database.Database;
  findVisit: Database.Statement;
  updateVisit: Database.Statement;
  insertVisit: Database.Statement;
  findIpGeo: Database.Statement;
  updateIpGeo: Database.Statement;
  todaySummary: Database.Statement;
}

let cachedStmts: PreparedStatements | null = null;

function getStmts(): PreparedStatements {
  const db = getDb();
  if (cachedStmts && cachedStmts.db === db) return cachedStmts;

  cachedStmts = {
    db,
    findVisit: db.prepare(
      `SELECT id, pv_count, last_seen, path FROM visitor_logs
        WHERE visit_date = ? AND ip = ? AND device_type = ? AND os = ? AND browser = ?
        LIMIT 1`
    ),
    updateVisit: db.prepare(
      `UPDATE visitor_logs
          SET pv_count = pv_count + ?,
              path = ?,
              last_seen = ?
        WHERE id = ?`
    ),
    insertVisit: db.prepare(
      `INSERT INTO visitor_logs (
        visit_date, ip, country_code, country_zh, country_en, region,
        lat, lon, device_type, os, browser, user_agent, path, referrer,
        pv_count, first_seen, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    findIpGeo: db.prepare(
      `SELECT country_code, country_zh, country_en, region, lat, lon
         FROM visitor_logs
        WHERE ip = ?
        ORDER BY id DESC
        LIMIT 1`
    ),
    updateIpGeo: db.prepare(
      `UPDATE visitor_logs
          SET country_code = ?,
              country_zh = ?,
              country_en = ?,
              region = ?,
              lat = ?,
              lon = ?
        WHERE ip = ?`
    ),
    todaySummary: db.prepare(
      `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(pv_count), 0) AS pv
         FROM visitor_logs WHERE visit_date = ?`
    ),
  };

  return cachedStmts;
}

interface PendingVisitItem {
  visitDate: string;
  ip: string;
  deviceType: string;
  os: string;
  browser: string;
  userAgent: string;
  path: string;
  referrer: string;
  pvCount: number;
  firstSeen: string;
  lastSeen: string;
  countryHeader: string;
}

const pendingVisits = new Map<string, PendingVisitItem>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 1200;

/** 立即将内存中的待写入访客记录批量事务写入 SQLite */
export function flushPendingVisits(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingVisits.size === 0) return;

  const batch = Array.from(pendingVisits.values());
  pendingVisits.clear();

  try {
    const stmts = getStmts();
    const newIpsToEnrich: string[] = [];

    stmts.db.transaction(() => {
      for (const item of batch) {
        const existing = stmts.findVisit.get(
          item.visitDate,
          item.ip,
          item.deviceType,
          item.os,
          item.browser
        ) as { id: number; pv_count: number; last_seen: string; path: string } | undefined;

        if (existing) {
          stmts.updateVisit.run(item.pvCount, item.path, item.lastSeen, existing.id);
        } else {
          const fakeHeaders = item.countryHeader
            ? new Headers({ 'x-country-code': item.countryHeader })
            : undefined;
          const geo = resolveIpGeo(item.ip, fakeHeaders);
          stmts.insertVisit.run(
            item.visitDate,
            item.ip,
            geo.code,
            geo.zh,
            geo.en,
            geo.region,
            geo.lat,
            geo.lon,
            item.deviceType,
            item.os,
            item.browser,
            item.userAgent,
            item.path,
            item.referrer,
            item.pvCount,
            item.firstSeen,
            item.lastSeen
          );
          if (!geo.enriched) {
            newIpsToEnrich.push(item.ip);
          }
        }
      }
    })();

    for (const ip of newIpsToEnrich) {
      enqueueGeoEnrichment(ip);
    }
  } catch (err) {
    console.error('[analytics] flushPendingVisits failed:', err);
  }
}

function scheduleVisitFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPendingVisits();
  }, FLUSH_DELAY_MS);
  flushTimer.unref?.();
}

const globalForHooks = globalThis as unknown as { __analyticsExitHooked?: boolean };
if (!globalForHooks.__analyticsExitHooked) {
  globalForHooks.__analyticsExitHooked = true;
  process.once('beforeExit', () => flushPendingVisits());
}

/** 获取本地 YYYY-MM-DD 日期字符串 */
export function formatDateYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTimeSql(date = new Date()): string {
  const ymd = formatDateYmd(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${ymd} ${hh}:${mm}:${ss}`;
}

const STATIC_EXT_RE =
  /\.(?:xml|js|mjs|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|flac|aac|opus|webm|json|txt|map|webmanifest)$/i;

/**
 * 在 middleware 响应生成后调用：
 * 若服务端连接层仅拿到 127.0.0.1 / 内网 IP（如反代未透传或走本地隧道），则跳过本地 IP 写入，
 * 交由浏览器端加载完成后的 `/api/analytics/collect` 真实公网 IP 信标写入，杜绝 `127.0.0.1` 污染。
 */
export function recordVisit(context: APIContext): void {
  try {
    const { pathname } = context.url;
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/studio') ||
      pathname.startsWith('/_astro/') ||
      pathname.startsWith('/uploads/') ||
      pathname.startsWith('/artifact/') ||
      pathname === '/favicon.ico' ||
      pathname === '/favicon.svg' ||
      pathname === '/robots.txt' ||
      STATIC_EXT_RE.test(pathname)
    ) {
      return;
    }

    const headers = context.request.headers;
    const purpose = (
      headers.get('sec-purpose') ||
      headers.get('purpose') ||
      headers.get('x-moz') ||
      ''
    ).toLowerCase();
    if (purpose.includes('prefetch') || purpose.includes('preview')) {
      return;
    }

    const ua = headers.get('user-agent') ?? '';
    const parsedUa = parseUserAgent(ua);
    if (parsedUa.deviceType === 'Bot') return;

    const ip = getClientIp(context);
    // 关键防护：如果服务端连接只能看到 127.0.0.1 或局域网私网 IP，绝不把本地 IP 写入统计表，
    // 由前端页面内嵌的真实公网 IP 遥测信标（/api/analytics/collect）上报真实公网 IP。
    if (isPrivateOrLoopbackIp(ip)) {
      return;
    }

    const today = formatDateYmd();
    const nowSql = formatDateTimeSql();
    const cleanPath = (pathname || '/').slice(0, 160);
    const referrer = (headers.get('referer') ?? '').slice(0, 240);
    const countryHeader = (
      headers.get('cf-ipcountry') ||
      headers.get('ali-cdn-real-ip-country') ||
      headers.get('x-vercel-ip-country') ||
      headers.get('x-country-code') ||
      ''
    ).trim();

    const key = `${today}|${ip}|${parsedUa.deviceType}|${parsedUa.os}|${parsedUa.browser}`;
    const existing = pendingVisits.get(key);
    if (existing) {
      existing.pvCount += 1;
      existing.path = cleanPath;
      existing.lastSeen = nowSql;
    } else {
      pendingVisits.set(key, {
        visitDate: today,
        ip,
        deviceType: parsedUa.deviceType,
        os: parsedUa.os,
        browser: parsedUa.browser,
        userAgent: ua.slice(0, 300),
        path: cleanPath,
        referrer,
        pvCount: 1,
        firstSeen: nowSql,
        lastSeen: nowSql,
        countryHeader,
      });
    }

    scheduleVisitFlush();
  } catch (err) {
    console.error('[analytics] recordVisit failed:', err);
  }
}

/**
 * 接收前端浏览器上报的真实公网 IP 与归属地信标（`POST /api/analytics/collect`）：
 * 当服务器 Nginx / 隧道未透传客户端 IP 导致服务端只看到 127.0.0.1 时，
 * 浏览器端直接通过国内 BGP / WebRTC STUN / JSONP 测得访客电脑或手机流量的真实公网 IP 并上报此处落库。
 */
export async function recordVisitBeacon(
  context: APIContext,
  payload: ClientBeaconPayload | null
): Promise<{ ok: boolean; ip: string }> {
  try {
    const headers = context.request.headers;
    const ua = headers.get('user-agent') ?? '';
    const parsedUa = parseUserAgent(ua);
    if (parsedUa.deviceType === 'Bot') {
      return { ok: true, ip: '' };
    }

    const browserIp = normalizeIp(payload?.ip);
    const serverIp = getClientIp(context);

    // 优先采用客户端浏览器实测到的真实公网 IP；若无则采用服务端识别的公网 IP
    const effectiveIp =
      browserIp && !isPrivateOrLoopbackIp(browserIp)
        ? browserIp
        : serverIp && !isPrivateOrLoopbackIp(serverIp)
          ? serverIp
          : '';

    if (!effectiveIp) {
      return { ok: false, ip: '' };
    }

    const rawPath = String(payload?.path || '/').trim();
    const cleanPath = (rawPath.startsWith('/') ? rawPath : `/${rawPath}`).slice(0, 160);
    if (cleanPath.startsWith('/studio') || cleanPath.startsWith('/api/')) {
      return { ok: true, ip: effectiveIp };
    }

    const today = formatDateYmd();
    const nowSql = formatDateTimeSql();
    const referrer = String(payload?.referrer || headers.get('referer') || '').slice(0, 240);

    // 若前端已附带太平洋 IP 库或 ipwho.is 的省市/运营商数据，直接构建并缓存；否则在后台异步/即时查询
    let geo = buildGeoFromBeaconPayload(effectiveIp, payload ?? undefined);
    if (!geo) {
      const cached = ipGeoCache.get(effectiveIp);
      if (cached?.enriched) {
        geo = cached;
      } else {
        geo = (await fetchAccurateIpGeo(effectiveIp)) ?? resolveIpGeo(effectiveIp, headers);
        if (geo.enriched) setGeoCache(effectiveIp, geo);
      }
    }

    // 检查是否刚刚被 middleware 的 pendingVisits 队列记录过同一次加载（避免同一次打开页面重复 +1）
    const pendingKey = `${today}|${effectiveIp}|${parsedUa.deviceType}|${parsedUa.os}|${parsedUa.browser}`;
    if (pendingVisits.has(pendingKey)) {
      pendingVisits.delete(pendingKey);
    }

    const stmts = getStmts();
    const existing = stmts.findVisit.get(
      today,
      effectiveIp,
      parsedUa.deviceType,
      parsedUa.os,
      parsedUa.browser
    ) as { id: number; pv_count: number; last_seen: string; path: string } | undefined;

    if (existing) {
      // 如果同一秒内 middleware 已经写过完全相同的路径，只补全归属地不重复累加 PV
      const isDuplicateWithin2Sec =
        existing.path === cleanPath &&
        Math.abs(new Date(nowSql).getTime() - new Date(existing.last_seen).getTime()) <= 2000;
      if (!isDuplicateWithin2Sec) {
        stmts.updateVisit.run(1, cleanPath, nowSql, existing.id);
      }
      if (geo.enriched) {
        stmts.updateIpGeo.run(geo.code, geo.zh, geo.en, geo.region, geo.lat, geo.lon, effectiveIp);
      }
    } else {
      stmts.insertVisit.run(
        today,
        effectiveIp,
        geo.code,
        geo.zh,
        geo.en,
        geo.region,
        geo.lat,
        geo.lon,
        parsedUa.deviceType,
        parsedUa.os,
        parsedUa.browser,
        ua.slice(0, 300),
        cleanPath,
        referrer,
        1,
        nowSql,
        nowSql
      );
      if (!geo.enriched) {
        enqueueGeoEnrichment(effectiveIp);
      }
    }

    return { ok: true, ip: effectiveIp };
  } catch (err) {
    console.error('[analytics] recordVisitBeacon failed:', err);
    return { ok: false, ip: '' };
  }
}

export function clearAnalyticsLogs(): void {
  pendingVisits.clear();
  getDb().prepare('DELETE FROM visitor_logs').run();
}

/** 极速获取今日 UV 与 PV（供后台顶栏导航角标使用） */
export function getTodayUvSummary(): { todayUv: number; todayPv: number } {
  flushPendingVisits();
  const today = formatDateYmd();
  const row = getStmts().todaySummary.get(today) as { uv: number; pv: number } | undefined;
  return {
    todayUv: row?.uv ?? 0,
    todayPv: row?.pv ?? 0,
  };
}

/** 计算给定日期所属自然周的起始日（周一 YYYY-MM-DD） */
function getWeekBucketExpr(col = 'visit_date'): string {
  return `date(${col}, '-' || ((CAST(strftime('%w', ${col}) AS INTEGER) + 6) % 7) || ' days')`;
}

function getBucketSqlExpr(granularity: StatsGranularity, col = 'visit_date'): string {
  if (granularity === 'week') return getWeekBucketExpr(col);
  if (granularity === 'month') return `substr(${col}, 1, 7)`;
  if (granularity === 'year') return `substr(${col}, 1, 4)`;
  return col;
}

function formatBucketLabel(granularity: StatsGranularity, bucket: string): string {
  if (granularity === 'day') return bucket.slice(5); // MM-DD
  if (granularity === 'week') return `${bucket.slice(5)} 周`;
  if (granularity === 'month') return bucket; // YYYY-MM
  return `${bucket} 年`;
}

export interface AnalyticsQueryOptions {
  granularity?: StatsGranularity;
  bucket?: string | null;
  country?: string | null;
  device?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
}

export function getAnalyticsDashboard(opts: AnalyticsQueryOptions = {}): AnalyticsDashboardData {
  flushPendingVisits();
  const db = getDb();
  const granularity: StatsGranularity =
    opts.granularity === 'week' || opts.granularity === 'month' || opts.granularity === 'year'
      ? opts.granularity
      : 'day';
  const selectedBucket = opts.bucket?.trim() || null;
  const selectedCountry = opts.country?.trim() || null;
  const selectedDevice = opts.device?.trim() || null;
  const searchQ = opts.q?.trim() || '';
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(opts.pageSize) || 20));

  const today = formatDateYmd();
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);

  // 1. 顶部核心指标汇总
  const todayRow = getStmts().todaySummary.get(today) as { uv: number; pv: number };

  const weekStartRow = db
    .prepare(`SELECT ${getWeekBucketExpr('?')} AS ws`)
    .get(today, today) as { ws: string };
  const weekRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(pv_count), 0) AS pv
         FROM visitor_logs WHERE visit_date >= ?`
    )
    .get(weekStartRow.ws) as { uv: number; pv: number };

  const monthRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(pv_count), 0) AS pv
         FROM visitor_logs WHERE substr(visit_date, 1, 7) = ?`
    )
    .get(thisMonth) as { uv: number; pv: number };

  const yearRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(pv_count), 0) AS pv
         FROM visitor_logs WHERE substr(visit_date, 1, 4) = ?`
    )
    .get(thisYear) as { uv: number; pv: number };

  const totalRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv,
              COALESCE(SUM(pv_count), 0) AS pv,
              COUNT(DISTINCT country_zh) AS countries
         FROM visitor_logs`
    )
    .get() as { uv: number; pv: number; countries: number };

  // 2. 按日 / 按周 / 按月 / 按年 时间序列聚合
  const bucketExpr = getBucketSqlExpr(granularity);
  const limitBuckets =
    granularity === 'day' ? 30 : granularity === 'week' ? 16 : granularity === 'month' ? 15 : 8;

  const rawSeries = db
    .prepare(
      `SELECT ${bucketExpr} AS bucket,
              COUNT(DISTINCT ip) AS uv,
              COALESCE(SUM(pv_count), 0) AS pv,
              SUM(CASE WHEN device_type = 'Desktop' THEN 1 ELSE 0 END) AS desktop,
              SUM(CASE WHEN device_type = 'Mobile' THEN 1 ELSE 0 END) AS mobile,
              SUM(CASE WHEN device_type = 'Tablet' THEN 1 ELSE 0 END) AS tablet,
              MAX(country_zh) AS top_country,
              MAX(ip) AS top_ip,
              MAX(os || ' · ' || browser) AS top_device
         FROM visitor_logs
        WHERE (? IS NULL OR country_zh = ?)
          AND (? IS NULL OR device_type = ?)
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT ?`
    )
    .all(selectedCountry, selectedCountry, selectedDevice, selectedDevice, limitBuckets) as Array<{
    bucket: string;
    uv: number;
    pv: number;
    desktop: number;
    mobile: number;
    tablet: number;
    top_country: string;
    top_ip: string;
    top_device: string;
  }>;

  const series: TimeSeriesBucket[] = rawSeries.reverse().map((r) => ({
    bucket: r.bucket,
    label: formatBucketLabel(granularity, r.bucket),
    uv: r.uv,
    pv: r.pv,
    desktop: r.desktop,
    mobile: r.mobile,
    tablet: r.tablet,
    topCountry: r.top_country || '中国',
    topIp: r.top_ip || '—',
    topDevice: r.top_device || '—',
  }));

  // 3. 全球国家与地区聚合（供 3D 粒子地球仪渲染热点与点击展示）
  const rawCountries = db
    .prepare(
      `SELECT country_zh,
              MAX(country_en) AS country_en,
              MAX(country_code) AS country_code,
              AVG(lat) AS lat,
              AVG(lon) AS lon,
              COUNT(DISTINCT ip) AS uv,
              COALESCE(SUM(pv_count), 0) AS pv,
              MAX(ip) AS latest_ip,
              MAX(device_type || ' · ' || os || ' / ' || browser) AS latest_device,
              MAX(last_seen) AS last_seen
         FROM visitor_logs
        WHERE (? IS NULL OR ${bucketExpr} = ?)
        GROUP BY country_zh
        ORDER BY uv DESC, pv DESC`
    )
    .all(selectedBucket, selectedBucket) as Array<{
    country_zh: string;
    country_en: string;
    country_code: string;
    lat: number;
    lon: number;
    uv: number;
    pv: number;
    latest_ip: string;
    latest_device: string;
    last_seen: string;
  }>;

  const totalCountryPv = Math.max(
    1,
    rawCountries.reduce((acc, item) => acc + item.pv, 0)
  );
  const countries: CountryStatItem[] = rawCountries.map((c) => ({
    countryZh: c.country_zh,
    countryEn: c.country_en,
    countryCode: c.country_code,
    lat: Number(c.lat.toFixed(2)),
    lon: Number(c.lon.toFixed(2)),
    uv: c.uv,
    pv: c.pv,
    share: Number(((c.pv / totalCountryPv) * 100).toFixed(1)),
    latestIp: c.latest_ip,
    latestDevice: c.latest_device,
    lastSeen: c.last_seen,
  }));

  // 4. 设备类型 / 操作系统 / 浏览器分布
  const queryDimension = (col: 'device_type' | 'os' | 'browser'): DeviceBreakdownItem[] => {
    const rows = db
      .prepare(
        `SELECT ${col} AS name,
                COUNT(DISTINCT ip) AS uv,
                COALESCE(SUM(pv_count), 0) AS pv
           FROM visitor_logs
          WHERE (? IS NULL OR ${bucketExpr} = ?)
            AND (? IS NULL OR country_zh = ?)
          GROUP BY ${col}
          ORDER BY pv DESC`
      )
      .all(selectedBucket, selectedBucket, selectedCountry, selectedCountry) as Array<{
      name: string;
      uv: number;
      pv: number;
    }>;
    const sumPv = Math.max(
      1,
      rows.reduce((acc, r) => acc + r.pv, 0)
    );
    return rows.map((r) => ({
      name: r.name || 'Unknown',
      uv: r.uv,
      pv: r.pv,
      share: Number(((r.pv / sumPv) * 100).toFixed(1)),
    }));
  };

  const deviceTypes = queryDimension('device_type');
  const osList = queryDimension('os');
  const browserList = queryDimension('browser');

  const desktopItem = deviceTypes.find((d) => d.name === 'Desktop');
  const mobileItem = deviceTypes.find((d) => d.name === 'Mobile' || d.name === 'Tablet');

  // 5. 访客 IP 与设备日志明细
  const whereClauses: string[] = ['1=1'];
  const params: Array<string | number> = [];

  if (selectedBucket) {
    whereClauses.push(`${bucketExpr} = ?`);
    params.push(selectedBucket);
  }
  if (selectedCountry) {
    whereClauses.push(`country_zh = ?`);
    params.push(selectedCountry);
  }
  if (selectedDevice) {
    whereClauses.push(`device_type = ?`);
    params.push(selectedDevice);
  }
  if (searchQ) {
    whereClauses.push(
      `(ip LIKE ? OR country_zh LIKE ? OR region LIKE ? OR os LIKE ? OR browser LIKE ? OR path LIKE ?)`
    );
    const like = `%${searchQ}%`;
    params.push(like, like, like, like, like, like);
  }

  const whereSql = whereClauses.join(' AND ');
  const totalLogsRow = db
    .prepare(`SELECT COUNT(*) AS n FROM visitor_logs WHERE ${whereSql}`)
    .get(...params) as { n: number };

  const offset = (page - 1) * pageSize;
  const logRows = db
    .prepare(
      `SELECT id, visit_date, ip, country_code, country_zh, country_en, region,
              lat, lon, device_type, os, browser, user_agent, path, referrer,
              pv_count, first_seen, last_seen
         FROM visitor_logs
        WHERE ${whereSql}
        ORDER BY visit_date DESC, last_seen DESC, id DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as Array<{
    id: number;
    visit_date: string;
    ip: string;
    country_code: string;
    country_zh: string;
    country_en: string;
    region: string;
    lat: number;
    lon: number;
    device_type: string;
    os: string;
    browser: string;
    user_agent: string;
    path: string;
    referrer: string;
    pv_count: number;
    first_seen: string;
    last_seen: string;
  }>;

  const logs: VisitorLogItem[] = logRows.map((r) => ({
    id: r.id,
    visitDate: r.visit_date,
    ip: r.ip,
    countryCode: r.country_code,
    countryZh: r.country_zh,
    countryEn: r.country_en,
    region: r.region,
    lat: r.lat,
    lon: r.lon,
    deviceType: r.device_type,
    os: r.os,
    browser: r.browser,
    userAgent: r.user_agent,
    path: r.path,
    referrer: r.referrer,
    pvCount: r.pv_count,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));

  return {
    granularity,
    selectedBucket,
    selectedCountry,
    selectedDevice,
    summary: {
      todayUv: todayRow.uv,
      todayPv: todayRow.pv,
      weekUv: weekRow.uv,
      weekPv: weekRow.pv,
      monthUv: monthRow.uv,
      monthPv: monthRow.pv,
      yearUv: yearRow.uv,
      yearPv: yearRow.pv,
      totalUv: totalRow.uv,
      totalPv: totalRow.pv,
      activeCountries: totalRow.countries,
      desktopShare: desktopItem?.share ?? 0,
      mobileShare: mobileItem?.share ?? 0,
    },
    series,
    countries,
    devices: {
      types: deviceTypes,
      os: osList,
      browsers: browserList,
    },
    logs: {
      items: logs,
      total: totalLogsRow.n,
      page,
      pageSize,
    },
  };
}

/**
 * 返回全部真实访客记录（供统计页聚合引擎与 CSV 导出使用）。
 */
export function listVisitorLogs(limit = 5000): VisitorLogItem[] {
  flushPendingVisits();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, visit_date, ip, country_code, country_zh, country_en, region,
              lat, lon, device_type, os, browser, user_agent, path, referrer,
              pv_count, first_seen, last_seen
         FROM visitor_logs
        ORDER BY visit_date DESC, last_seen DESC, id DESC
        LIMIT ?`
    )
    .all(Math.min(5000, Math.max(1, Math.floor(limit)))) as Array<{
    id: number;
    visit_date: string;
    ip: string;
    country_code: string;
    country_zh: string;
    country_en: string;
    region: string;
    lat: number;
    lon: number;
    device_type: string;
    os: string;
    browser: string;
    user_agent: string;
    path: string;
    referrer: string;
    pv_count: number;
    first_seen: string;
    last_seen: string;
  }>;

  for (const r of rows) {
    if (r.region.endsWith('公网节点') && !isPrivateOrLoopbackIp(r.ip)) {
      enqueueGeoEnrichment(r.ip);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    visitDate: r.visit_date,
    ip: r.ip,
    countryCode: r.country_code,
    countryZh: r.country_zh,
    countryEn: r.country_en,
    region: r.region,
    lat: r.lat,
    lon: r.lon,
    deviceType: r.device_type,
    os: r.os,
    browser: r.browser,
    userAgent: r.user_agent,
    path: r.path,
    referrer: r.referrer,
    pvCount: r.pv_count,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
}
