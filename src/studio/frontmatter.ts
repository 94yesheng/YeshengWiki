/**
 * frontmatter 的解析与写回 —— 后台最重要的一块
 *
 * 【为什么要这么麻烦】现成 CMS 保存时会把整个 frontmatter 重新序列化一遍：字段顺序
 * 可能变、引号风格可能变、日期可能被写成别的时间格式。你只是改了个标题，diff 里却
 * 混进一堆无关改动，看不清到底改了什么。
 *
 * 这里的做法是**外科式**的：
 *   · 打开文件时把 frontmatter 的原始行**按 key 分组**留着
 *   · 保存时，没动过的 key 原样吐回它那几行（连引号、缩进、注释都不变）
 *   · 只有真正改动过的 key 才重新序列化，并且放在它原来的位置上
 *   · 新出现的 key 追加在末尾
 * 结果：diff 里只有你动过的东西。
 */
import * as YAML from 'js-yaml';

export interface FrontmatterBlock {
  key: string;
  /** 该 key 占据的原始行（含块状数组的后续行） */
  lines: string[];
}

export interface ParsedFile {
  /** 解析出的字段值 */
  data: Record<string, unknown>;
  /** 正文 */
  body: string;
  /** frontmatter 的原始行按 key 归组，顺序即文件里的顺序 */
  layout: FrontmatterBlock[];
  /** 原文 —— 保存后拿它比对，就能判断"这次保存其实没改动任何东西" */
  raw: string;
  /** 结尾那个 --- 与正文之间的换行（有的文件是 \n，有的是 \n\n），写回时照原样 */
  separator: string;
}

/** 匹配 `key:` 开头的行（YAML 顶层键） */
const KEY_LINE = /^([A-Za-z_][\w-]*):(\s|$)/;

/**
 * 把 frontmatter 文本切成"按 key 归组"的行。
 * 一个 key 会吃掉它后面那些更缩进的行（块状数组 `- a`、嵌套对象都属于它）。
 */
export function splitFrontmatter(text: string): FrontmatterBlock[] {
  const blocks: FrontmatterBlock[] = [];
  for (const line of text.split('\n')) {
    const m = KEY_LINE.exec(line);
    if (m) {
      blocks.push({ key: m[1]!, lines: [line] });
      continue;
    }
    // 续行（缩进的行、`- ` 项、空行）挂到上一个 key 上
    const last = blocks[blocks.length - 1];
    if (last) last.lines.push(line);
    // 开头的空行之类直接忽略
  }
  // 每个 key 的续行里，去掉尾部多余空行（它们不属于这个 key）
  for (const b of blocks) {
    while (b.lines.length > 1 && b.lines[b.lines.length - 1]!.trim() === '') b.lines.pop();
  }
  return blocks;
}

/** 解析一篇文章：frontmatter + 正文 */
export function parsePost(raw: string): ParsedFile | null {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  // 第三个捕获组是 --- 与正文之间的换行数：有的文件紧挨着写，有的空一行
  const m = /^---\n([\s\S]*?)\n---(\n*)([\s\S]*)$/.exec(text);
  if (!m) return null;
  const fmText = m[1]!;
  const separator = m[2] || '\n';
  const body = m[3] ?? '';
  let data: Record<string, unknown> = {};
  try {
    data = (YAML.load(fmText) as Record<string, unknown>) ?? {};
  } catch {
    data = {};
  }
  return { data, body, layout: splitFrontmatter(fmText), raw: text, separator };
}

/** 纯 JSON 文件（照片墙、友链、站点配置）也用同一套解析，方便统一处理 */
export function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 日期字段写成裸的 2026-02-24，而不是被 YAML 序列化成带引号的字符串 */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 把一个值序列化成 frontmatter 里的行（可能多行） */
export function serializeField(key: string, value: unknown): string[] {
  // 日期：保持裸写法，和现有文章的格式一致（写成带引号的字符串也能用，但看着别扭）
  if (typeof value === 'string' && BARE_DATE.test(value) && /date/i.test(key)) {
    return [`${key}: ${value}`];
  }
  // 字符串用双引号 —— 与现有文章的写法一致。JSON 的转义规则正好是 YAML 双引号风格
  // 的子集，所以直接借它，不必自己处理转义。
  if (typeof value === 'string') return [`${key}: ${JSON.stringify(value)}`];
  if (typeof value === 'number' || typeof value === 'boolean') return [`${key}: ${String(value)}`];
  // 数组 / 对象写成行内的 flow 形式（tags: [技术, 工具]）。
  // 注意：不能对整个 {key: value} 对象用 flowLevel，那会把顶层也变成 {…} —— 踩过；
  // 所以只把值本身 dump 成 flow，再手动拼上 "key: "。
  const dumped = YAML.dump(value, { flowLevel: 0, lineWidth: -1, noRefs: true }).replace(/\n$/, '');
  return `${key}: ${dumped}`.split('\n');
}

/**
 * 生成新的文章全文。
 *
 * @param parsed   打开时的解析结果（带着原始行）
 * @param changed  只包含**值发生变化**的字段
 * @param body     新的正文
 */
export function buildPost(parsed: ParsedFile, changed: Record<string, unknown>, body: string): string {
  const originalKeys = new Set(parsed.layout.map((b) => b.key));
  const lines: string[] = [];

  for (const block of parsed.layout) {
    if (Object.prototype.hasOwnProperty.call(changed, block.key)) {
      const value = changed[block.key];
      // 空串 = 界面上"没填"。这种要**整行删掉**，绝不能写成 `key: ""` ——
      // 内容集合的 schema 里 `updatedDate: z.coerce.date()` 会把空串直接判非法，
      // 于是**整站构建失败**（不是"后台少个字段"那么轻）。踩过，pubDate 有同一个洞。
      if (value === '' || value === undefined || value === null) continue;
      lines.push(...serializeField(block.key, value));
    } else {
      lines.push(...block.lines);
    }
  }

  // 新增字段（比如给一篇没标过草稿的文章打开草稿开关）追加在末尾
  for (const [key, value] of Object.entries(changed)) {
    if (originalKeys.has(key)) continue;
    // 不因为「关掉草稿 / 关掉自动记修订」就往文件里塞一行 false
    if ((key === 'draft' || key === 'autoUpdated') && value === false) continue;
    if (value === '' || value === undefined || value === null) continue;
    lines.push(...serializeField(key, value));
  }

  const fm = lines.filter((l, i, arr) => !(l.trim() === '' && i === arr.length - 1)).join('\n');
  const cleanBody = body.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  // 正文一个字都没有（刚暂存下来的草稿就是这样）：收在 `---` 那一行，别在末尾留个空行 ——
  // 留了的话文件看起来像"少了点什么"，而它其实只是还没写
  if (!cleanBody) return `---\n${fm}\n---\n`;
  // separator 照原样：有的文章是 `---` 紧接着正文，有的空一行。
  // 固定写死会在每次保存时给正文前面多加/少一个空行，整个正文便整体位移一行。
  return `---\n${fm}\n---${parsed.separator}${cleanBody}\n`;
}

/**
 * 过滤掉"写了也等于没写"的改动。
 *
 * 界面里的字段缓冲用空串表示"没填"，所以 updatedDate 这种可选字段会被 diffFields
 * 判成"变了"，但它其实不该写进文件。这里把这类改成别写。
 */
export function effectiveChanges(parsed: ParsedFile, changed: Record<string, unknown>): Record<string, unknown> {
  const existing = new Set(parsed.layout.map((b) => b.key));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changed)) {
    if (existing.has(key)) {
      out[key] = value;
      continue;
    }
    if (value === '' || value === undefined || value === null) continue;
    // 空数组同理：界面上"一个标签都没加"跟"没填"是一回事，不该为它写一行 `tags: []`
    // （文件里原本**有**这个键的走不到这儿 —— 那种情况是"把标签全删了"，得写下去）
    if (Array.isArray(value) && value.length === 0) continue;
    // 「开关」字段关掉 = 回到缺省，不为它写一行（autoUpdated 同理：缺省就是跟随全局）
    if ((key === 'draft' || key === 'autoUpdated') && value === false) continue;
    out[key] = value;
  }
  return out;
}

/** JSON 文件按项目里既有的排版写回：两空格缩进 + 末尾换行 */
export function buildJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}
