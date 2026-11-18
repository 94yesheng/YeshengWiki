/**
 * 访客统计数据层（`visitor_logs` 表）：
 *   1. 支持「前端轻量化 JS 挑战信标（`/api/analytics/collect`）+ 服务端请求头链」双层防刷采集，
 *      结合离线 `ip2region.xdb` 内存查询、云厂商 CIDR 黑名单与 ISP 机房词典，入库前同步拦截机房与伪装爬虫；
 *   2. 采用「内存写缓冲合并 + 预编译事务落盘 + 0.01ms 离线/多源中国 34 省级行政区定位 + 省市级精准坐标匹配」，
 *      对前台页面加载速度零阻塞（0ms TTFB 开销）；
 *   3. 修复 OpenHarmony（纯血鸿蒙）、iOS 第三方 App 内置 WebView 误判为 Bot 的问题，
 *      支持结合前端 `maxTouchPoints` 与 `Client Hints` 精准区分 iPadOS 13+ 与 macOS、Windows 11 与 Windows 10，
 *      并按 `(visit_date, ip, device_type, os, browser)` 复合维度独立记录同 Wi-Fi 出口下的不同终端设备。
 */
import type { APIContext } from 'astro';
import type Database from 'better-sqlite3';
import { getClientIp, isPrivateOrLoopbackIp, normalizeIp } from '../auth';
import { matchBotIpRule } from '../bot-ip-rules';
import { getDb } from '../db';
import {
  extractChinaProvince,
  isDatacenterIspText,
  normalizeIspShort,
  searchIp2RegionMemory,
} from '../ip2region';

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
  visitCount: number;
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
  isDatacenter?: boolean;
}

export interface ClientHintsInput {
  maxTouchPoints?: number;
  platform?: string;
  platformVersion?: string;
  screenW?: number;
  screenH?: number;
  webdriver?: boolean;
}

export interface ClientBeaconPayload extends ClientHintsInput {
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
  tz?: string;
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
  { match: '香港', lat: 22.32, lon: 114.17 },
  { match: '澳门', lat: 22.20, lon: 113.55 },
  { match: '台北', lat: 25.03, lon: 121.56 },
  { match: '新北', lat: 25.01, lon: 121.46 },
  { match: '桃园', lat: 24.99, lon: 121.30 },
  { match: '台中', lat: 24.15, lon: 120.67 },
  { match: '台南', lat: 22.99, lon: 120.21 },
  { match: '高雄', lat: 22.63, lon: 120.30 },
  { match: '新竹', lat: 24.80, lon: 120.97 },
  { match: '基隆', lat: 25.13, lon: 121.74 },
  { match: '嘉义', lat: 23.48, lon: 120.45 },
  { match: '花莲', lat: 23.99, lon: 121.60 },
  // 广东省
  { match: '深圳', lat: 22.54, lon: 114.06 },
  { match: '广州', lat: 23.13, lon: 113.26 },
  { match: '东莞', lat: 23.02, lon: 113.75 },
  { match: '佛山', lat: 23.02, lon: 113.12 },
  { match: '珠海', lat: 22.27, lon: 113.58 },
  { match: '中山', lat: 22.52, lon: 113.39 },
  { match: '惠州', lat: 23.11, lon: 114.42 },
  { match: '江门', lat: 22.58, lon: 113.08 },
  { match: '汕头', lat: 23.35, lon: 116.68 },
  { match: '湛江', lat: 21.27, lon: 110.36 },
  { match: '肇庆', lat: 23.05, lon: 112.47 },
  { match: '茂名', lat: 21.66, lon: 110.92 },
  { match: '揭阳', lat: 23.55, lon: 116.37 },
  { match: '潮州', lat: 23.66, lon: 116.62 },
  { match: '清远', lat: 23.68, lon: 113.06 },
  { match: '韶关', lat: 24.81, lon: 113.60 },
  { match: '梅州', lat: 24.29, lon: 116.12 },
  { match: '汕尾', lat: 22.79, lon: 115.37 },
  { match: '河源', lat: 23.74, lon: 114.70 },
  { match: '阳江', lat: 21.86, lon: 111.98 },
  { match: '云浮', lat: 22.92, lon: 112.04 },
  // 浙江省
  { match: '杭州', lat: 30.27, lon: 120.15 },
  { match: '宁波', lat: 29.87, lon: 121.55 },
  { match: '温州', lat: 28.00, lon: 120.70 },
  { match: '嘉兴', lat: 30.75, lon: 120.76 },
  { match: '湖州', lat: 30.89, lon: 120.09 },
  { match: '绍兴', lat: 30.00, lon: 120.58 },
  { match: '金华', lat: 29.08, lon: 119.65 },
  { match: '义乌', lat: 29.31, lon: 120.07 },
  { match: '衢州', lat: 28.97, lon: 118.86 },
  { match: '舟山', lat: 29.99, lon: 122.21 },
  { match: '台州', lat: 28.66, lon: 121.42 },
  { match: '丽水', lat: 28.47, lon: 119.92 },
  // 江苏省
  { match: '南京', lat: 32.06, lon: 118.80 },
  { match: '苏州', lat: 31.30, lon: 120.58 },
  { match: '昆山', lat: 31.38, lon: 120.98 },
  { match: '无锡', lat: 31.49, lon: 120.31 },
  { match: '常州', lat: 31.81, lon: 119.97 },
  { match: '徐州', lat: 34.20, lon: 117.28 },
  { match: '南通', lat: 31.98, lon: 120.89 },
  { match: '连云港', lat: 34.60, lon: 119.22 },
  { match: '淮安', lat: 33.61, lon: 119.02 },
  { match: '盐城', lat: 33.35, lon: 120.16 },
  { match: '扬州', lat: 32.39, lon: 119.41 },
  { match: '镇江', lat: 32.19, lon: 119.43 },
  { match: '泰州', lat: 32.46, lon: 119.92 },
  { match: '宿迁', lat: 33.96, lon: 118.28 },
  // 四川省
  { match: '成都', lat: 30.57, lon: 104.06 },
  { match: '绵阳', lat: 31.47, lon: 104.68 },
  { match: '自贡', lat: 29.34, lon: 104.78 },
  { match: '攀枝花', lat: 26.58, lon: 101.72 },
  { match: '泸州', lat: 28.87, lon: 105.44 },
  { match: '德阳', lat: 31.13, lon: 104.40 },
  { match: '广元', lat: 32.44, lon: 105.84 },
  { match: '遂宁', lat: 30.53, lon: 105.59 },
  { match: '内江', lat: 29.58, lon: 105.06 },
  { match: '乐山', lat: 29.55, lon: 103.77 },
  { match: '南充', lat: 30.84, lon: 106.11 },
  { match: '眉山', lat: 30.08, lon: 103.85 },
  { match: '宜宾', lat: 28.75, lon: 104.64 },
  { match: '广安', lat: 30.46, lon: 106.63 },
  { match: '达州', lat: 31.21, lon: 107.47 },
  { match: '雅安', lat: 29.98, lon: 103.01 },
  { match: '巴中', lat: 31.87, lon: 106.75 },
  { match: '资阳', lat: 30.13, lon: 104.63 },
  { match: '阿坝', lat: 31.90, lon: 102.22 },
  { match: '甘孜', lat: 30.05, lon: 101.96 },
  { match: '凉山', lat: 27.88, lon: 102.26 },
  { match: '西昌', lat: 27.88, lon: 102.26 },
  // 湖北省
  { match: '武汉', lat: 30.59, lon: 114.31 },
  { match: '黄石', lat: 30.20, lon: 115.04 },
  { match: '十堰', lat: 32.65, lon: 110.78 },
  { match: '宜昌', lat: 30.69, lon: 111.29 },
  { match: '襄阳', lat: 32.01, lon: 112.12 },
  { match: '鄂州', lat: 30.39, lon: 114.89 },
  { match: '荆门', lat: 31.04, lon: 112.20 },
  { match: '孝感', lat: 30.92, lon: 113.92 },
  { match: '荆州', lat: 30.34, lon: 112.24 },
  { match: '黄冈', lat: 30.45, lon: 114.87 },
  { match: '咸宁', lat: 29.84, lon: 114.32 },
  { match: '随州', lat: 31.69, lon: 113.38 },
  { match: '恩施', lat: 30.27, lon: 109.49 },
  { match: '仙桃', lat: 30.36, lon: 113.45 },
  { match: '潜江', lat: 30.40, lon: 112.90 },
  { match: '天门', lat: 30.66, lon: 113.17 },
  // 湖南省
  { match: '长沙', lat: 28.23, lon: 112.94 },
  { match: '株洲', lat: 27.83, lon: 113.13 },
  { match: '湘潭', lat: 27.83, lon: 112.94 },
  { match: '衡阳', lat: 26.89, lon: 112.57 },
  { match: '邵阳', lat: 27.24, lon: 111.47 },
  { match: '岳阳', lat: 29.36, lon: 113.13 },
  { match: '常德', lat: 29.03, lon: 111.70 },
  { match: '张家界', lat: 29.12, lon: 110.48 },
  { match: '益阳', lat: 28.55, lon: 112.36 },
  { match: '郴州', lat: 25.77, lon: 113.01 },
  { match: '永州', lat: 26.42, lon: 111.61 },
  { match: '怀化', lat: 27.55, lon: 110.00 },
  { match: '娄底', lat: 27.70, lon: 112.00 },
  { match: '湘西', lat: 28.31, lon: 109.74 },
  { match: '吉首', lat: 28.31, lon: 109.74 },
  // 福建省
  { match: '福州', lat: 26.08, lon: 119.30 },
  { match: '厦门', lat: 24.48, lon: 118.09 },
  { match: '泉州', lat: 24.87, lon: 118.68 },
  { match: '漳州', lat: 24.51, lon: 117.65 },
  { match: '莆田', lat: 25.45, lon: 119.01 },
  { match: '三明', lat: 26.26, lon: 117.64 },
  { match: '南平', lat: 26.64, lon: 118.18 },
  { match: '龙岩', lat: 25.08, lon: 117.02 },
  { match: '宁德', lat: 26.67, lon: 119.55 },
  // 山东省
  { match: '济南', lat: 36.65, lon: 117.12 },
  { match: '青岛', lat: 36.07, lon: 120.38 },
  { match: '淄博', lat: 36.81, lon: 118.05 },
  { match: '枣庄', lat: 34.81, lon: 117.32 },
  { match: '东营', lat: 37.43, lon: 118.67 },
  { match: '烟台', lat: 37.46, lon: 121.45 },
  { match: '潍坊', lat: 36.71, lon: 119.16 },
  { match: '济宁', lat: 35.42, lon: 116.59 },
  { match: '泰安', lat: 36.20, lon: 117.09 },
  { match: '威海', lat: 37.51, lon: 122.12 },
  { match: '日照', lat: 35.42, lon: 119.53 },
  { match: '临沂', lat: 35.10, lon: 118.36 },
  { match: '德州', lat: 37.44, lon: 116.36 },
  { match: '聊城', lat: 36.46, lon: 115.99 },
  { match: '滨州', lat: 37.38, lon: 117.97 },
  { match: '菏泽', lat: 35.23, lon: 115.48 },
  // 河南省
  { match: '郑州', lat: 34.75, lon: 113.62 },
  { match: '洛阳', lat: 34.62, lon: 112.45 },
  { match: '开封', lat: 34.80, lon: 114.31 },
  { match: '平顶山', lat: 33.77, lon: 113.19 },
  { match: '安阳', lat: 36.10, lon: 114.39 },
  { match: '鹤壁', lat: 35.75, lon: 114.30 },
  { match: '新乡', lat: 35.30, lon: 113.93 },
  { match: '焦作', lat: 35.22, lon: 113.24 },
  { match: '濮阳', lat: 35.76, lon: 115.03 },
  { match: '许昌', lat: 34.04, lon: 113.85 },
  { match: '漯河', lat: 33.58, lon: 114.02 },
  { match: '三门峡', lat: 34.77, lon: 111.20 },
  { match: '南阳', lat: 32.99, lon: 112.53 },
  { match: '商丘', lat: 34.41, lon: 115.66 },
  { match: '信阳', lat: 32.15, lon: 114.09 },
  { match: '周口', lat: 33.63, lon: 114.70 },
  { match: '驻马店', lat: 32.98, lon: 114.02 },
  { match: '济源', lat: 35.07, lon: 112.60 },
  // 河北省
  { match: '石家庄', lat: 38.04, lon: 114.51 },
  { match: '唐山', lat: 39.63, lon: 118.18 },
  { match: '秦皇岛', lat: 39.94, lon: 119.60 },
  { match: '邯郸', lat: 36.63, lon: 114.54 },
  { match: '邢台', lat: 37.07, lon: 114.50 },
  { match: '保定', lat: 38.87, lon: 115.46 },
  { match: '张家口', lat: 40.77, lon: 114.89 },
  { match: '承德', lat: 40.95, lon: 117.96 },
  { match: '沧州', lat: 38.30, lon: 116.84 },
  { match: '廊坊', lat: 39.54, lon: 116.68 },
  { match: '衡水', lat: 37.74, lon: 115.67 },
  { match: '雄安', lat: 39.05, lon: 115.98 },
  // 陕西省
  { match: '西安', lat: 34.26, lon: 108.94 },
  { match: '铜川', lat: 34.90, lon: 108.95 },
  { match: '宝鸡', lat: 34.36, lon: 107.24 },
  { match: '咸阳', lat: 34.33, lon: 108.71 },
  { match: '渭南', lat: 34.50, lon: 109.51 },
  { match: '延安', lat: 36.59, lon: 109.49 },
  { match: '汉中', lat: 33.07, lon: 107.02 },
  { match: '榆林', lat: 38.29, lon: 109.73 },
  { match: '安康', lat: 32.68, lon: 109.03 },
  { match: '商洛', lat: 33.87, lon: 109.94 },
  // 安徽省
  { match: '合肥', lat: 31.82, lon: 117.23 },
  { match: '芜湖', lat: 31.35, lon: 118.43 },
  { match: '蚌埠', lat: 32.92, lon: 117.39 },
  { match: '淮南', lat: 32.63, lon: 117.00 },
  { match: '马鞍山', lat: 31.67, lon: 118.51 },
  { match: '淮北', lat: 33.96, lon: 116.80 },
  { match: '铜陵', lat: 30.95, lon: 117.81 },
  { match: '安庆', lat: 30.54, lon: 117.06 },
  { match: '黄山', lat: 29.72, lon: 118.34 },
  { match: '滁州', lat: 32.30, lon: 118.32 },
  { match: '阜阳', lat: 32.89, lon: 115.81 },
  { match: '宿州', lat: 33.65, lon: 116.96 },
  { match: '六安', lat: 31.74, lon: 116.52 },
  { match: '亳州', lat: 33.84, lon: 115.78 },
  { match: '池州', lat: 30.66, lon: 117.49 },
  { match: '宣城', lat: 30.94, lon: 118.76 },
  // 江西省
  { match: '南昌', lat: 28.68, lon: 115.86 },
  { match: '景德镇', lat: 29.27, lon: 117.18 },
  { match: '萍乡', lat: 27.62, lon: 113.85 },
  { match: '九江', lat: 29.71, lon: 116.00 },
  { match: '新余', lat: 27.82, lon: 114.92 },
  { match: '鹰潭', lat: 28.26, lon: 117.07 },
  { match: '赣州', lat: 25.83, lon: 114.93 },
  { match: '吉安', lat: 27.11, lon: 114.99 },
  { match: '宜春', lat: 27.82, lon: 114.42 },
  { match: '抚州', lat: 27.95, lon: 116.36 },
  { match: '上饶', lat: 28.45, lon: 117.94 },
  // 辽宁省
  { match: '沈阳', lat: 41.80, lon: 123.43 },
  { match: '大连', lat: 38.91, lon: 121.61 },
  { match: '鞍山', lat: 41.11, lon: 122.99 },
  { match: '抚顺', lat: 41.88, lon: 123.96 },
  { match: '本溪', lat: 41.30, lon: 123.77 },
  { match: '丹东', lat: 40.00, lon: 124.35 },
  { match: '锦州', lat: 41.10, lon: 121.13 },
  { match: '营口', lat: 40.67, lon: 122.24 },
  { match: '阜新', lat: 42.02, lon: 121.67 },
  { match: '辽阳', lat: 41.27, lon: 123.24 },
  { match: '盘锦', lat: 41.12, lon: 122.07 },
  { match: '铁岭', lat: 42.29, lon: 123.84 },
  { match: '朝阳', lat: 41.57, lon: 120.45 },
  { match: '葫芦岛', lat: 40.71, lon: 120.84 },
  // 吉林省
  { match: '长春', lat: 43.82, lon: 125.32 },
  { match: '四平', lat: 43.17, lon: 124.35 },
  { match: '辽源', lat: 42.89, lon: 125.14 },
  { match: '通化', lat: 41.73, lon: 125.94 },
  { match: '白山', lat: 41.94, lon: 126.42 },
  { match: '松原', lat: 45.14, lon: 124.82 },
  { match: '白城', lat: 45.62, lon: 122.84 },
  { match: '延边', lat: 42.89, lon: 129.51 },
  { match: '延吉', lat: 42.89, lon: 129.51 },
  // 黑龙江省
  { match: '哈尔滨', lat: 45.80, lon: 126.53 },
  { match: '齐齐哈尔', lat: 47.35, lon: 123.92 },
  { match: '鸡西', lat: 45.30, lon: 130.97 },
  { match: '鹤岗', lat: 47.35, lon: 130.30 },
  { match: '双鸭山', lat: 46.65, lon: 131.16 },
  { match: '大庆', lat: 46.59, lon: 125.10 },
  { match: '伊春', lat: 47.73, lon: 128.84 },
  { match: '佳木斯', lat: 46.80, lon: 130.32 },
  { match: '七台河', lat: 45.77, lon: 131.00 },
  { match: '牡丹江', lat: 44.55, lon: 129.63 },
  { match: '黑河', lat: 50.24, lon: 127.53 },
  { match: '绥化', lat: 46.65, lon: 126.97 },
  { match: '大兴安岭', lat: 50.41, lon: 124.12 },
  // 广西壮族自治区
  { match: '南宁', lat: 22.82, lon: 108.37 },
  { match: '柳州', lat: 24.33, lon: 109.42 },
  { match: '桂林', lat: 25.27, lon: 110.29 },
  { match: '梧州', lat: 23.48, lon: 111.28 },
  { match: '北海', lat: 21.48, lon: 109.12 },
  { match: '防城港', lat: 21.69, lon: 108.35 },
  { match: '钦州', lat: 21.98, lon: 108.65 },
  { match: '贵港', lat: 23.11, lon: 109.60 },
  { match: '玉林', lat: 22.64, lon: 110.16 },
  { match: '百色', lat: 23.90, lon: 106.62 },
  { match: '贺州', lat: 24.40, lon: 111.57 },
  { match: '河池', lat: 24.69, lon: 108.09 },
  { match: '来宾', lat: 23.75, lon: 109.22 },
  { match: '崇左', lat: 22.38, lon: 107.36 },
  // 云南省
  { match: '昆明', lat: 25.04, lon: 102.71 },
  { match: '曲靖', lat: 25.49, lon: 103.80 },
  { match: '玉溪', lat: 24.35, lon: 102.55 },
  { match: '保山', lat: 25.11, lon: 99.16 },
  { match: '昭通', lat: 27.34, lon: 103.72 },
  { match: '丽江', lat: 26.86, lon: 100.23 },
  { match: '普洱', lat: 22.83, lon: 100.97 },
  { match: '临沧', lat: 23.88, lon: 100.09 },
  { match: '楚雄', lat: 25.05, lon: 101.53 },
  { match: '红河', lat: 23.36, lon: 103.38 },
  { match: '蒙自', lat: 23.36, lon: 103.38 },
  { match: '文山', lat: 23.40, lon: 104.22 },
  { match: '西双版纳', lat: 22.01, lon: 100.80 },
  { match: '景洪', lat: 22.01, lon: 100.80 },
  { match: '大理', lat: 25.61, lon: 100.27 },
  { match: '德宏', lat: 24.43, lon: 98.58 },
  { match: '怒江', lat: 25.82, lon: 98.86 },
  { match: '迪庆', lat: 27.82, lon: 99.71 },
  { match: '香格里拉', lat: 27.82, lon: 99.71 },
  // 贵州省
  { match: '贵阳', lat: 26.65, lon: 106.63 },
  { match: '六盘水', lat: 26.59, lon: 104.83 },
  { match: '遵义', lat: 27.73, lon: 106.93 },
  { match: '安顺', lat: 26.25, lon: 105.95 },
  { match: '毕节', lat: 27.30, lon: 105.29 },
  { match: '铜仁', lat: 27.72, lon: 109.19 },
  { match: '黔西南', lat: 25.09, lon: 104.91 },
  { match: '兴义', lat: 25.09, lon: 104.91 },
  { match: '黔东南', lat: 26.58, lon: 107.98 },
  { match: '凯里', lat: 26.58, lon: 107.98 },
  { match: '黔南', lat: 26.26, lon: 107.52 },
  { match: '都匀', lat: 26.26, lon: 107.52 },
  // 山西省
  { match: '太原', lat: 37.87, lon: 112.55 },
  { match: '大同', lat: 40.08, lon: 113.30 },
  { match: '阳泉', lat: 37.86, lon: 113.58 },
  { match: '长治', lat: 36.20, lon: 113.12 },
  { match: '晋城', lat: 35.49, lon: 112.85 },
  { match: '朔州', lat: 39.33, lon: 112.43 },
  { match: '晋中', lat: 37.69, lon: 112.75 },
  { match: '运城', lat: 35.03, lon: 111.01 },
  { match: '忻州', lat: 38.42, lon: 112.73 },
  { match: '临汾', lat: 36.09, lon: 111.52 },
  { match: '吕梁', lat: 37.52, lon: 111.14 },
  // 内蒙古自治区
  { match: '呼和浩特', lat: 40.84, lon: 111.75 },
  { match: '包头', lat: 40.66, lon: 109.84 },
  { match: '乌海', lat: 39.66, lon: 106.79 },
  { match: '赤峰', lat: 42.26, lon: 118.89 },
  { match: '通辽', lat: 43.65, lon: 122.24 },
  { match: '鄂尔多斯', lat: 39.61, lon: 109.78 },
  { match: '呼伦贝尔', lat: 49.21, lon: 119.77 },
  { match: '海拉尔', lat: 49.21, lon: 119.77 },
  { match: '巴彦淖尔', lat: 40.74, lon: 107.39 },
  { match: '乌兰察布', lat: 41.00, lon: 113.13 },
  { match: '兴安', lat: 46.08, lon: 122.04 },
  { match: '乌兰浩特', lat: 46.08, lon: 122.04 },
  { match: '锡林郭勒', lat: 43.93, lon: 116.05 },
  { match: '锡林浩特', lat: 43.93, lon: 116.05 },
  { match: '阿拉善', lat: 38.85, lon: 105.73 },
  // 甘肃省
  { match: '兰州', lat: 36.06, lon: 103.83 },
  { match: '嘉峪关', lat: 39.77, lon: 98.29 },
  { match: '金昌', lat: 38.52, lon: 102.19 },
  { match: '白银', lat: 36.55, lon: 104.14 },
  { match: '天水', lat: 34.58, lon: 105.72 },
  { match: '武威', lat: 37.93, lon: 102.64 },
  { match: '张掖', lat: 38.93, lon: 100.45 },
  { match: '平凉', lat: 35.54, lon: 106.67 },
  { match: '酒泉', lat: 39.73, lon: 98.49 },
  { match: '庆阳', lat: 35.71, lon: 107.64 },
  { match: '定西', lat: 35.58, lon: 104.63 },
  { match: '陇南', lat: 33.40, lon: 104.92 },
  { match: '临夏', lat: 35.60, lon: 103.21 },
  { match: '甘南', lat: 34.98, lon: 102.91 },
  // 宁夏回族自治区
  { match: '银川', lat: 38.49, lon: 106.23 },
  { match: '石嘴山', lat: 38.98, lon: 106.38 },
  { match: '吴忠', lat: 37.99, lon: 106.20 },
  { match: '固原', lat: 36.02, lon: 106.24 },
  { match: '中卫', lat: 37.50, lon: 105.20 },
  // 青海省
  { match: '西宁', lat: 36.62, lon: 101.78 },
  { match: '海东', lat: 36.48, lon: 102.10 },
  { match: '海北', lat: 36.95, lon: 100.90 },
  { match: '黄南', lat: 35.51, lon: 102.02 },
  { match: '海南州', lat: 36.28, lon: 100.62 },
  { match: '果洛', lat: 34.47, lon: 100.24 },
  { match: '玉树', lat: 33.00, lon: 97.01 },
  { match: '海西', lat: 37.38, lon: 97.37 },
  { match: '格尔木', lat: 36.40, lon: 94.90 },
  // 新疆维吾尔自治区
  { match: '乌鲁木齐', lat: 43.83, lon: 87.62 },
  { match: '克拉玛依', lat: 45.58, lon: 84.89 },
  { match: '吐鲁番', lat: 42.95, lon: 89.19 },
  { match: '哈密', lat: 42.82, lon: 93.52 },
  { match: '昌吉', lat: 44.01, lon: 87.31 },
  { match: '博尔塔拉', lat: 44.91, lon: 82.07 },
  { match: '博乐', lat: 44.91, lon: 82.07 },
  { match: '巴音郭楞', lat: 41.76, lon: 86.15 },
  { match: '库尔勒', lat: 41.76, lon: 86.15 },
  { match: '阿克苏', lat: 41.17, lon: 80.26 },
  { match: '克孜勒苏', lat: 39.72, lon: 76.17 },
  { match: '喀什', lat: 39.47, lon: 75.99 },
  { match: '和田', lat: 37.11, lon: 79.92 },
  { match: '伊犁', lat: 43.92, lon: 81.32 },
  { match: '伊宁', lat: 43.92, lon: 81.32 },
  { match: '塔城', lat: 46.75, lon: 82.99 },
  { match: '阿勒泰', lat: 47.84, lon: 88.14 },
  { match: '石河子', lat: 44.30, lon: 86.08 },
  // 西藏自治区
  { match: '拉萨', lat: 29.65, lon: 91.11 },
  { match: '日喀则', lat: 29.27, lon: 88.88 },
  { match: '昌都', lat: 31.14, lon: 97.17 },
  { match: '林芝', lat: 29.65, lon: 94.36 },
  { match: '山南', lat: 29.24, lon: 91.77 },
  { match: '那曲', lat: 31.48, lon: 92.05 },
  { match: '阿里', lat: 32.50, lon: 80.11 },
  // 海南省
  { match: '海口', lat: 20.04, lon: 110.20 },
  { match: '三亚', lat: 18.25, lon: 109.51 },
  { match: '三沙', lat: 16.83, lon: 112.33 },
  { match: '儋州', lat: 19.52, lon: 109.58 },
  { match: '琼海', lat: 19.26, lon: 110.47 },
  { match: '文昌', lat: 19.54, lon: 110.80 },
  { match: '万宁', lat: 18.80, lon: 110.39 },
  { match: '陵水', lat: 18.51, lon: 110.04 },
  // 直辖市与省级兜底（置于末尾，当未命中地级市时回退到省会/首府真实坐标）
  { match: '北京', lat: 39.90, lon: 116.40 },
  { match: '上海', lat: 31.23, lon: 121.47 },
  { match: '天津', lat: 39.08, lon: 117.20 },
  { match: '重庆', lat: 29.56, lon: 106.55 },
  { match: '广东', lat: 23.13, lon: 113.26 },
  { match: '浙江', lat: 30.27, lon: 120.15 },
  { match: '江苏', lat: 32.06, lon: 118.80 },
  { match: '四川', lat: 30.57, lon: 104.06 },
  { match: '湖北', lat: 30.59, lon: 114.31 },
  { match: '湖南', lat: 28.23, lon: 112.94 },
  { match: '福建', lat: 26.08, lon: 119.30 },
  { match: '山东', lat: 36.65, lon: 117.12 },
  { match: '河南', lat: 34.75, lon: 113.62 },
  { match: '河北', lat: 38.04, lon: 114.51 },
  { match: '陕西', lat: 34.26, lon: 108.94 },
  { match: '安徽', lat: 31.82, lon: 117.23 },
  { match: '江西', lat: 28.68, lon: 115.86 },
  { match: '辽宁', lat: 41.80, lon: 123.43 },
  { match: '吉林', lat: 43.82, lon: 125.32 },
  { match: '黑龙江', lat: 45.80, lon: 126.53 },
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
  { match: '海南', lat: 20.04, lon: 110.20 },
  { match: '台湾', lat: 25.03, lon: 121.56 },
];

const CN_IPV4_FIRST_OCTETS = new Set([
  1, 14, 27, 36, 39, 42, 43, 49, 58, 59, 60, 61, 101, 106, 110, 111, 112, 113, 114, 115, 116, 117,
  118, 119, 120, 121, 122, 123, 124, 125, 139, 140, 144, 150, 153, 163, 171, 175, 180, 182, 183,
  202, 203, 210, 211, 218, 219, 220, 221, 222, 223,
]);

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

/**
 * 1. 全量扫描器、网络空间测绘、AI 爬虫、SEO 爬虫、无头浏览器及命令行 HTTP 客户端特征正则
 */
const BOT_OR_SCANNER_UA_RE = new RegExp(
  [
    // 搜索引擎与社交媒体爬虫
    'bot', 'spider', 'crawl', 'slurp', 'mediapartners', 'apis-google', 'adsbot',
    'googleother', 'google-inspectiontool', 'google-extended', 'bingpreview',
    'baiduspider', 'bytespider', 'petalbot', 'sogou', 'yisouspider', '360spider',
    'ToutiaoSpider', 'yandex', 'duckduckbot', 'facebookexternalhit', 'facebot',
    'twitterbot', 'linkedinbot', 'telegrambot', 'discordbot', 'slackbot', 'whatsapp',
    'applebot', 'amazonbot', 'pinterestbot', 'redditbot',
    // AI 训练与检索爬虫
    'gptbot', 'chatgpt-user', 'oai-searchbot', 'claudebot', 'claude-web', 'anthropic-ai',
    'perplexitybot', 'ccbot', 'cohere-ai', 'meta-externalagent', 'meta-externalfetcher',
    'diffbot', 'omgili', 'youbot', 'timpibot', ' Kangaroo ',
    // 漏洞扫描器、安全探针、网络空间测绘引擎
    'masscan', 'zgrab', 'nuclei', 'nmap', 'nikto', 'sqlmap', 'wpscan', 'acunetix',
    'nessus', 'openvas', 'qualys', 'burpsuite', 'dirbuster', 'gobuster', 'ffuf',
    'feroxbuster', 'wfuzz', 'httpx', ' xray', 'afrog', 'goby', 'awvs', 'appscan',
    'censys', 'shodan', 'fofa', 'zoomeye', 'quake', 'binaryedge', 'netcraft',
    'leakix', 'shadowserver', 'internetmeasurement', ' stretchoid', 'paloaltonetworks',
    'expanse', 'onyphe', 'criminalip', 'ivre', 'rapid7', 'projectdiscovery',
    'cybergreen', 'ipip\\.net', 'dnspod-monitor', 'aliyun-sec', 'tencent-sec',
    // 监控探针与测速工具
    'uptimerobot', 'statuscake', 'pingdom', 'hetrixtools', 'betteruptime', 'freshping',
    'site24x7', 'datadog', 'newrelic', 'prometheus', 'blackbox.exporter', 'zabbix',
    'nagios', 'gtmetrix', 'pagespeed', 'lighthouse', 'chrome-lighthouse', 'ptst/',
    // SEO 采集与商业数据抓取器
    'semrush', 'ahrefs', 'mj12bot', 'dotbot', 'rogerbot', 'blexbot', 'dataforseo',
    'screaming frog', 'seokicks', 'sistrix', 'megaindex', 'serpstatbot', 'zoominfobot',
    // 无头浏览器与自动化框架
    'headless', 'headlesschrome', 'phantomjs', 'slimerjs', 'playwright', 'puppeteer',
    'selenium', 'webdriver', 'cypress', ' splash', 'htmlunit',
    // 编程语言 HTTP 客户端与命令行工具
    'curl/', 'wget/', 'python-requests', 'python-urllib', 'python-httpx', 'aiohttp',
    'scrapy', 'go-http-client', 'fasthttp', 'java/', 'apache-httpclient', 'okhttp',
    'jersey/', 'axios/', 'node-fetch', 'undici', 'got/', 'superagent', 'ky/',
    'libwww-perl', 'lwp-trivial', 'mechanize', 'php/', 'guzzlehttp', 'symfony',
    'ruby', 'faraday', 'rest-client', 'typhoeus', 'rust-reqwest', 'hyper/', 'dart:io',
    'postmanruntime', 'insomnia', 'apifox', 'apipost', 'httpie', 'aria2',
  ].join('|'),
  'i'
);

/**
 * 2. 漏洞扫描器高频探测的路径与恶意 Query 参数特征
 */
const SCANNER_PATH_OR_QUERY_RE = new RegExp(
  [
    '(?:^|/)(?:wp-admin|wp-login|wp-content|wp-includes|wp-json|xmlrpc\\.php)',
    '(?:^|/)(?:phpmyadmin|pma|adminer|mysql|dbadmin)',
    '(?:^|/)(?:\\.env|\\.git|\\.svn|\\.hg|\\.DS_Store|\\.vscode|\\.idea|\\.aws|\\.ssh)',
    '(?:^|/)(?:actuator|jolokia|swagger|v2/api-docs|druid|nacos|eureka|console)',
    '(?:^|/)(?:vendor/phpunit|phpunit|thinkphp|laravel|telescope|ignition)',
    '(?:^|/)(?:cgi-bin|boaform|HNAP1|GponForm|sdk|evox|weaver|seeyon|tongda)',
    '(?:^|/)(?:shell|cmd|eval|backdoor|webshell|tz\\.php|phpinfo|info\\.php|test\\.php)',
    '(?:^|[?&])(?:s=/index/|s=index/|invokefunction|call_user_func)',
    '(?:^|[?&])(?:XDEBUG_SESSION_START|xdebug)',
    '(?:^|[?&])(?:rest_route=|wp_scrape|author=\\d+)',
    '(?:\\$\\{jndi:|\\.\\./\\.\\./|<script|union\\s+select|base64_decode)',
  ].join('|'),
  'i'
);

/**
 * 3. 内存级「同 IP + 同路径 5 秒防抖」与「单 IP 高频突发扫描限流器」
 */
const RECENT_HIT_COOLDOWN_MS = 5000;
const recentVisitCooldown = new Map<string, number>();

const BURST_WINDOW_MS = 10_000;
const BURST_MAX_HITS = 12;
const BURST_BAN_MS = 30 * 60 * 1000;
const ipBurstCounters = new Map<string, { count: number; windowStart: number; bannedUntil: number }>();

function shouldDropByRateOrDedup(ip: string, cleanPath: string): boolean {
  if (!ip) return true;
  const now = Date.now();

  let burst = ipBurstCounters.get(ip);
  if (!burst) {
    if (ipBurstCounters.size > 4000) {
      const oldestKey = ipBurstCounters.keys().next().value;
      if (oldestKey !== undefined) ipBurstCounters.delete(oldestKey);
    }
    burst = { count: 1, windowStart: now, bannedUntil: 0 };
    ipBurstCounters.set(ip, burst);
  } else {
    if (burst.bannedUntil > now) {
      return true;
    }
    if (now - burst.windowStart > BURST_WINDOW_MS) {
      burst.count = 1;
      burst.windowStart = now;
    } else {
      burst.count += 1;
      if (burst.count > BURST_MAX_HITS) {
        burst.bannedUntil = now + BURST_BAN_MS;
        for (const [k, v] of pendingVisits.entries()) {
          if (v.ip === ip) pendingVisits.delete(k);
        }
        return true;
      }
    }
  }

  const dedupKey = `${ip}|${cleanPath}`;
  const lastHit = recentVisitCooldown.get(dedupKey);
  if (lastHit && now - lastHit < RECENT_HIT_COOLDOWN_MS) {
    return true;
  }
  if (recentVisitCooldown.size > 6000) {
    const oldestKey = recentVisitCooldown.keys().next().value;
    if (oldestKey !== undefined) recentVisitCooldown.delete(oldestKey);
  }
  recentVisitCooldown.set(dedupKey, now);
  return false;
}

/**
 * 解析 User-Agent 与客户端环境提示（Client Hints / TouchPoints）：
 *   1. 支持识别纯血鸿蒙 OpenHarmony / HarmonyOS NEXT 与 ArkWeb 内核；
 *   2. 支持识别 iOS / Android 端主流 App 内置 WebView（微信、企业微信、QQ、微博、小红书、抖音/头条、B站、知乎、钉钉、飞书）及 iOS WKWebView 兜底，消除误判为 Bot 的问题；
 *   3. 结合前端上报的 `maxTouchPoints > 1` 精准识别伪装成 `Macintosh` 的 iPadOS 13+ 平板设备；
 *   4. 结合 `platformVersion` 区分 Windows 11 与 Windows 10，并拦截过旧的伪造 Chrome 版本（如 Chrome < 95）。
 */
export function parseUserAgent(
  uaRaw: string,
  hints?: ClientHintsInput
): {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';
  os: string;
  browser: string;
} {
  if (hints?.webdriver === true) {
    return { deviceType: 'Bot', os: 'Automation', browser: 'Bot' };
  }

  const ua = (uaRaw || '').trim();
  if (!ua || ua.length < 24 || ua.length > 600) {
    return { deviceType: 'Bot', os: 'Scanner', browser: 'Bot' };
  }

  if (BOT_OR_SCANNER_UA_RE.test(ua)) {
    return { deviceType: 'Bot', os: 'Crawler', browser: 'Bot' };
  }

  if (!/^Mozilla\/5\.0\s*\(/i.test(ua)) {
    return { deviceType: 'Bot', os: 'Scanner', browser: 'Bot' };
  }

  // 拦截机房爬虫高频伪造的远古 Chrome UA（如 Chrome/49 ~ Chrome/89，排除内置低版本内核的特殊老设备）
  const chromeMatch = ua.match(/\bChrome\/(\d{2,3})\./i);
  if (chromeMatch) {
    const major = Number(chromeMatch[1]);
    if (
      major > 0 &&
      major < 90 &&
      !/openharmony|harmonyos|micromessenger|baiduboxapp|ucbrowser|quark/i.test(ua)
    ) {
      return { deviceType: 'Bot', os: 'SpoofedUA', browser: 'Bot' };
    }
  }

  const touchPoints = typeof hints?.maxTouchPoints === 'number' ? hints.maxTouchPoints : 0;
  const screenW = typeof hints?.screenW === 'number' ? hints.screenW : 0;

  // 1. 操作系统识别（优先识别 OpenHarmony / HarmonyOS 与 iPadOS 13+ 桌面伪装）
  let os = 'Unknown';
  if (/openharmony/i.test(ua)) {
    os = 'HarmonyOS NEXT';
  } else if (/harmonyos|hms\/|hmos/i.test(ua)) {
    os = 'HarmonyOS';
  } else if (/ipad/i.test(ua)) {
    os = 'iPadOS';
  } else if (/iphone|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/mac os x|macintosh/i.test(ua)) {
    // iPadOS 13+ 默认发送 Macintosh 桌面 UA，但具备多点触控（maxTouchPoints >= 2）
    if (touchPoints > 1) {
      os = 'iPadOS';
    } else {
      os = 'macOS';
    }
  } else if (/windows phone/i.test(ua)) {
    os = 'Windows Phone';
  } else if (/windows nt 10\.0/i.test(ua)) {
    const pv = (hints?.platformVersion || '').trim();
    const pvMajor = pv ? parseInt(pv.split('.')[0] || '0', 10) : 0;
    if (pvMajor >= 13) os = 'Windows 11';
    else if (pvMajor > 0) os = 'Windows 10';
    else os = 'Windows 11/10';
  } else if (/windows nt 6\.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/windows nt 6\.2/i.test(ua)) {
    os = 'Windows 8';
  } else if (/windows nt 6\.1/i.test(ua)) {
    os = 'Windows 7';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/cros/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/linux|x11|ubuntu|debian|fedora|archlinux|centos/i.test(ua)) {
    os = 'Linux';
  }

  // 2. 设备类型识别（Tablet / Mobile / Desktop）
  let deviceType: 'Desktop' | 'Mobile' | 'Tablet' = 'Desktop';
  if (
    os === 'iPadOS' ||
    /(ipad|tablet|playbook|silk|kindle|sm-t|gt-p|matepad|mipad|pad)/i.test(ua) ||
    (/android/i.test(ua) && !/mobile/i.test(ua))
  ) {
    deviceType = 'Tablet';
  } else if (
    os === 'iOS' ||
    os === 'Windows Phone' ||
    /(mobi|iphone|ipod|phone|android.*mobile|harmonyos.*mobile|openharmony.*mobile|arkweb.*mobile)/i.test(ua)
  ) {
    deviceType = 'Mobile';
  } else if (touchPoints > 1 && screenW > 0 && screenW <= 1024) {
    deviceType = screenW >= 600 ? 'Tablet' : 'Mobile';
  }

  // 3. 浏览器与国内主流 App 容器识别
  let browser = 'Unknown';
  if (/wxwork/i.test(ua)) browser = '企业微信';
  else if (/micromessenger/i.test(ua)) browser = 'WeChat';
  else if (/dingtalk/i.test(ua)) browser = '钉钉';
  else if (/feishu|lark/i.test(ua)) browser = '飞书';
  else if (/xhsdiscover/i.test(ua)) browser = '小红书';
  else if (/aweme|bytedancewebview|toutiaomicroapp|newsarticle/i.test(ua)) browser = '抖音/头条';
  else if (/biliapp/i.test(ua)) browser = 'Bilibili';
  else if (/zhihuhybrid|zhihu/i.test(ua)) browser = '知乎';
  else if (/weibo/i.test(ua)) browser = 'Weibo';
  else if (/quark/i.test(ua)) browser = 'Quark';
  else if (/ucbrowser|ubrowser/i.test(ua)) browser = 'UC';
  else if (/mqqbrowser/i.test(ua)) browser = 'QQ浏览器';
  else if (/\bqq\//i.test(ua)) browser = 'QQ';
  else if (/baiduboxapp|baidubrowser/i.test(ua)) browser = '百度';
  else if (/arkweb|huaweibrowser|hbpc/i.test(ua)) browser = '华为浏览器';
  else if (/miuibrowser/i.test(ua)) browser = '小米浏览器';
  else if (/vivobrowser/i.test(ua)) browser = 'Vivo浏览器';
  else if (/heytapbrowser|oppobrowser/i.test(ua)) browser = 'OPPO浏览器';
  else if (/honorbrowser/i.test(ua)) browser = '荣耀浏览器';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung';
  else if (/edg\/|edgios\/|edga\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera|opios/i.test(ua)) browser = 'Opera';
  else if (/vivaldi/i.test(ua)) browser = 'Vivaldi';
  else if (/brave/i.test(ua)) browser = 'Brave';
  else if (/firefox\/|fxios\//i.test(ua)) browser = 'Firefox';
  else if (/chrome\/|crios\/|chromium\//i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = 'Safari';
  else if ((os === 'iOS' || os === 'iPadOS' || os === 'macOS') && /applewebkit/i.test(ua)) {
    // 关键修复：iOS/iPadOS 第三方 App 内置 WKWebView 没有 Version/x.x，兜底归为 Safari / WebView，避免误杀为 Bot
    browser = /mobile\//i.test(ua) && !/safari\//i.test(ua) ? 'iOS WebView' : 'Safari';
  } else if ((os === 'Android' || os.startsWith('HarmonyOS')) && /applewebkit/i.test(ua)) {
    browser = 'WebView';
  }

  if (os === 'Unknown' || browser === 'Unknown') {
    return { deviceType: 'Bot', os: 'Scanner', browser: 'Bot' };
  }

  return { deviceType, os, browser };
}

/**
 * 综合请求头、URL 路径与 Query 参数，判断是否为扫描器、预加载探针或非人类页面浏览请求。
 */
export function isScannerOrNonHumanPageRequest(context: APIContext): boolean {
  const { pathname, search } = context.url;
  const fullUrlTarget = `${pathname}${search || ''}`;

  if (SCANNER_PATH_OR_QUERY_RE.test(fullUrlTarget)) {
    return true;
  }

  const headers = context.request.headers;

  const purpose = (
    headers.get('sec-purpose') ||
    headers.get('purpose') ||
    headers.get('x-purpose') ||
    headers.get('x-moz') ||
    ''
  ).toLowerCase();
  if (purpose.includes('prefetch') || purpose.includes('preview') || purpose.includes('prerender')) {
    return true;
  }

  const secFetchMode = (headers.get('sec-fetch-mode') || '').toLowerCase();
  if (secFetchMode && secFetchMode !== 'navigate' && secFetchMode !== 'nested-navigate') {
    return true;
  }
  const secFetchDest = (headers.get('sec-fetch-dest') || '').toLowerCase();
  if (
    secFetchDest &&
    secFetchDest !== 'document' &&
    secFetchDest !== 'iframe' &&
    secFetchDest !== 'empty'
  ) {
    return true;
  }

  const accept = (headers.get('accept') || '').toLowerCase();
  if (!accept.includes('text/html') && !accept.includes('application/xhtml+xml')) {
    return true;
  }

  const acceptLang = (headers.get('accept-language') || '').trim();
  if (!acceptLang) {
    return true;
  }

  return false;
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
 * 格式化中国大陆地区展示文本，确保省份（如 `浙江省`、`广东省`、`北京市`）始终在最前，
 * 便于统计面板按具体省份聚合与搜索。
 */
function formatChinaRegionLabel(
  rawPro: string,
  rawCity: string,
  rawIsp: string,
  fallbackAddr = ''
): string {
  const combined = `${rawPro} ${rawCity} ${fallbackAddr}`.trim();
  const stdProvince = extractChinaProvince(combined) || rawPro.trim();
  const cleanCity = rawCity.trim().replace(/^0$/, '');
  let loc = stdProvince;
  if (cleanCity && !cleanCity.includes(stdProvince.replace(/[省市自治区]/g, ''))) {
    loc = stdProvince ? `${stdProvince}${cleanCity}` : cleanCity;
  } else if (!loc && cleanCity) {
    loc = cleanCity;
  }
  const isp = normalizeIspShort(rawIsp || fallbackAddr.replace(rawPro, '').replace(rawCity, ''));
  return [loc || '中国', isp].filter(Boolean).join(' · ').slice(0, 64);
}

/**
 * 第一层：纯内存 0ms 确定性归属地解析（优先使用 ip2region.xdb 全内存库，0.01ms 一步到位定位省/市/ISP）。
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

  // 1. 优先尝试离线 ip2region.xdb 全内存 Buffer 查询（~0.01ms，零网络开销）
  const xdbRes = searchIp2RegionMemory(cleanIp);
  if (xdbRes) {
    if (xdbRes.isDatacenter) {
      const dcProfile: GeoProfile = {
        code: 'CN',
        zh: '中国',
        en: 'China',
        region: xdbRes.raw,
        lat: 35.0,
        lon: 104.0,
        enriched: true,
        isDatacenter: true,
      };
      cacheIpReputation(cleanIp, 'bot');
      setGeoCache(cleanIp, dcProfile);
      return dcProfile;
    }

    if (xdbRes.country === '中国' || xdbRes.province) {
      const region = formatChinaRegionLabel(xdbRes.province, xdbRes.city, xdbRes.isp);
      const coords = inferCoordsFromText(`${region} ${xdbRes.province} ${xdbRes.city}`, 35.0, 104.0);
      const profile: GeoProfile = {
        code: 'CN',
        zh: '中国',
        en: 'China',
        region,
        lat: coords.lat,
        lon: coords.lon,
        enriched: Boolean(xdbRes.province),
      };
      setGeoCache(cleanIp, profile);
      return profile;
    }
  }

  // 2. 查询 SQLite 历史已富化缓存
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

  // 3. 解析 CDN 边缘透传地理位置头（若存在）
  const countryHeader = (
    headers?.get('cf-ipcountry') ||
    headers?.get('ali-cdn-real-ip-country') ||
    headers?.get('x-vercel-ip-country') ||
    headers?.get('x-country-code') ||
    ''
  )
    .trim()
    .toUpperCase();

  const cityHeader = cleanGeoText(
    headers?.get('cf-ipcity') ||
      headers?.get('ali-cdn-real-ip-city') ||
      headers?.get('x-vercel-ip-city') ||
      headers?.get('x-vercel-ip-country-region') ||
      '',
    32
  );

  if (countryHeader && COUNTRY_BY_CODE[countryHeader]) {
    const c = COUNTRY_BY_CODE[countryHeader]!;
    const stdProv = countryHeader === 'CN' && cityHeader ? extractChinaProvince(cityHeader) : '';
    const regionLabel =
      countryHeader === 'HK'
        ? '中国香港'
        : countryHeader === 'MO'
          ? '中国澳门'
          : countryHeader === 'TW'
            ? '中国台湾'
            : stdProv
              ? stdProv
              : `${c.zh} · 公网节点`;
    const coords = stdProv ? inferCoordsFromText(stdProv, c.lat, c.lon) : { lat: c.lat, lon: c.lon };
    const headerProfile: GeoProfile = {
      code: c.code,
      zh: c.zh,
      en: c.en,
      region: regionLabel,
      lat: coords.lat,
      lon: coords.lon,
      enriched: Boolean(stdProv || countryHeader === 'HK' || countryHeader === 'MO' || countryHeader === 'TW'),
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
      profile = { code: 'CN', zh: '中国', en: 'China', region: '北京市 · 教育网 IPv6', lat: 39.9, lon: 116.4, enriched: false };
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

function cleanGeoText(raw: unknown, maxLen = 48): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[<>"'&\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, maxLen);
}

function buildGeoFromBeaconPayload(ip: string, payload?: ClientBeaconPayload): GeoProfile | null {
  if (!payload) return null;
  const pro = cleanGeoText(payload.pro, 24);
  const city = cleanGeoText(payload.city, 24);
  const addr = cleanGeoText(payload.addr, 48);
  if (pro || city) {
    if (isDatacenterIspText(`${pro} ${city} ${addr}`)) {
      return {
        code: 'CN',
        zh: '中国',
        en: 'China',
        region: addr || pro,
        lat: 35.0,
        lon: 104.0,
        enriched: true,
        isDatacenter: true,
      };
    }
    const region = formatChinaRegionLabel(pro, city, '', addr);
    const coords = inferCoordsFromText(`${region} ${pro} ${city} ${addr}`, 35.0, 104.0);
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

  const ccRaw = cleanGeoText(payload.countryCode, 4).toUpperCase();
  const cc = /^[A-Z]{2}$/.test(ccRaw) ? ccRaw : '';
  if (cc) {
    const known = COUNTRY_BY_CODE[cc];
    const code = known ? known.code : cc;
    const zh = known ? known.zh : cleanGeoText(payload.countryZh || payload.countryEn || cc, 32) || cc;
    const en = known ? known.en : cleanGeoText(payload.countryEn || zh, 32) || zh;
    const reg = cleanGeoText(payload.region, 32);
    const isp = cleanGeoText(payload.isp, 24);
    if (isDatacenterIspText(`${reg} ${isp}`)) {
      return {
        code,
        zh,
        en,
        region: `${reg} ${isp}`.trim(),
        lat: known?.lat ?? 35.0,
        lon: known?.lon ?? 104.0,
        enriched: true,
        isDatacenter: true,
      };
    }
    const stdProv = code === 'CN' ? extractChinaProvince(reg) : '';
    const region =
      code === 'CN' && (stdProv || reg)
        ? formatChinaRegionLabel(stdProv || reg, '', isp)
        : [reg || zh, normalizeIspShort(isp)].filter(Boolean).join(' · ').slice(0, 64) || zh;
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
   第二层：多源回退精准 IP 归属地与机房信誉联合查询
   （修复原第 1214 行 pconline 超时或无省份时直接 return null 锁死中国大陆 IP 的问题）
   -------------------------------------------------------------------------- */
const MAX_GEO_QUEUE = 1000;
const MAX_FAILED_GEO_CACHE = 2000;
const pendingGeoIps = new Set<string>();
const failedGeoIps = new Map<string, number>();
let geoWorkerRunning = false;

export async function fetchAccurateIpGeo(ip: string): Promise<GeoProfile | null> {
  // 0. 优先走内存 ip2region.xdb
  const xdbRes = searchIp2RegionMemory(ip);
  if (xdbRes && (xdbRes.province || xdbRes.isDatacenter)) {
    if (xdbRes.isDatacenter) {
      return {
        code: 'CN',
        zh: '中国',
        en: 'China',
        region: xdbRes.raw,
        lat: 35.0,
        lon: 104.0,
        enriched: true,
        isDatacenter: true,
      };
    }
    const region = formatChinaRegionLabel(xdbRes.province, xdbRes.city, xdbRes.isp);
    const coords = inferCoordsFromText(`${region} ${xdbRes.province} ${xdbRes.city}`, 35.0, 104.0);
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

  // 方案 A：国内太平洋 IP 库（精准到中国大陆省、市、运营商）
  try {
    const res = await fetch(
      `https://whois.pconline.com.cn/ipJson.jsp?ip=${encodeURIComponent(ip)}&json=true`,
      { signal: AbortSignal.timeout(2200) }
    );
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buf);
      const data = JSON.parse(text) as {
        pro?: string;
        city?: string;
        addr?: string;
        err?: string;
      };
      const pro = cleanGeoText(data.pro, 24);
      const city = cleanGeoText(data.city, 24);
      const addr = cleanGeoText(data.addr, 48);

      if (isDatacenterIspText(`${pro} ${city} ${addr}`)) {
        return {
          code: 'CN',
          zh: '中国',
          en: 'China',
          region: addr || '云机房节点',
          lat: 35.0,
          lon: 104.0,
          enriched: true,
          isDatacenter: true,
        };
      }

      const stdProv = extractChinaProvince(`${pro} ${city} ${addr}`);
      if (pro || stdProv) {
        const region = formatChinaRegionLabel(stdProv || pro, city, '', addr);
        const coords = inferCoordsFromText(`${region} ${pro} ${city} ${addr}`, 35.0, 104.0);
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
    /* pconline 超时或不可达时直接平滑回退至下方方案 B / C，不再锁死返回 null */
  }

  // 方案 B：调用 ip-api.com（同时拉取省市名称与 hosting/proxy/isp/org/as 机房信誉标志）
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,as,lat,lon,hosting,proxy&lang=zh-CN`,
      { signal: AbortSignal.timeout(2400) }
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
        as?: string;
        lat?: number;
        lon?: number;
        hosting?: boolean;
        proxy?: boolean;
      };
      if (data.status === 'success' && data.countryCode) {
        const rawIspText = `${data.isp || ''} ${data.org || ''} ${data.as || ''}`.trim();
        if (data.hosting || data.proxy || isDatacenterIspText(rawIspText)) {
          return {
            code: 'CN',
            zh: '中国',
            en: 'China',
            region: cleanGeoText(rawIspText, 48) || '机房节点',
            lat: 35.0,
            lon: 104.0,
            enriched: true,
            isDatacenter: true,
          };
        }

        const ccRaw = cleanGeoText(data.countryCode, 4).toUpperCase();
        const cc = /^[A-Z]{2}$/.test(ccRaw) ? ccRaw : 'UN';
        const known = COUNTRY_BY_CODE[cc];
        const cleanCountry = cleanGeoText(data.country, 32);
        const code = known ? known.code : cc;
        const zh = known ? known.zh : cleanCountry || cc;
        const en = known ? known.en : cleanCountry || cc;

        const rName = cleanGeoText(data.regionName, 32);
        const cName = cleanGeoText(data.city, 32);
        const ispShort = normalizeIspShort(cleanGeoText(data.isp || data.org, 48));

        let region = '';
        if (code === 'CN') {
          const stdProv =
            extractChinaProvince(`${rName} ${cName}`) ||
            (cc === 'HK' ? '中国香港' : cc === 'MO' ? '中国澳门' : cc === 'TW' ? '中国台湾' : rName);
          region = formatChinaRegionLabel(stdProv, cName, ispShort);
        } else {
          const locPart = rName && cName && rName !== cName ? `${rName}${cName}` : rName || cName || zh;
          region = [locPart, ispShort].filter(Boolean).join(' · ').slice(0, 64) || zh;
        }

        const inferred = code === 'CN' ? inferCoordsFromText(region, NaN, NaN) : { lat: NaN, lon: NaN };
        const lat = Number.isFinite(inferred.lat)
          ? inferred.lat
          : typeof data.lat === 'number' && Number.isFinite(data.lat)
            ? Number(data.lat.toFixed(2))
            : (known?.lat ?? 35.0);
        const lon = Number.isFinite(inferred.lon)
          ? inferred.lon
          : typeof data.lon === 'number' && Number.isFinite(data.lon)
            ? Number(data.lon.toFixed(2))
            : (known?.lon ?? 104.0);

        return { code, zh, en, region, lat, lon, enriched: true };
      }
    }
  } catch {
    /* fallback to HTTPS ipwho.is */
  }

  // 方案 C：HTTPS 兜底接口 ipwho.is（支持 IPv4 与 IPv6，解决部分国内环境阻断明文 HTTP 的情况）
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        country?: string;
        country_code?: string;
        region?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        connection?: { isp?: string; org?: string; domain?: string };
        security?: { hosting?: boolean; proxy?: boolean; vpn?: boolean; tor?: boolean };
      };
      if (data.success && data.country_code) {
        const ispRaw = `${data.connection?.isp || ''} ${data.connection?.org || ''}`.trim();
        if (
          data.security?.hosting ||
          data.security?.proxy ||
          data.security?.vpn ||
          data.security?.tor ||
          isDatacenterIspText(ispRaw)
        ) {
          return {
            code: 'CN',
            zh: '中国',
            en: 'China',
            region: cleanGeoText(ispRaw, 48) || '机房节点',
            lat: 35.0,
            lon: 104.0,
            enriched: true,
            isDatacenter: true,
          };
        }

        const cc = cleanGeoText(data.country_code, 4).toUpperCase();
        const known = COUNTRY_BY_CODE[cc];
        const code = known ? known.code : cc;
        const zh = known ? known.zh : cleanGeoText(data.country, 32) || cc;
        const en = known ? known.en : cleanGeoText(data.country, 32) || cc;
        const rName = cleanGeoText(data.region, 32);
        const cName = cleanGeoText(data.city, 32);
        const ispShort = normalizeIspShort(ispRaw);

        const region =
          code === 'CN'
            ? formatChinaRegionLabel(extractChinaProvince(`${rName} ${cName}`) || rName, cName, ispShort)
            : [rName || cName || zh, ispShort].filter(Boolean).join(' · ').slice(0, 64) || zh;

        const inferred = code === 'CN' ? inferCoordsFromText(region, NaN, NaN) : { lat: NaN, lon: NaN };
        const lat = Number.isFinite(inferred.lat)
          ? inferred.lat
          : typeof data.latitude === 'number' && Number.isFinite(data.latitude)
            ? Number(data.latitude.toFixed(2))
            : (known?.lat ?? 35.0);
        const lon = Number.isFinite(inferred.lon)
          ? inferred.lon
          : typeof data.longitude === 'number' && Number.isFinite(data.longitude)
            ? Number(data.longitude.toFixed(2))
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
  if (lastFail && Date.now() - lastFail < 10 * 60 * 1000) return;
  if (pendingGeoIps.size >= MAX_GEO_QUEUE) return;

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
          if (enriched.isDatacenter) {
            cacheIpReputation(nextIp, 'bot');
            purgeBotIp(nextIp);
            bumpAnalyticsVersion();
            continue;
          }
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
            bumpAnalyticsVersion();
          } catch (err) {
            console.error('[analytics] updateIpGeo failed:', err);
          }
        } else {
          if (failedGeoIps.size >= MAX_FAILED_GEO_CACHE) {
            const oldestFail = failedGeoIps.keys().next().value;
            if (oldestFail !== undefined) failedGeoIps.delete(oldestFail);
          }
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
let analyticsDataVersion = 1;
let cachedTodaySummary: { date: string; ver: number; todayUv: number; todayPv: number } | null = null;
let cachedRawLogs: { ver: number; limit: number; items: VisitorLogItem[] } | null = null;

function bumpAnalyticsVersion(): void {
  analyticsDataVersion += 1;
  cachedTodaySummary = null;
  cachedRawLogs = null;
}

/**
 * 启动时自动校准并清洗历史记录：
 * 1. 自动清理命中新增云机房 CIDR、机房 ISP 关键词或爬虫 UA 的历史残留脏记录；
 * 2. 用升级后的 `parseUserAgent` 修正被误标的设备/OS/浏览器（如 OpenHarmony / iOS WebView）；
 * 3. 用 `extractChinaProvince` 与 `inferCoordsFromText` 标准化中国各省份名称与省市坐标。
 */
function repairExistingCoordsAndWarmCache(db: Database.Database): void {
  try {
    const rows = db
      .prepare(
        `SELECT id, ip, country_code, country_zh, country_en, region, lat, lon,
                device_type, os, browser, user_agent
           FROM visitor_logs
          ORDER BY id DESC
          LIMIT 5000`
      )
      .all() as Array<{
      id: number;
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
    }>;

    const deleteByIdStmt = db.prepare(`DELETE FROM visitor_logs WHERE id = ?`);
    const updateRowStmt = db.prepare(
      `UPDATE visitor_logs
          SET region = ?, lat = ?, lon = ?, device_type = ?, os = ?, browser = ?
        WHERE id = ?`
    );

    db.transaction(() => {
      for (const r of rows) {
        // 1. 清理历史残留的机房 IP、CIDR 黑名单或扫描器 UA 记录
        const xdb = r.ip ? searchIp2RegionMemory(r.ip) : null;
        if (
          !r.ip ||
          matchBotIpRule(r.ip) ||
          isDatacenterIspText(r.region) ||
          xdb?.isDatacenter
        ) {
          deleteByIdStmt.run(r.id);
          continue;
        }

        let deviceType = r.device_type;
        let os = r.os;
        let browser = r.browser;
        if (r.user_agent) {
          const reparsed = parseUserAgent(r.user_agent, {
            maxTouchPoints: r.os === 'iPadOS' || r.device_type === 'Tablet' ? 5 : 0,
          });
          if (reparsed.deviceType === 'Bot') {
            deleteByIdStmt.run(r.id);
            continue;
          }
          // 保留先前由前端 maxTouchPoints 确认过的 iPadOS / Windows 11 精细标签
          if (r.os !== 'iPadOS' && r.os !== 'Windows 11' && r.os !== 'Windows 10') {
            deviceType = reparsed.deviceType;
            os = reparsed.os;
          }
          browser = reparsed.browser;
        }

        let region = r.region;
        let lat = r.lat;
        let lon = r.lon;

        if (r.country_code === 'CN' || r.country_zh === '中国') {
          if (xdb && xdb.province) {
            region = formatChinaRegionLabel(xdb.province, xdb.city, xdb.isp);
          } else {
            const stdProv = extractChinaProvince(region);
            if (stdProv && !region.startsWith(stdProv)) {
              region = `${stdProv} · ${region}`.slice(0, 64);
            }
          }
          const inferred = inferCoordsFromText(`${region} ${r.country_zh}`, NaN, NaN);
          if (Number.isFinite(inferred.lat) && Number.isFinite(inferred.lon)) {
            lat = inferred.lat;
            lon = inferred.lon;
          }
        } else if (COUNTRY_BY_CODE[r.country_code]) {
          const c = COUNTRY_BY_CODE[r.country_code]!;
          if (Math.abs(lat - 35.0) < 0.05 && Math.abs(lon - 104.0) < 0.05) {
            lat = c.lat;
            lon = c.lon;
          }
        }

        if (
          region !== r.region ||
          Math.abs(lat - r.lat) > 0.05 ||
          Math.abs(lon - r.lon) > 0.05 ||
          deviceType !== r.device_type ||
          os !== r.os ||
          browser !== r.browser
        ) {
          updateRowStmt.run(region, lat, lon, deviceType, os, browser, r.id);
        }

        if (
          r.ip &&
          !ipGeoCache.has(r.ip) &&
          region &&
          !region.endsWith('公网节点') &&
          !region.includes('本地')
        ) {
          setGeoCache(r.ip, {
            code: r.country_code,
            zh: r.country_zh,
            en: r.country_en,
            region,
            lat,
            lon,
            enriched: true,
          });
        }
      }
    })();
  } catch (err) {
    console.error('[analytics] repairExistingCoordsAndWarmCache error:', err);
  }
}

function getStmts(): PreparedStatements {
  const db = getDb();
  if (cachedStmts && cachedStmts.db === db) return cachedStmts;

  cachedStmts = {
    db,
    // 关键修复：按 (visit_date, ip, device_type, os, browser) 复合键查询，
    // 复用 db/schema.sql 中的 visitor_logs_lookup_idx 索引，避免同一 Wi-Fi 下手机与电脑互相覆盖设备记录！
    findVisit: db.prepare(
      `SELECT id, pv_count, last_seen, path FROM visitor_logs
        WHERE visit_date = ? AND ip = ? AND device_type = ? AND os = ? AND browser = ?
        LIMIT 1`
    ),
    updateVisit: db.prepare(
      `UPDATE visitor_logs
          SET pv_count = pv_count + ?,
              visit_count = visit_count + ?,
              device_type = ?,
              os = ?,
              browser = ?,
              user_agent = ?,
              path = ?,
              referrer = ?,
              last_seen = ?
        WHERE id = ?`
    ),
    insertVisit: db.prepare(
      `INSERT INTO visitor_logs (
        visit_date, ip, country_code, country_zh, country_en, region,
        lat, lon, device_type, os, browser, user_agent, path, referrer,
        pv_count, visit_count, first_seen, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  repairExistingCoordsAndWarmCache(db);
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
const VISIT_SESSION_GAP_MS = 30 * 60 * 1000;

/* --------------------------------------------------------------------------
   IP 信誉补充过滤：hosting / proxy / VPN / 云机房
   -------------------------------------------------------------------------- */
type IpReputation = 'human' | 'bot';
const ipReputationCache = new Map<string, IpReputation>();
const ipReputationQueue = new Set<string>();
const failedIpReputation = new Map<string, number>();
const MAX_REPUTATION_CACHE = 4000;
const MAX_REPUTATION_QUEUE = 1000;
const MAX_FAILED_REPUTATION_CACHE = 2000;
const REPUTATION_BATCH_SIZE = 100;
const REPUTATION_BATCH_DELAY_MS = 1200;
const REPUTATION_FAIL_TTL_MS = 30 * 60 * 1000;
let reputationTimer: ReturnType<typeof setTimeout> | null = null;
let reputationRunning = false;

function cacheIpReputation(ip: string, reputation: IpReputation): void {
  if (!ip) return;
  if (ipReputationCache.has(ip)) ipReputationCache.delete(ip);
  else if (ipReputationCache.size >= MAX_REPUTATION_CACHE) {
    const oldest = ipReputationCache.keys().next().value;
    if (oldest !== undefined) ipReputationCache.delete(oldest);
  }
  ipReputationCache.set(ip, reputation);
}

function purgeBotIp(ip: string): void {
  for (const [key, item] of pendingVisits.entries()) {
    if (item.ip === ip) pendingVisits.delete(key);
  }
  try {
    getDb().prepare('DELETE FROM visitor_logs WHERE ip = ?').run(ip);
  } catch (err) {
    console.error('[analytics] purge bot IP failed:', err);
  }
}

function recordFailedIpReputation(ip: string, until: number): void {
  if (!ip) return;
  if (failedIpReputation.size >= MAX_FAILED_REPUTATION_CACHE && !failedIpReputation.has(ip)) {
    const oldest = failedIpReputation.keys().next().value;
    if (oldest !== undefined) failedIpReputation.delete(oldest);
  }
  failedIpReputation.set(ip, until);
}

function enqueueIpReputation(ipRaw: string): void {
  const ip = normalizeIp(ipRaw);
  if (!ip || isPrivateOrLoopbackIp(ip)) return;
  if (ipReputationCache.has(ip)) return;
  if (ipReputationQueue.has(ip)) return;
  const failedUntil = failedIpReputation.get(ip);
  if (failedUntil && failedUntil > Date.now()) return;
  if (ipReputationQueue.size >= MAX_REPUTATION_QUEUE) return;

  ipReputationQueue.add(ip);
  if (ipReputationQueue.size >= REPUTATION_BATCH_SIZE) {
    void flushIpReputation();
    return;
  }
  if (!reputationTimer) {
    reputationTimer = setTimeout(() => {
      reputationTimer = null;
      void flushIpReputation();
    }, REPUTATION_BATCH_DELAY_MS);
  }
}

async function flushIpReputation(): Promise<void> {
  if (reputationRunning || ipReputationQueue.size === 0) return;
  if (reputationTimer) {
    clearTimeout(reputationTimer);
    reputationTimer = null;
  }

  reputationRunning = true;
  const ips = Array.from(ipReputationQueue).slice(0, REPUTATION_BATCH_SIZE);
  for (const ip of ips) ipReputationQueue.delete(ip);

  try {
    const res = await fetch(
      'http://ip-api.com/batch?fields=status,query,hosting,proxy,mobile,as,isp,org',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ips),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) throw new Error(`ip-api ${res.status}`);
    const rows = (await res.json()) as Array<{
      status?: string;
      query?: string;
      hosting?: boolean;
      proxy?: boolean;
      isp?: string;
      org?: string;
      as?: string;
    }>;
    const seen = new Set<string>();
    for (const row of rows) {
      const ip = normalizeIp(row.query);
      if (!ip) continue;
      seen.add(ip);
      if (row.status !== 'success') {
        recordFailedIpReputation(ip, Date.now() + REPUTATION_FAIL_TTL_MS);
        continue;
      }
      const ispText = `${row.isp || ''} ${row.org || ''} ${row.as || ''}`;
      if (row.hosting || row.proxy || isDatacenterIspText(ispText)) {
        cacheIpReputation(ip, 'bot');
        purgeBotIp(ip);
        bumpAnalyticsVersion();
      } else {
        cacheIpReputation(ip, 'human');
      }
    }
    for (const ip of ips) {
      if (!seen.has(ip)) recordFailedIpReputation(ip, Date.now() + REPUTATION_FAIL_TTL_MS);
    }
  } catch {
    for (const ip of ips) recordFailedIpReputation(ip, Date.now() + REPUTATION_FAIL_TTL_MS);
  } finally {
    reputationRunning = false;
    if (ipReputationQueue.size > 0) {
      reputationTimer = setTimeout(() => {
        reputationTimer = null;
        void flushIpReputation();
      }, REPUTATION_BATCH_DELAY_MS);
    }
  }
}

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
        if (matchBotIpRule(item.ip) || ipReputationCache.get(item.ip) === 'bot') continue;
        const fakeHeaders = item.countryHeader
          ? new Headers({ 'x-country-code': item.countryHeader })
          : undefined;
        const geo = resolveIpGeo(item.ip, fakeHeaders);
        if (geo.isDatacenter || isDatacenterIspText(geo.region)) {
          cacheIpReputation(item.ip, 'bot');
          continue;
        }

        const existing = stmts.findVisit.get(
          item.visitDate,
          item.ip,
          item.deviceType,
          item.os,
          item.browser
        ) as { id: number; pv_count: number; last_seen: string; path: string } | undefined;

        if (existing) {
          const gapMs =
            new Date(item.firstSeen).getTime() - new Date(existing.last_seen).getTime();
          const visitInc = gapMs > VISIT_SESSION_GAP_MS ? 1 : 0;
          stmts.updateVisit.run(
            item.pvCount,
            visitInc,
            item.deviceType,
            item.os,
            item.browser,
            item.userAgent,
            item.path,
            item.referrer,
            item.lastSeen,
            existing.id
          );
        } else {
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
            1,
            item.firstSeen,
            item.lastSeen
          );
          if (!geo.enriched) {
            newIpsToEnrich.push(item.ip);
          }
        }
      }
    })();

    bumpAnalyticsVersion();
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
  /\.(?:xml|js|mjs|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|flac|aac|opus|webm|json|txt|map|webmanifest|php|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|rar)$/i;

/**
 * 服务端请求级采集入口（当启用前端 JS 信标时，默认以 `recordVisitBeacon` 为准；
 * 若显式设置 `BLOG_SSR_RAW_VISIT=1` 或直接调用本函数，同样经过完整的机房 CIDR/ISP 与新 UA 规则过滤）。
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

    if (isScannerOrNonHumanPageRequest(context)) {
      return;
    }

    const headers = context.request.headers;
    const ua = headers.get('user-agent') ?? '';
    const chPlatformVer = (headers.get('sec-ch-ua-platform-version') || '').replace(/"/g, '');
    const parsedUa = parseUserAgent(ua, { platformVersion: chPlatformVer });
    if (parsedUa.deviceType === 'Bot') return;

    const ip = getClientIp(context);
    if (isPrivateOrLoopbackIp(ip)) {
      return;
    }

    if (ipReputationCache.get(ip) === 'bot' || matchBotIpRule(ip)) {
      return;
    }

    const geoCheck = resolveIpGeo(ip, headers);
    if (geoCheck.isDatacenter || isDatacenterIspText(geoCheck.region)) {
      cacheIpReputation(ip, 'bot');
      return;
    }

    const cleanPath = (pathname || '/').slice(0, 160);
    if (shouldDropByRateOrDedup(ip, cleanPath)) {
      return;
    }

    const today = formatDateYmd();
    const nowSql = formatDateTimeSql();
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
      existing.userAgent = ua.slice(0, 300);
      existing.path = cleanPath;
      existing.referrer = referrer;
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

    enqueueIpReputation(ip);
    scheduleVisitFlush();
  } catch (err) {
    console.error('[analytics] recordVisit failed:', err);
  }
}

/**
 * 接收前端浏览器真实执行 JS 后上报的轻量遥测信标（`POST /api/analytics/collect`）：
 *   1. 彻底过滤不执行 JS 的机房扫描器、Go/Python 抓取脚本与 Headless WebDriver；
 *   2. 接收前端 `maxTouchPoints`、`platformVersion` 与屏幕尺寸，精准识别 iPadOS 13+ 与 Windows 11；
 *   3. 推入非阻塞内存缓冲队列（`pendingVisits`）并立即返回，0ms 阻塞。
 */
export async function recordVisitBeacon(
  context: APIContext,
  payload: ClientBeaconPayload | null
): Promise<{ ok: boolean; ip: string }> {
  try {
    if (payload?.webdriver === true) {
      return { ok: true, ip: '' };
    }

    const headers = context.request.headers;
    const ua = headers.get('user-agent') ?? '';
    const chPlatformVer =
      payload?.platformVersion ||
      (headers.get('sec-ch-ua-platform-version') || '').replace(/"/g, '');

    const parsedUa = parseUserAgent(ua, {
      maxTouchPoints: payload?.maxTouchPoints,
      platform: payload?.platform,
      platformVersion: chPlatformVer,
      screenW: payload?.screenW,
      screenH: payload?.screenH,
      webdriver: payload?.webdriver,
    });
    if (parsedUa.deviceType === 'Bot') {
      return { ok: true, ip: '' };
    }

    const browserIp = normalizeIp(payload?.ip);
    const serverIp = getClientIp(context);

    const effectiveIp =
      serverIp && !isPrivateOrLoopbackIp(serverIp)
        ? serverIp
        : browserIp && !isPrivateOrLoopbackIp(browserIp)
          ? browserIp
          : '';

    if (!effectiveIp) {
      return { ok: false, ip: '' };
    }

    if (ipReputationCache.get(effectiveIp) === 'bot' || matchBotIpRule(effectiveIp)) {
      return { ok: true, ip: '' };
    }

    const rawPath = String(payload?.path || '/').trim();
    const cleanPath = (rawPath.startsWith('/') ? rawPath : `/${rawPath}`).slice(0, 160);
    if (
      cleanPath.startsWith('/studio') ||
      cleanPath.startsWith('/api/') ||
      SCANNER_PATH_OR_QUERY_RE.test(cleanPath)
    ) {
      return { ok: true, ip: effectiveIp };
    }

    if (shouldDropByRateOrDedup(effectiveIp, cleanPath)) {
      return { ok: true, ip: effectiveIp };
    }

    let geo = buildGeoFromBeaconPayload(effectiveIp, payload ?? undefined);
    if (!geo) {
      const cached = ipGeoCache.get(effectiveIp);
      if (cached?.enriched) {
        geo = cached;
      } else {
        geo = resolveIpGeo(effectiveIp, headers);
      }
    }

    if (geo.isDatacenter || isDatacenterIspText(geo.region)) {
      cacheIpReputation(effectiveIp, 'bot');
      purgeBotIp(effectiveIp);
      return { ok: true, ip: '' };
    }

    const today = formatDateYmd();
    const nowSql = formatDateTimeSql();
    const referrer = String(payload?.referrer || headers.get('referer') || '').slice(0, 240);
    const countryHeader = (
      headers.get('cf-ipcountry') ||
      headers.get('ali-cdn-real-ip-country') ||
      headers.get('x-vercel-ip-country') ||
      headers.get('x-country-code') ||
      ''
    ).trim();

    // 推入内存写缓冲队列（按 日期 + IP + 设备类型 + 系统 + 浏览器 独立聚合），不阻塞请求响应
    const key = `${today}|${effectiveIp}|${parsedUa.deviceType}|${parsedUa.os}|${parsedUa.browser}`;
    const existing = pendingVisits.get(key);
    if (existing) {
      existing.pvCount += 1;
      existing.userAgent = ua.slice(0, 300);
      existing.path = cleanPath;
      existing.referrer = referrer;
      existing.lastSeen = nowSql;
    } else {
      pendingVisits.set(key, {
        visitDate: today,
        ip: effectiveIp,
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

    if (!geo.enriched) {
      enqueueGeoEnrichment(effectiveIp);
    }
    enqueueIpReputation(effectiveIp);
    scheduleVisitFlush();

    return { ok: true, ip: effectiveIp };
  } catch (err) {
    console.error('[analytics] recordVisitBeacon failed:', err);
    return { ok: false, ip: '' };
  }
}

export function clearAnalyticsLogs(): void {
  pendingVisits.clear();
  getDb().prepare('DELETE FROM visitor_logs').run();
  bumpAnalyticsVersion();
}

/** 极速获取今日 UV 与 PV（供后台顶栏导航角标使用，带内存版本号缓存） */
export function getTodayUvSummary(): { todayUv: number; todayPv: number } {
  flushPendingVisits();
  const today = formatDateYmd();
  if (
    cachedTodaySummary &&
    cachedTodaySummary.date === today &&
    cachedTodaySummary.ver === analyticsDataVersion
  ) {
    return { todayUv: cachedTodaySummary.todayUv, todayPv: cachedTodaySummary.todayPv };
  }
  const row = getStmts().todaySummary.get(today) as { uv: number; pv: number } | undefined;
  const todayUv = row?.uv ?? 0;
  const todayPv = row?.pv ?? 0;
  cachedTodaySummary = { date: today, ver: analyticsDataVersion, todayUv, todayPv };
  return { todayUv, todayPv };
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
  if (granularity === 'day') return bucket.slice(5);
  if (granularity === 'week') return `${bucket.slice(5)} 周`;
  if (granularity === 'month') return bucket;
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
         FROM visitor_logs WHERE visit_date >= ? AND visit_date <= ?`
    )
    .get(`${thisMonth}-01`, `${thisMonth}-31`) as { uv: number; pv: number };

  const yearRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(pv_count), 0) AS pv
         FROM visitor_logs WHERE visit_date >= ? AND visit_date <= ?`
    )
    .get(`${thisYear}-01-01`, `${thisYear}-12-31`) as { uv: number; pv: number };

  const totalRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv,
              COALESCE(SUM(pv_count), 0) AS pv,
              COUNT(DISTINCT country_zh) AS countries
         FROM visitor_logs`
    )
    .get() as { uv: number; pv: number; countries: number };

  const bucketExpr = getBucketSqlExpr(granularity);
  const limitBuckets =
    granularity === 'day' ? 30 : granularity === 'week' ? 16 : granularity === 'month' ? 15 : 8;

  const rawSeries = db
    .prepare(
      `SELECT ${bucketExpr} AS bucket,
              COUNT(DISTINCT ip) AS uv,
              COALESCE(SUM(pv_count), 0) AS pv,
              SUM(CASE WHEN device_type = 'Desktop' THEN pv_count ELSE 0 END) AS desktop,
              SUM(CASE WHEN device_type = 'Mobile' THEN pv_count ELSE 0 END) AS mobile,
              SUM(CASE WHEN device_type = 'Tablet' THEN pv_count ELSE 0 END) AS tablet,
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

  // 默认当前时间桶（按日 -> 今日；按周 -> 本周；按月 -> 本月；按年 -> 本年）
  const activeBucket =
    selectedBucket ||
    (granularity === 'day'
      ? today
      : granularity === 'week'
        ? weekStartRow.ws
        : granularity === 'month'
          ? thisMonth
          : thisYear);

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
        WHERE ${bucketExpr} = ?
        GROUP BY country_zh
        ORDER BY uv DESC, pv DESC`
    )
    .all(activeBucket) as Array<{
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

  const queryDimension = (col: 'device_type' | 'os' | 'browser'): DeviceBreakdownItem[] => {
    const rows = db
      .prepare(
        `SELECT ${col} AS name,
                COUNT(DISTINCT ip) AS uv,
                COALESCE(SUM(pv_count), 0) AS pv
           FROM visitor_logs
          WHERE ${bucketExpr} = ?
            AND (? IS NULL OR country_zh = ?)
          GROUP BY ${col}
          ORDER BY pv DESC`
      )
      .all(activeBucket, selectedCountry, selectedCountry) as Array<{
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

  // 访客日志明细严格限定在当前时间桶（activeBucket）内
  const whereClauses: string[] = [`${bucketExpr} = ?`];
  const params: Array<string | number> = [activeBucket];

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
              pv_count, visit_count, first_seen, last_seen
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
    visit_count: number;
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
    visitCount: r.visit_count,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));

  return {
    granularity,
    selectedBucket: activeBucket,
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
 * 返回全部真实访客记录（供统计页热力图、柱状图与二级菜单聚合引擎使用）。
 */
export function listVisitorLogs(limit = 5000): VisitorLogItem[] {
  flushPendingVisits();
  getStmts(); // 确保已完成历史坐标校准、脏数据清理与缓存预热
  const cappedLimit = Math.min(5000, Math.max(1, Math.floor(limit)));
  if (
    cachedRawLogs &&
    cachedRawLogs.ver === analyticsDataVersion &&
    cachedRawLogs.limit === cappedLimit
  ) {
    return cachedRawLogs.items;
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, visit_date, ip, country_code, country_zh, country_en, region,
              lat, lon, device_type, os, browser, user_agent, path, referrer,
              pv_count, visit_count, first_seen, last_seen
         FROM visitor_logs
        ORDER BY visit_date DESC, last_seen DESC, id DESC
        LIMIT ?`
    )
    .all(cappedLimit) as Array<{
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
    visit_count: number;
    first_seen: string;
    last_seen: string;
  }>;

  let enqueuedCount = 0;
  for (const r of rows) {
    if (
      enqueuedCount < 24 &&
      (r.region.endsWith('公网节点') || r.region.endsWith('IPv6')) &&
      !isPrivateOrLoopbackIp(r.ip)
    ) {
      enqueueGeoEnrichment(r.ip);
      enqueuedCount += 1;
    }
  }

  const items: VisitorLogItem[] = rows.map((r) => {
    let region = r.region;
    let lat = r.lat;
    let lon = r.lon;
    if (r.country_code === 'CN' || r.country_zh === '中国') {
      const stdProv = extractChinaProvince(region);
      if (stdProv && !region.startsWith(stdProv)) {
        region = `${stdProv} · ${region}`.slice(0, 64);
      }
      const inferred = inferCoordsFromText(`${region} ${r.country_zh}`, lat, lon);
      lat = inferred.lat;
      lon = inferred.lon;
    }
    return {
      id: r.id,
      visitDate: r.visit_date,
      ip: r.ip,
      countryCode: r.country_code,
      countryZh: r.country_zh,
      countryEn: r.country_en,
      region,
      lat,
      lon,
      deviceType: r.device_type,
      os: r.os,
      browser: r.browser,
      userAgent: r.user_agent,
      path: r.path,
      referrer: r.referrer,
      pvCount: r.pv_count,
      visitCount: r.visit_count,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    };
  });

  cachedRawLogs = { ver: analyticsDataVersion, limit: cappedLimit, items };
  return items;
}
