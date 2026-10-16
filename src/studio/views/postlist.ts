/**
 * 左栏的文章列表 —— 时间轴 + 标签筛选。
 *
 * 【为什么要自己写一份，而不是直接用访客侧那两个组件】
 * /studio/ 只加载 tokens / studio / fab 三份 CSS，`Timeline.astro` 的样式是**组件作用域**的
 * （Astro 会给元素加上 `data-astro-cid-*`），在后台的页面里根本不会生效。
 * 所以这里照它的**结构和交互**重做一份，尺寸按左栏只有 17rem 收过：
 *   · 轴线、年→月→条目三层、点标题折叠
 *   · 折叠动画同样是 `grid-template-rows: 0fr → 1fr`（少数几个不用知道内容高度就能做
 *     高度动画的办法），子项按 `--i/--n` 错峰冒出来
 *   · 标签筛选的三条规则也照搬：逐条开关 → 空掉的月/年整块收掉 → 筛选时一律展开
 * 分组用的是访客侧同一份 `groupByYearMonth`，所以"未标注时间的排最后"这类规则天然一致。
 *
 * 【和访客侧唯一的实质差别：状态不放 DOM 上】
 * 访客页渲染一次就不再重画，所以折叠状态直接存在 `aria-expanded` / `data-open` 上就够了。
 * 后台**每次改动都会重画左栏**（选中、暂存、保存……），DOM 会被整块换掉 ——
 * 所以折叠与筛选都记在 `state` 里（`listCollapsed` / `tagFilter`），重画时照着恢复。
 * 折叠那一下仍然只改 DOM、不重画，动画才跑得起来。
 */
import { groupByYearMonth } from '../../utils/timeline';
import { chineseDay, chineseMonth, chineseYear } from '../../utils/date';
import { isStagedGone, isStagedNew, state } from '../state';
import { esc } from '../ui';
import type { PostEntry } from '../content';

/** 列表里要显示的文章：待删的那几条不画（但仍在 state.posts 里，丢弃暂存时会回来） */
function visiblePosts(): PostEntry[] {
  return state.posts.filter((p) => !isStagedGone(p));
}

/** 文章里的标签 → 计数（和访客侧 collectTags 同一套排序：多的在前，同数按拼音） */
function tagCounts(posts: PostEntry[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const tags = p.parsed.data.tags;
    if (!Array.isArray(tags)) continue;
    for (const t of tags) counts.set(String(t), (counts.get(String(t)) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hans-CN'));
}

/** 日期字符串 → Date（本地零点）。格式不对就算"未标注时间"，和照片墙一个待遇 */
function postDate(p: PostEntry): Date | null {
  const raw = String(p.parsed.data.pubDate ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : null;
}

function postTags(p: PostEntry): string[] {
  const tags = p.parsed.data.tags;
  return Array.isArray(tags) ? tags.map(String) : [];
}

/**
 * 一条文章。整个是按钮 —— 点了就选中它。
 *
 * 两行，**标签和标题的位置是用户点名调换过的**（2026-10-16）：
 *   第一行：「日」+ 标签
 *   第二行：标题（**独占一行**）
 * 这么换是因为左栏只有 17rem：标题原来挤在「日」右边只剩 ~128px，现在整行都是它的，
 * 而标签本来就不长、跟「日」挤一行正好。标题那一行的左端**停在「日」那一列的左边界上**，
 * 不越过它（再往左就压到轴线/日期上了）。
 */
function itemHtml(p: PostEntry): string {
  const date = postDate(p);
  const title = String(p.parsed.data.title ?? p.id);
  const draft = p.parsed.data.draft === true;
  const tags = postTags(p);
  const day = date ? `${chineseDay(date.getDate())}日` : '无日期';
  return `<div class="tl-item${state.justAdded === p.id ? ' is-new' : ''}" data-entry
       data-tags="${esc(tags.join(','))}">
    <button data-id="${esc(p.id)}" aria-current="${state.selected === p.id}">
      <span class="tl-day">${esc(day)}</span>
      <span class="tl-meta">${esc(tags.length ? tags.join(' · ') : '无标签')}${
        isStagedNew(p) ? ' · <span class="st-tag-sub">未保存</span>' : ''
      }</span>
      <span class="tl-name">${esc(title)}${draft ? ' <span class="tl-mark">草稿</span>' : ''}</span>
    </button>
  </div>`;
}

/**
 * 整块列表的 HTML：筛选条 + 「＋」+ 时间轴。
 * 筛选时：不匹配的条目不画、空掉的月/年不画、并且**一律展开**（从 state 的折叠表里清掉）——
 * 后者和访客侧第 3 条规则同一个意思：筛出来的东西要是折着的，等于白筛。
 */
export function postListHtml(addRow: string): string {
  const all = visiblePosts();
  const tags = tagCounts(all);
  const filter = state.tagFilter;

  const matching = filter ? all.filter((p) => postTags(p).includes(filter)) : all;
  const years = groupByYearMonth(matching.map((p) => ({ date: postDate(p), data: p })));
  // 筛选时清掉折叠状态，让命中的年份/月份都是展开的
  const collapsed = filter ? new Set<string>() : state.listCollapsed;

  const chips = tags.length
    ? `<nav class="chips" aria-label="按标签筛选">
        <button class="chip${filter ? '' : ' chip--active'}" data-tag="">全部<span class="chip-count">${all.length}</span></button>
        ${tags
          .map(
            (t) =>
              `<button class="chip${filter === t.tag ? ' chip--active' : ''}" data-tag="${esc(t.tag)}">${esc(
                t.tag
              )}<span class="chip-count">${t.count}</span></button>`
          )
          .join('')}
      </nav>`
    : '';

  const body = years
    .map((y) => {
      const total = y.months.reduce((n, m) => n + m.items.length, 0);
      const yKey = `y:${y.year ?? 'none'}`;
      const yOpen = !collapsed.has(yKey);
      return `<section class="tl-year" data-year>
        <button class="tl-year-head" data-key="${yKey}" aria-expanded="${yOpen}">
          <span class="tl-year-label">${y.year === null ? '未标注时间' : esc(chineseYear(y.year))}</span>
          <span class="tl-count">${total}</span>
        </button>
        <div class="tl-panel"${yOpen ? ' data-open' : ''}>
          <div class="tl-body" style="--n:${y.months.length}">
            ${y.months
              .map((m, mi) => {
                const mKey = `m:${y.year ?? 'none'}-${m.month ?? 'none'}`;
                const mOpen = !collapsed.has(mKey);
                return `<div class="tl-month">
                  ${
                    m.month === null
                      ? ''
                      : `<button class="tl-month-head" data-key="${mKey}" aria-expanded="${mOpen}">
                           <span class="tl-month-label">${esc(chineseMonth(m.month))}月</span>
                           <span class="tl-count">${m.items.length}</span>
                         </button>`
                  }
                  <div class="tl-panel"${mOpen ? ' data-open' : ''}>
                    <div class="tl-items" style="--n:${m.items.length}">
                      ${m.items.map((it, ii) => `<div class="tl-slot" style="--i:${ii}">${itemHtml(it.data)}</div>`).join('')}
                    </div>
                  </div>
                </div>`;
              })
              .join('')}
          </div>
        </div>
      </section>`;
    })
    .join('');

  // 「＋」那一行由调用方给（app.ts 里别的集合也在用同一个 ADD_ROW）——
  // 位置放在筛选条和时间轴之间：筛选管"看什么"、加一条管"做什么"，分开更清楚
  return `${chips}
    <ul class="st-list">${addRow}</ul>
    ${
      matching.length
        ? `<div class="tl" data-timeline>${body}<div class="tl-start" aria-hidden="true"></div></div>`
        : `<p class="st-empty">${filter ? '没有这个标签的文章。' : '还没有文章。'}</p>`
    }`;
}

/**
 * 接上交互。折叠**只改 DOM**（这样 0fr→1fr 的动画才跑得起来），
 * 同时把状态记进 `state.listCollapsed`，下次重画时照着恢复。
 */
export function wirePostList(box: HTMLElement, rerenderList: () => void): void {
  box.querySelectorAll<HTMLButtonElement>('.tl-year-head, .tl-month-head').forEach((head) => {
    head.addEventListener('click', () => {
      const panel = head.nextElementSibling as HTMLElement | null;
      const key = head.dataset.key;
      if (!panel || !key) return;
      const open = head.getAttribute('aria-expanded') !== 'false';
      head.setAttribute('aria-expanded', String(!open));
      if (open) {
        delete panel.dataset.open;
        state.listCollapsed.add(key);
      } else {
        panel.dataset.open = '';
        state.listCollapsed.delete(key);
      }
    });
  });

  box.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.tagFilter = chip.dataset.tag ?? '';
      state.listCollapsed.clear(); // 筛完一律展开，否则命中的可能是折着的
      rerenderList(); // 只重画列表，不重画整个界面（免得编辑区里的输入框失焦）
    })
  );
}