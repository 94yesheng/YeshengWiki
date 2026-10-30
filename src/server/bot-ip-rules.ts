/**
 * 访客统计的 IP / CIDR 黑名单。
 *
 * 背景：UA、扫描路径、机房 IP 信誉能过滤掉大部分机器人，但分布式爬虫会
 * 使用住宅代理和完整浏览器请求头，单看 UA 很难识别。这里提供一条显式的
 * 批量规则：命中的 IP 连 visitor_logs 都不会写入，后台统计和 CSV 也不会出现。
 *
 * 规则来源：
 *   1. 下方 DEFAULT_BOT_IP_RULES 中的已知批量爬虫 IP；
 *   2. 环境变量 BLOG_BOT_IP_RULES（逗号、空格或换行分隔，支持 IPv4 CIDR），
 *      重启 blog.service 后生效。
 *
 * 规则只支持精确 IP 和 IPv4 CIDR；IPv6 仅支持精确匹配。
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
`;

interface BotIpRule {
  source: string;
  exact?: string;
  base?: number;
  bits?: number;
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
        const base = parseIpv4(baseRaw);
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
