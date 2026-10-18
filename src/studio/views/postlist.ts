/**
 * 左栏的文章列表 —— 时间轴 + 标签筛选 + 关键词检索（与 /posts/ 归档子页设计语言完全对齐）
 */
import { groupByYearMonth } from '../../utils/timeline';
import { chineseDay, chineseMonth, chineseYear } from '../../utils/date';
import { isStagedGone, isStagedNew, state } from '../state';
import { esc } from '../ui';
import type { PostEntry } from '../content';

function visiblePosts(): PostEntry[] {
  return state.posts.filter((p) => !isStagedGone(p));
}

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

function postDate(p: PostEntry): Date | null {
  const raw = String(p.parsed.data.pubDate ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : null;
}

function postTags(p: PostEntry): string[] {
  const tags = p.parsed.data.tags;
  return Array.isArray(tags) ? tags.map(String) : [];
}

function itemHtml(p: PostEntry, idxNum: number): string {
  const date = postDate(p);
  const title = String(p.parsed.data.title ?? p.id);
  const draft = p.parsed.data.draft === true;
  const featured = p.parsed.data.featured === true;
  const badge = String(p.parsed.data.entryBadge ?? '').trim();
  const tags = postTags(p);
  const day = date ? `${chineseDay(date.getDate())}日` : '无日期';
  const entryNo = String(idxNum).padStart(2, '0');
  return `<div class="tl-item${state.justAdded === p.id ? ' is-new' : ''}" data-entry
       data-tags="${esc(tags.join(','))}">
    <button data-id="${esc(p.id)}" aria-current="${state.selected === p.id}">
      <span class="tl-day">${esc(day)}</span>
      <span class="tl-meta">#${entryNo}${badge ? ` · ${esc(badge)}` : ''} · ${esc(tags.length ? tags.join('·') : '无标签')}${
        isStagedNew(p) ? ' · <span class="st-tag-sub">未保存</span>' : ''
      }</span>
      <span class="tl-name">${esc(title)}${featured ? ' <span class="tl-mark tl-mark--accent">焦点</span>' : ''}${
        draft ? ' <span class="tl-mark">草稿</span>' : ''
      }</span>
    </button>
  </div>`;
}

export function postListHtml(addRow: string): string {
  const all = visiblePosts();
  const tags = tagCounts(all);
  const filter = state.tagFilter;
  const q = state.searchQuery.trim().toLowerCase();

  const matching = all.filter((p) => {
    if (filter && !postTags(p).includes(filter)) return false;
    if (q) {
      const hay = `${p.id} ${p.parsed.data.title ?? ''} ${p.parsed.data.lead ?? ''} ${p.parsed.data.description ?? ''} ${postTags(p).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const years = groupByYearMonth(matching.map((p) => ({ date: postDate(p), data: p })));
  const collapsed = filter || q ? new Set<string>() : state.listCollapsed;

  const searchBox = `
    <div class="st-list-search-wrap">
      <input type="search" class="st-input st-list-search" id="st-post-search" value="${esc(state.searchQuery)}" placeholder="检索标题 / 路由 / 标签…" aria-label="检索文章" />
    </div>`;

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
          <span class="tl-count">${total} 篇</span>
        </button>
        <div class="tl-panel"${yOpen ? ' data-open' : ''}>
          <div class="tl-body" style="--n:${y.months.length}">
            ${y.months
              .map((m) => {
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
                      ${m.items
                        .map((it, ii) => {
                          const globalIdx = all.findIndex((x) => x.id === it.data.id) + 1;
                          return `<div class="tl-slot" style="--i:${ii}">${itemHtml(it.data, globalIdx)}</div>`;
                        })
                        .join('')}
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

  return `${searchBox}
    ${chips}
    <ul class="st-list">${addRow}</ul>
    ${
      matching.length
        ? `<div class="tl" data-timeline>${body}<div class="tl-start" aria-hidden="true"></div></div>`
        : `<p class="st-empty">${filter || q ? '未找到匹配当前筛选条件的文章。' : '还没有文章。'}</p>`
    }`;
}

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
      state.listCollapsed.clear();
      rerenderList();
    })
  );

  const searchInput = box.querySelector<HTMLInputElement>('#st-post-search');
  searchInput?.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    const pos = searchInput.selectionStart ?? searchInput.value.length;
    rerenderList();
    const nextInput = box.querySelector<HTMLInputElement>('#st-post-search');
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(pos, pos);
    }
  });
}