/**
 * turndown-plugin-gfm 没有官方类型包（npm 上是 404），这里补一个最小声明。
 *
 * 它提供三样 turndown 核心没有的东西：**删除线** `~~x~~`、表格、任务列表。
 * 删除线必须补 —— 你的文章里用过它（`<s>主要是我也不会</s>`），
 * 不补的话转换时标签会被丢掉、只剩文字（往返测试抓到过）。
 */
declare module 'turndown-plugin-gfm' {
  export const gfm: (service: unknown) => void;
  export const tables: (service: unknown) => void;
  export const strikethrough: (service: unknown) => void;
  export const taskListItems: (service: unknown) => void;
}
