/**
 * 时间线的分组：**年 → 月 → 条目**，三层。
 *
 * 文章列表页和照片页共用这一份 —— 两页的差别只在于「条目」是什么
 * （文章 vs 照片墙），分组规则完全一样，所以没必要各写一份。
 *
 * 【为什么不用 posts.ts 的 groupByYear / photos.ts 的 groupWallsByYear】
 * 那两个只分到「年」这一层，做不出「年下面是月」的时间线。这个函数把两件事
 * 合并了，顺带统一了「没有日期的怎么排」—— 照片墙允许不标时间，
 * 那种条目归到最后一年（year 为 null）。
 *
 * 这里只产出**数字**（年、月），不产出「二〇二六」「三月」这种文案 ——
 * 和项目里 groupByYear 的做法一致：格式化的活交给组件（utils/date.ts 里那几个函数）。
 */

export interface TimelineItem<T> {
  /** 没有日期就是 null（照片墙允许不标时间） */
  date: Date | null;
  data: T;
}

export interface TimelineMonth<T> {
  /** 1–12；null = 未标注时间 */
  month: number | null;
  items: TimelineItem<T>[];
}

export interface TimelineYear<T> {
  /** null = 未标注时间 */
  year: number | null;
  months: TimelineMonth<T>[];
}

/**
 * 按 年 → 月 分组。年和月都倒序（新的在前），未标注时间的整块排到最后。
 * 同一月内保持传入顺序 —— 调用方给的本来就是新到旧排好的。
 */
export function groupByYearMonth<T>(items: TimelineItem<T>[]): TimelineYear<T>[] {
  const dated = new Map<number, Map<number, TimelineItem<T>[]>>();
  const undated: TimelineItem<T>[] = [];

  for (const item of items) {
    if (!item.date) {
      undated.push(item);
      continue;
    }
    const y = item.date.getFullYear();
    const m = item.date.getMonth() + 1;
    let months = dated.get(y);
    if (!months) {
      months = new Map();
      dated.set(y, months);
    }
    const list = months.get(m);
    if (list) list.push(item);
    else months.set(m, [item]);
  }

  const years: TimelineYear<T>[] = [...dated.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, list]) => ({ month, items: list })),
    }));

  if (undated.length > 0) {
    years.push({ year: null, months: [{ month: null, items: undated }] });
  }

  return years;
}
