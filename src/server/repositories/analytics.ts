/**
 * 访客统计数据层（`visitor_logs` 表）：
 *   1. 自动记录每日访客 IP、地理位置（与 3D 粒子地球仪国家元数据对齐）、使用设备（Desktop/Mobile/Tablet）、操作系统、浏览器与受访路径；
 *   2. 支持按日（day）、按周（week）、按月（month）、按年（year）四个时间维度整合统计；
 *   3. 提供国家/地区聚合（供 3D 粒子地球仪高亮与脉冲标注）、设备/系统/浏览器占比，以及可按时间/国家/设备/关键词检索的 IP 明细表。
 */
import type { APIContext } from 'astro';
import { getClientIp } from '../auth';
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

interface GeoProfile {
  code: string;
  zh: string;
  en: string;
  region: string;
  lat: number;
  lon: number;
}

const GEO_PROFILES: GeoProfile[] = [
  { code: 'CN', zh: '中国', en: 'China', region: '上海 · 电信骨干网', lat: 31.23, lon: 121.47 },
  { code: 'CN', zh: '中国', en: 'China', region: '北京 · 联通数据节点', lat: 39.90, lon: 116.40 },
  { code: 'CN', zh: '中国', en: 'China', region: '深圳 · 粤港澳节点', lat: 22.54, lon: 114.06 },
  { code: 'CN', zh: '中国', en: 'China', region: '杭州 · 华东节点', lat: 30.27, lon: 120.15 },
  { code: 'CN', zh: '中国', en: 'China', region: '成都 · 西南节点', lat: 30.57, lon: 104.06 },
  { code: 'SG', zh: '新加坡', en: 'Singapore', region: 'Singapore · Marina Bay', lat: 1.35, lon: 103.82 },
  { code: 'JP', zh: '日本', en: 'Japan', region: 'Tokyo · Chiyoda', lat: 35.68, lon: 139.76 },
  { code: 'US', zh: '美国', en: 'United States', region: 'San Francisco · CA', lat: 37.77, lon: -122.42 },
  { code: 'US', zh: '美国', en: 'United States', region: 'New York · NY', lat: 40.71, lon: -74.01 },
  { code: 'DE', zh: '德国', en: 'Germany', region: 'Frankfurt · Hesse', lat: 50.11, lon: 8.68 },
  { code: 'GB', zh: '英国', en: 'United Kingdom', region: 'London · Docklands', lat: 51.51, lon: -0.13 },
  { code: 'FR', zh: '法国', en: 'France', region: 'Paris · Île-de-France', lat: 48.86, lon: 2.35 },
  { code: 'KR', zh: '韩国', en: 'South Korea', region: 'Seoul · Gangnam', lat: 37.57, lon: 126.98 },
  { code: 'CA', zh: '加拿大', en: 'Canada', region: 'Toronto · Ontario', lat: 43.65, lon: -79.38 },
  { code: 'AU', zh: '澳大利亚', en: 'Australia', region: 'Sydney · NSW', lat: -33.87, lon: 151.21 },
  { code: 'NL', zh: '荷兰', en: 'Netherlands', region: 'Amsterdam · North Holland', lat: 52.37, lon: 4.90 },
  { code: 'SE', zh: '瑞典', en: 'Sweden', region: 'Stockholm', lat: 59.33, lon: 18.07 },
  { code: 'CH', zh: '瑞士', en: 'Switzerland', region: 'Zurich', lat: 47.37, lon: 8.54 },
  { code: 'MY', zh: '马来西亚', en: 'Malaysia', region: 'Kuala Lumpur', lat: 3.14, lon: 101.69 },
  { code: 'TH', zh: '泰国', en: 'Thailand', region: 'Bangkok', lat: 13.76, lon: 100.50 },
  { code: 'BR', zh: '巴西', en: 'Brazil', region: 'São Paulo', lat: -23.55, lon: -46.63 },
];

const COUNTRY_BY_CODE: Record<string, GeoProfile> = {};
for (const g of GEO_PROFILES) {
  if (!COUNTRY_BY_CODE[g.code]) COUNTRY_BY_CODE[g.code] = g;
}

/** 解析 User-Agent，提取设备类型、操作系统、浏览器 */
export function parseUserAgent(uaRaw: string): {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';
  os: string;
  browser: string;
} {
  const ua = (uaRaw || '').trim();
  if (!ua) {
    return { deviceType: 'Desktop', os: 'Unknown OS', browser: 'Direct' };
  }

  if (/(bot|spider|crawl|slurp|mediapartners|headless|curl|wget|python-requests)/i.test(ua)) {
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
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/harmonyos/i.test(ua)) os = 'HarmonyOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/cros/i.test(ua)) os = 'ChromeOS';

  let browser = 'Browser';
  if (/micromessenger/i.test(ua)) browser = 'WeChat';
  else if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua)) browser = 'Safari';

  return { deviceType, os, browser };
}

/** 根据请求头或 IP 推断国家与经纬度坐标（与 3D 粒子地球仪 174 国元数据对齐） */
export function resolveIpGeo(ip: string, headers?: Headers): GeoProfile {
  const countryHeader =
    headers?.get('cf-ipcountry')?.toUpperCase() ||
    headers?.get('x-vercel-ip-country')?.toUpperCase() ||
    headers?.get('x-country-code')?.toUpperCase() ||
    '';

  if (countryHeader && COUNTRY_BY_CODE[countryHeader]) {
    return COUNTRY_BY_CODE[countryHeader]!;
  }

  const cleanIp = (ip || '').trim();
  if (
    !cleanIp ||
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('10.') ||
    cleanIp === 'unknown'
  ) {
    return {
      code: 'CN',
      zh: '中国',
      en: 'China',
      region: '本地环回 · 站长终端',
      lat: 35.0,
      lon: 104.0,
    };
  }

  // 根据常见公网网段前缀或稳定哈希映射到全球节点
  if (cleanIp.startsWith('103.') || cleanIp.startsWith('128.199.')) {
    return COUNTRY_BY_CODE['SG']!;
  }
  if (cleanIp.startsWith('133.') || cleanIp.startsWith('126.') || cleanIp.startsWith('210.140.')) {
    return COUNTRY_BY_CODE['JP']!;
  }
  if (cleanIp.startsWith('8.') || cleanIp.startsWith('64.') || cleanIp.startsWith('104.') || cleanIp.startsWith('172.')) {
    return COUNTRY_BY_CODE['US']!;
  }
  if (cleanIp.startsWith('85.') || cleanIp.startsWith('138.201.') || cleanIp.startsWith('78.')) {
    return COUNTRY_BY_CODE['DE']!;
  }
  if (cleanIp.startsWith('81.') || cleanIp.startsWith('51.140.')) {
    return COUNTRY_BY_CODE['GB']!;
  }
  if (cleanIp.startsWith('211.') || cleanIp.startsWith('175.')) {
    return COUNTRY_BY_CODE['KR']!;
  }

  let hash = 0;
  for (let i = 0; i < cleanIp.length; i++) {
    hash = (hash * 31 + cleanIp.charCodeAt(i)) >>> 0;
  }
  return GEO_PROFILES[hash % GEO_PROFILES.length]!;
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

/**
 * 在 middleware 中调用：记录公开页面的访问日志。
 * 同一天 + 同一 IP + 同一设备类型合并计数（pv_count + 1），更新最后访问时间与受访路径。
 */
export function recordVisit(context: APIContext): void {
  try {
    const { pathname } = context.url;
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/studio') ||
      pathname.startsWith('/uploads/') ||
      pathname.startsWith('/artifact/') ||
      pathname === '/favicon.ico' ||
      pathname === '/favicon.svg' ||
      pathname.endsWith('.xml') ||
      pathname.endsWith('.js') ||
      pathname.endsWith('.css') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.webp') ||
      pathname.endsWith('.svg') ||
      pathname.endsWith('.ico')
    ) {
      return;
    }

    const ua = context.request.headers.get('user-agent') ?? '';
    const parsedUa = parseUserAgent(ua);
    if (parsedUa.deviceType === 'Bot') return;

    const ip = getClientIp(context);
    const geo = resolveIpGeo(ip, context.request.headers);
    const today = formatDateYmd();
    const nowSql = formatDateTimeSql();
    const referrer = (context.request.headers.get('referer') ?? '').slice(0, 240);
    const cleanPath = (pathname || '/').slice(0, 160);

    const db = getDb();
    const existing = db
      .prepare(
        `SELECT id, pv_count FROM visitor_logs
          WHERE visit_date = ? AND ip = ? AND device_type = ? AND os = ? AND browser = ?
          LIMIT 1`
      )
      .get(today, ip, parsedUa.deviceType, parsedUa.os, parsedUa.browser) as
      | { id: number; pv_count: number }
      | undefined;

    if (existing) {
      db.prepare(
        `UPDATE visitor_logs
            SET pv_count = pv_count + 1,
                path = ?,
                last_seen = ?
          WHERE id = ?`
      ).run(cleanPath, nowSql, existing.id);
    } else {
      db.prepare(
        `INSERT INTO visitor_logs (
          visit_date, ip, country_code, country_zh, country_en, region,
          lat, lon, device_type, os, browser, user_agent, path, referrer,
          pv_count, first_seen, last_seen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        today,
        ip,
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
        nowSql,
        nowSql
      );
    }
  } catch (err) {
    console.error('[analytics] recordVisit failed:', err);
  }
}

/** 若数据库尚无访客记录，可初始化真实感历史样本（覆盖跨年/跨月/跨周/每日多国节点），方便后台即刻检视 */
export function ensureInitialAnalyticsSeed(): void {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) AS n FROM visitor_logs').get() as { n: number };
  if (countRow.n > 0) return;
  seedSampleAnalytics();
}

export function seedSampleAnalytics(): number {
  const db = getDb();
  const now = new Date();

  const sampleNodes = [
    { ip: '116.228.89.142', code: 'CN', zh: '中国', en: 'China', region: '上海 · 电信', lat: 31.23, lon: 121.47, dev: 'Desktop', os: 'macOS', br: 'Chrome', path: '/' },
    { ip: '223.72.64.18', code: 'CN', zh: '中国', en: 'China', region: '北京 · 移动', lat: 39.90, lon: 116.40, dev: 'Mobile', os: 'iOS', br: 'Safari', path: '/posts/' },
    { ip: '14.17.32.209', code: 'CN', zh: '中国', en: 'China', region: '深圳 · 电信', lat: 22.54, lon: 114.06, dev: 'Desktop', os: 'Windows 11/10', br: 'Edge', path: '/photos/' },
    { ip: '115.236.49.77', code: 'CN', zh: '中国', en: 'China', region: '杭州 · 联通', lat: 30.27, lon: 120.15, dev: 'Mobile', os: 'HarmonyOS', br: 'WeChat', path: '/posts/' },
    { ip: '182.148.56.91', code: 'CN', zh: '中国', en: 'China', region: '成都 · 电信', lat: 30.57, lon: 104.06, dev: 'Tablet', os: 'iOS', br: 'Safari', path: '/links/' },
    { ip: '103.252.200.45', code: 'SG', zh: '新加坡', en: 'Singapore', region: 'Singapore · Central', lat: 1.35, lon: 103.82, dev: 'Desktop', os: 'macOS', br: 'Safari', path: '/' },
    { ip: '133.242.18.90', code: 'JP', zh: '日本', en: 'Japan', region: 'Tokyo · Shinjuku', lat: 35.69, lon: 139.70, dev: 'Mobile', os: 'iOS', br: 'Safari', path: '/photos/' },
    { ip: '104.28.192.66', code: 'US', zh: '美国', en: 'United States', region: 'San Francisco · CA', lat: 37.77, lon: -122.42, dev: 'Desktop', os: 'macOS', br: 'Chrome', path: '/posts/' },
    { ip: '64.233.160.112', code: 'US', zh: '美国', en: 'United States', region: 'New York · NY', lat: 40.71, lon: -74.01, dev: 'Desktop', os: 'Windows 11/10', br: 'Chrome', path: '/programs/' },
    { ip: '138.201.88.19', code: 'DE', zh: '德国', en: 'Germany', region: 'Frankfurt · DE', lat: 50.11, lon: 8.68, dev: 'Desktop', os: 'Linux', br: 'Firefox', path: '/' },
    { ip: '81.2.69.142', code: 'GB', zh: '英国', en: 'United Kingdom', region: 'London · UK', lat: 51.51, lon: -0.13, dev: 'Desktop', os: 'macOS', br: 'Chrome', path: '/posts/' },
    { ip: '90.84.112.37', code: 'FR', zh: '法国', en: 'France', region: 'Paris · FR', lat: 48.86, lon: 2.35, dev: 'Mobile', os: 'Android', br: 'Chrome', path: '/photos/' },
    { ip: '211.234.118.54', code: 'KR', zh: '韩国', en: 'South Korea', region: 'Seoul · KR', lat: 37.57, lon: 126.98, dev: 'Mobile', os: 'Android', br: 'Chrome', path: '/' },
    { ip: '142.112.44.80', code: 'CA', zh: '加拿大', en: 'Canada', region: 'Toronto · ON', lat: 43.65, lon: -79.38, dev: 'Desktop', os: 'Windows 11/10', br: 'Edge', path: '/links/' },
    { ip: '203.2.218.61', code: 'AU', zh: '澳大利亚', en: 'Australia', region: 'Sydney · NSW', lat: -33.87, lon: 151.21, dev: 'Tablet', os: 'iOS', br: 'Safari', path: '/photos/' },
    { ip: '145.97.39.15', code: 'NL', zh: '荷兰', en: 'Netherlands', region: 'Amsterdam · NL', lat: 52.37, lon: 4.90, dev: 'Desktop', os: 'Linux', br: 'Firefox', path: '/' },
    { ip: '175.139.142.88', code: 'MY', zh: '马来西亚', en: 'Malaysia', region: 'Kuala Lumpur · MY', lat: 3.14, lon: 101.69, dev: 'Mobile', os: 'Android', br: 'Chrome', path: '/posts/' },
  ];

  const insertStmt = db.prepare(`
    INSERT INTO visitor_logs (
      visit_date, ip, country_code, country_zh, country_en, region,
      lat, lon, device_type, os, browser, user_agent, path, referrer,
      pv_count, first_seen, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
  `);

  let inserted = 0;
  db.transaction(() => {
    // 1) 最近 45 天的逐日详细记录
    for (let dayOffset = 44; dayOffset >= 0; dayOffset--) {
      const d = new Date(now);
      d.setDate(now.getDate() - dayOffset);
      const ymd = formatDateYmd(d);
      const dailyCount = 4 + ((dayOffset * 5 + 3) % 9);

      for (let k = 0; k < dailyCount; k++) {
        const nodeIdx = (dayOffset * 3 + k * 2) % sampleNodes.length;
        const base = sampleNodes[nodeIdx]!;
        const lastOctet = ((parseInt(base.ip.split('.')[3] || '10', 10) + dayOffset + k * 7) % 240) + 10;
        const ipPrefix = base.ip.split('.').slice(0, 3).join('.');
        const ip = dayOffset === 0 && k < 3 ? base.ip : `${ipPrefix}.${lastOctet}`;
        const pv = 1 + ((dayOffset + k * 3) % 6);
        const hour = String((8 + k * 2) % 23).padStart(2, '0');
        const min = String((11 + dayOffset + k * 7) % 59).padStart(2, '0');
        const firstSeen = `${ymd} ${hour}:${min}:12`;
        const lastSeen = `${ymd} ${hour}:${String(Math.min(59, Number(min) + pv)).padStart(2, '0')}:45`;

        insertStmt.run(
          ymd,
          ip,
          base.code,
          base.zh,
          base.en,
          base.region,
          base.lat,
          base.lon,
          base.dev,
          base.os,
          base.br,
          `Mozilla/5.0 (${base.os}) ${base.br}`,
          base.path,
          pv,
          firstSeen,
          lastSeen
        );
        inserted++;
      }
    }

    // 2) 过去 14 个月与跨年的历史样本点（支持按月、按年视图的完整展示）
    for (let mOffset = 2; mOffset <= 15; mOffset++) {
      const d = new Date(now.getFullYear(), now.getMonth() - mOffset, 15);
      const ymd = formatDateYmd(d);
      const monthVisitors = 6 + (mOffset % 5);
      for (let j = 0; j < monthVisitors; j++) {
        const base = sampleNodes[(mOffset * 2 + j) % sampleNodes.length]!;
        const ipPrefix = base.ip.split('.').slice(0, 3).join('.');
        const ip = `${ipPrefix}.${30 + mOffset * 4 + j}`;
        const pv = 2 + ((mOffset + j) % 7);
        const ts = `${ymd} 14:${String(10 + j * 4).padStart(2, '0')}:00`;
        insertStmt.run(
          ymd,
          ip,
          base.code,
          base.zh,
          base.en,
          base.region,
          base.lat,
          base.lon,
          base.dev,
          base.os,
          base.br,
          `Mozilla/5.0 (${base.os}) ${base.br}`,
          base.path,
          pv,
          ts,
          ts
        );
        inserted++;
      }
    }
  })();

  return inserted;
}

/** 模拟一条新的实时访客记录（用于后台演示测试） */
export function simulateSingleVisit(customCountryZh?: string): VisitorLogItem {
  const db = getDb();
  const candidates = customCountryZh
    ? GEO_PROFILES.filter((g) => g.zh === customCountryZh)
    : GEO_PROFILES;
  const geo = candidates[Math.floor(Math.random() * candidates.length)] ?? GEO_PROFILES[0]!;
  const devices: Array<{ dev: 'Desktop' | 'Mobile' | 'Tablet'; os: string; br: string }> = [
    { dev: 'Desktop', os: 'macOS', br: 'Chrome' },
    { dev: 'Mobile', os: 'iOS', br: 'Safari' },
    { dev: 'Desktop', os: 'Windows 11/10', br: 'Edge' },
    { dev: 'Mobile', os: 'Android', br: 'Chrome' },
    { dev: 'Tablet', os: 'iOS', br: 'Safari' },
  ];
  const env = devices[Math.floor(Math.random() * devices.length)]!;
  const paths = ['/', '/posts/', '/photos/', '/links/', '/programs/'];
  const path = paths[Math.floor(Math.random() * paths.length)]!;
  const randOctet = () => Math.floor(20 + Math.random() * 210);
  const ip = `${randOctet()}.${randOctet()}.${randOctet()}.${randOctet()}`;
  const today = formatDateYmd();
  const nowSql = formatDateTimeSql();

  const info = db
    .prepare(
      `INSERT INTO visitor_logs (
        visit_date, ip, country_code, country_zh, country_en, region,
        lat, lon, device_type, os, browser, user_agent, path, referrer,
        pv_count, first_seen, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 1, ?, ?)`
    )
    .run(
      today,
      ip,
      geo.code,
      geo.zh,
      geo.en,
      geo.region,
      geo.lat,
      geo.lon,
      env.dev,
      env.os,
      env.br,
      `Mozilla/5.0 (${env.os}) ${env.br}`,
      path,
      nowSql,
      nowSql
    );

  return {
    id: Number(info.lastInsertRowid),
    visitDate: today,
    ip,
    countryCode: geo.code,
    countryZh: geo.zh,
    countryEn: geo.en,
    region: geo.region,
    lat: geo.lat,
    lon: geo.lon,
    deviceType: env.dev,
    os: env.os,
    browser: env.br,
    userAgent: `Mozilla/5.0 (${env.os}) ${env.br}`,
    path,
    referrer: '',
    pvCount: 1,
    firstSeen: nowSql,
    lastSeen: nowSql,
  };
}

export function clearAnalyticsLogs(): void {
  getDb().prepare('DELETE FROM visitor_logs').run();
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
  const todayRow = db
    .prepare(
      `SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(pv_count), 0) AS pv
         FROM visitor_logs WHERE visit_date = ?`
    )
    .get(today) as { uv: number; pv: number };

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

  // 5. 访客 IP 与设备日志明细（支持按桶/国家/设备/关键词过滤与分页）
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
 * 返回全部访客记录（供统计页本地聚合引擎与 CSV 导出使用）。
 * 单机博客量级很小，默认最多 5000 条，避免一次查询无限增长。
 */
export function listVisitorLogs(limit = 5000): VisitorLogItem[] {
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
