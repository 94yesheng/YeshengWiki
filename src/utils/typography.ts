/**
 * 中文排版工具
 */

/* 汉字、CJK 标点、全角字符，以及破折号 */
const CJK = '\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef\\u2014';

/*
 * 只处理拉丁字母，刻意不处理数字。
 *
 * 数字在中英混排里绝大多数是跟中文量词连着的 ——「3月9号」「1.21.4版本」
 * 「Java 21」。若一并加空格就会变成「3 月 9 号」，那不是排版，是错字。
 * 真正需要空隙的是字母与汉字直接相邻的场合：「Mc小型服务器」→「Mc 小型服务器」。
 *
 * 代价是「3.8以上」这种数字加虚词的情况不会加空隙。两害相权，
 * 宁可少加也不能加错。
 */
const LETTER = 'A-Za-z';

const RE_CJK_THEN_LETTER = new RegExp(`([${CJK}])([${LETTER}])`, 'g');
const RE_LETTER_THEN_CJK = new RegExp(`([${LETTER}])([${CJK}])`, 'g');

/**
 * 在中英文之间插入空隙（俗称「盘古之白」）。
 *
 * 这是中文排版的通行做法，不是改动原文 —— 原始文本仍完整存在
 * frontmatter 里，只在渲染时处理。
 *
 * 只对标题这类纯文本用，不要用在正文上：正文里有代码块和行内代码，
 * 插空格会把 <code> 里的内容也改掉。
 */
export function cjkSpacing(text: string): string {
  return text
    .replace(RE_CJK_THEN_LETTER, '$1 $2')
    .replace(RE_LETTER_THEN_CJK, '$1 $2');
}
