/**
 * 中文日期工具
 *
 * 全站日期一律用中文数字呈现（二〇二六年三月十三日），
 * 这是「编年」这个设计语言的骨架，不要在各处手写。
 */

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 2026 → 二〇二六（年份逐字读，不按数值读） */
export function chineseYear(year: number): string {
  return String(year)
    .split('')
    .map((d) => DIGITS[Number(d)])
    .join('');
}

/** 1 → 一, 10 → 十, 11 → 十一, 12 → 十二 */
export function chineseMonth(month: number): string {
  if (month <= 10) return month === 10 ? '十' : DIGITS[month];
  return '十' + DIGITS[month - 10];
}

/** 1 → 一, 10 → 十, 15 → 十五, 20 → 二十, 24 → 二十四, 31 → 三十一 */
export function chineseDay(day: number): string {
  if (day <= 10) return day === 10 ? '十' : DIGITS[day];
  if (day < 20) return '十' + DIGITS[day - 10];
  if (day === 20) return '二十';
  if (day < 30) return '二十' + DIGITS[day - 20];
  if (day === 30) return '三十';
  return '三十' + DIGITS[day - 30];
}

/** 2026-03-13 → 二〇二六年三月十三日（文章页题头用） */
export function chineseFullDate(date: Date): string {
  return `${chineseYear(date.getFullYear())}年${chineseMonth(date.getMonth() + 1)}月${chineseDay(date.getDate())}日`;
}

/** 2026-03-13 → 三月十三日（列表页日期栏用） */
export function chineseMonthDay(date: Date): string {
  // 一律带「日」：三月九日、三月十三日、二月二十四日。
  // 光写「三月九」在中文里不成词，读着别扭。
  return `${chineseMonth(date.getMonth() + 1)}月${chineseDay(date.getDate())}日`;
}

/** 2026-03-13 → 2026-03-13，给 <time datetime> 和照片文件命名用 */
export function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 2026-03-13 → 2026.03.13，照片页那种紧凑写法 */
export function dottedDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${m}.${d}`;
}

/**
 * 中文阅读时长估算。
 * 中文阅读速度约每分钟 300–500 字，取 300 偏保守（技术文章要慢一些）。
 */
export function readingTime(body: string): { chars: number; minutes: number } {
  // 去掉 Markdown 语法和空白，只留下真正要读的字
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')      // 代码块不计入阅读时间
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/[#>*_~\-]/g, '')
    .replace(/\s+/g, '');

  const chars = text.length;
  return { chars, minutes: Math.max(1, Math.round(chars / 300)) };
}
