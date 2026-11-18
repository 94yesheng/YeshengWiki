/**
 * 访客统计的 IP / CIDR 黑名单（含已知爬虫 IP 与国内外主流云机房 CIDR 段）。
 *
 * 背景：UA、扫描路径、机房 IP 信誉能过滤掉大部分机器人，但分布式爬虫会
 * 使用云服务器池和完整浏览器请求头。这里提供显式的 IP + CIDR + IPv6 前缀拦截规则：
 * 命中的 IP 连 visitor_logs 都不会写入，后台统计和 CSV 也不会出现。
 *
 * 规则来源：
 *   1. 下方 DEFAULT_BOT_IP_RULES 中的已知批量爬虫 IP 与主流云机房/网络空间测绘 CIDR 段；
 *   2. 环境变量 BLOG_BOT_IP_RULES（逗号、空格或换行分隔，支持 IPv4 CIDR 与 IPv6 前缀），
 *      重启 blog.service 后生效。
 */

const DEFAULT_BOT_IP_RULES = `
# 2026-10-30 11:24 分布式扫描（同一秒分别访问 /、/posts、/programs、/photos、/links）
106.32.141.134
183.162.106.25
123.133.68.239
113.122.146.193
113.122.134.141
223.243.65.107
# 2026-10-30 11:36 批量抓取文章（9 秒内 6 个 IP 各抓一篇）
36.46.160.92
36.101.117.247
58.17.94.60
61.128.27.2
203.132.62.195
106.6.25.67
# 引荐垃圾（five.co.in/redirect.php）
190.189.220.125
168.205.62.83
# 极旧 Chrome UA / 机房 IP / 高频刷新
183.134.40.84
161.115.237.172
37.66.41.21

# 阿里云 ECS / 轻量应用服务器常见公网机房 CIDR 段
8.128.0.0/10
39.96.0.0/12
47.88.0.0/13
47.96.0.0/11
101.132.0.0/15
101.200.0.0/15
106.14.0.0/15
112.124.0.0/14
114.55.0.0/16
118.31.0.0/16
118.178.0.0/16
120.24.0.0/14
120.55.0.0/16
120.76.0.0/14
121.40.0.0/14
139.196.0.0/16
139.224.0.0/16

# 腾讯云 CVM / 轻量云服务器常见公网机房 CIDR 段
42.192.0.0/14
43.128.0.0/10
49.232.0.0/14
81.68.0.0/14
82.156.0.0/15
101.32.0.0/14
106.52.0.0/14
111.229.0.0/16
118.24.0.0/15
119.28.0.0/15
119.45.0.0/16
121.4.0.0/15
122.51.0.0/16
124.220.0.0/14
129.204.0.0/16
129.211.0.0/16
132.232.0.0/16
134.175.0.0/16
139.155.0.0/16
139.186.0.0/16
139.199.0.0/16
140.143.0.0/16
150.109.0.0/16
152.136.0.0/16
159.75.0.0/16
162.14.0.0/16
175.24.0.0/14
182.254.0.0/16
193.112.0.0/16
203.195.128.0/17
211.159.128.0/17
212.64.0.0/16
212.129.128.0/17

# 华为云 / UCloud / 火山引擎机房常见段
1.92.0.0/14
106.75.0.0/16
114.115.128.0/17
114.116.0.0/16
117.50.0.0/16
119.3.0.0/16
121.36.0.0/15
122.112.128.0/17
123.60.0.0/16
124.70.0.0/15
139.9.0.0/16
139.159.128.0/17

# 海外高频扫描机房（Censys / Shodan / DigitalOcean / Vultr / Hetzner / OVH）
66.240.192.0/18
71.6.128.0/17
80.82.77.0/24
89.248.160.0/19
93.174.95.0/24
104.131.0.0/16
104.236.0.0/16
128.199.0.0/16
134.122.0.0/16
134.209.0.0/16
137.184.0.0/16
138.68.0.0/16
138.197.0.0/16
139.59.0.0/16
142.93.0.0/16
143.110.128.0/17
143.198.0.0/16
146.190.0.0/16
157.230.0.0/16
157.245.0.0/16
159.65.0.0/16
159.89.0.0/16
159.203.0.0/16
159.223.0.0/16
161.35.0.0/16
162.243.0.0/16
164.90.128.0/17
164.92.0.0/16
165.22.0.0/16
165.227.0.0/16
165.232.0.0/16
167.71.0.0/16
167.99.0.0/16
167.172.0.0/16
170.64.128.0/17
174.138.0.0/17
178.62.0.0/16
178.128.0.0/16
188.166.0.0/16
192.241.128.0/17
198.199.64.0/18
198.211.96.0/19
206.189.0.0/16
207.154.192.0/18
209.97.128.0/18
209.38.0.0/16
162.142.125.0/24
167.94.138.0/24
167.94.145.0/24
167.94.146.0/24
167.248.133.0/24
199.45.154.0/24
199.45.155.0/24
2602:80d:1000::/44
`;

interface BotIpRule {
  source: string;
  exact?: string;
  base?: number;
  bits?: number;
  ipv6Prefix?: string;
}

function parseIpv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result * 256 + n) >>> 0;
  }
  return result >>> 0;
}

function normalizeRuleIp(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^::ffff:/, '');
}

function parseRules(raw: string): BotIpRule[] {
  const rules: BotIpRule[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleanLine = line.split('#')[0]?.trim();
    if (!cleanLine) continue;

    for (const token of cleanLine.split(/[,\s]+/)) {
      if (!token) continue;
      if (token.includes('/')) {
        const [baseRaw, bitsRaw] = token.split('/', 2);
        if (baseRaw && baseRaw.includes(':')) {
          const prefix = normalizeRuleIp(baseRaw).replace(/::$/, ':');
          if (prefix) rules.push({ source: token, ipv6Prefix: prefix });
          continue;
        }
        const base = parseIpv4(baseRaw ?? '');
        const bits = Number(bitsRaw);
        if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
        rules.push({ source: token, base, bits });
        continue;
      }

      const exact = normalizeRuleIp(token);
      if (exact) rules.push({ source: token, exact });
    }
  }
  return rules;
}

const ENV_RULES = process.env.BLOG_BOT_IP_RULES ?? '';
const RULES = [...parseRules(DEFAULT_BOT_IP_RULES), ...parseRules(ENV_RULES)];

const EXACT_RULES = new Set(
  RULES.filter((r) => r.exact).map((r) => r.exact as string)
);
const CIDR_RULES = RULES.filter((r) => r.base !== undefined && r.bits !== undefined);
const IPV6_PREFIX_RULES = RULES.filter((r) => Boolean(r.ipv6Prefix));

function ipv4InCidr(ipInt: number, base: number, bits: number): boolean {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((base & mask) >>> 0);
}

/** 返回命中的规则；未命中返回 null。 */
export function matchBotIpRule(ipRaw: string): BotIpRule | null {
  const ip = normalizeRuleIp(ipRaw);
  if (!ip) return null;
  if (EXACT_RULES.has(ip)) return { source: ip, exact: ip };

  if (ip.includes(':')) {
    for (const rule of IPV6_PREFIX_RULES) {
      if (rule.ipv6Prefix && ip.startsWith(rule.ipv6Prefix)) return rule;
    }
    return null;
  }

  const ipv4 = parseIpv4(ip);
  if (ipv4 === null) return null;
  for (const rule of CIDR_RULES) {
    if (ipv4InCidr(ipv4, rule.base as number, rule.bits as number)) return rule;
  }
  return null;
}

export function isBlockedBotIp(ipRaw: string): boolean {
  return matchBotIpRule(ipRaw) !== null;
}

export function getBotIpRuleCount(): number {
  return RULES.length;
}
