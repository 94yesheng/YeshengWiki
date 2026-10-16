/**
 * 文章视图 —— 右侧编辑区、新建、删除，以及"保存这一篇"。
 *
 * 正文交给所见即所得编辑器（editor.ts），这里只负责字段表单、标签，和保存时
 * 「哪些改动真算改动」的判断。保存逻辑跟视图放在一起，是因为它读的正是这个视图的草稿。
 */
import {
  createPost,
  deletePost,
  diffFields,
  newPostTemplate,
  POST_FIELDS,
  postTitle,
  savePost,
  type PostEntry,
} from '../content';
import { createEditor } from '../editor';
import { normalizeHtml, renderMarkdown } from '../md';
import { parsePost } from '../frontmatter';
import { openPreview } from '../preview';
import { chineseFullDate, isoDate } from '../../utils/date';
import { $, esc, reportError, setBusy, toast } from '../ui';
import { state, markDirty, reload, rerender, type Draft } from '../state';
import type { Github } from '../github';

/**
 * 全局默认：保存时要不要自动记「修订」。存在 site.data.json 的 studio 块里（跟着仓库走，
 * 换台机器打开后台也是同一个设定），缺省开。
 */
function autoUpdatedDefault(): boolean {
  const data = state.site?.data as Record<string, unknown> | undefined;
  const studio = data?.studio as Record<string, unknown> | undefined;
  return studio?.autoUpdated !== false;
}

/** 这一篇生效的「自动记修订」：frontmatter 写了就用它，没写就跟随全局 */
function postAutoUpdated(fields: Record<string, unknown>): boolean {
  const v = fields.autoUpdated;
  return typeof v === 'boolean' ? v : autoUpdatedDefault();
}

function currentPost(): PostEntry | null {
  return state.posts.find((p) => p.id === state.selected) ?? null;
}

function postDraft(): Draft['post'] {
  const entry = currentPost();
  if (!entry) return undefined;
  if (!state.draft.post || state.draft.post.entry.id !== entry.id) {
    state.draft.post = {
      entry,
      fields: {
        title: entry.parsed.data.title ?? '',
        pubDate: String(entry.parsed.data.pubDate ?? ''),
        description: entry.parsed.data.description ?? '',
        tags: [...(Array.isArray(entry.parsed.data.tags) ? (entry.parsed.data.tags as string[]) : [])],
        updatedDate: entry.parsed.data.updatedDate ? String(entry.parsed.data.updatedDate) : '',
        draft: entry.parsed.data.draft === true,
        // 三态：undefined = 跟随全局；true / false = 这一篇的例外
        autoUpdated: typeof entry.parsed.data.autoUpdated === 'boolean' ? entry.parsed.data.autoUpdated : undefined,
      },
      body: entry.parsed.body,
      dateTouched: false,
    };
  }
  return state.draft.post;
}

export function renderPostView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

  const d = postDraft();
  if (!d) {
    edit.innerHTML = '<p class="st-empty">左边选一篇文章，或者点「新建」。</p>';
    return;
  }

  // 「自动记修订」的三个状态：跟随全局 / 始终 / 不记录
  const globalAuto = autoUpdatedDefault();
  const curAuto = d.fields.autoUpdated;
  const autoValue = curAuto === true ? 'on' : curAuto === false ? 'off' : 'follow';

  const tags = (d.fields.tags as string[])
    .map((t) => `<span class="st-chip">${esc(t)}<button data-rm="${esc(t)}" title="移除">×</button></span>`)
    .join('');

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">${esc(d.fields.pubDate || '未填日期')} · ${esc(d.entry.path)}</div>
      <h2 id="st-live-title">${esc(d.fields.title)}</h2>
      <div class="st-head-actions">
        <span class="st-hint">想看效果：点<b>右下角悬浮球</b>里的「▤」—— 会打开一篇真实文章页，只把正文换成你现在的草稿</span>
      </div>
    </div>
    <div class="st-form">
      <div class="st-field"><label>标题</label><div>
        <input class="st-input" id="st-f-title" value="${esc(d.fields.title)}" />
      </div></div>
      <div class="st-field"><label>日期</label><div>
        <input class="st-input" id="st-f-date" value="${esc(d.fields.pubDate)}" style="max-width:10rem" />
        <div class="st-hint">格式 2026-03-09。决定文章在时间轴上的位置</div>
      </div></div>
      <div class="st-field"><label>标签</label><div>
        <div class="st-tags" id="st-tags">${tags}
          <input class="st-input" id="st-f-newtag" placeholder="＋ 加标签后回车" style="max-width:12rem" />
        </div>
      </div></div>
      <div class="st-field"><label>摘要</label><div>
        <textarea class="st-textarea" id="st-f-desc" rows="2">${esc(d.fields.description)}</textarea>
        <div class="st-hint">只用于 RSS 和搜索引擎，列表页不显示</div>
      </div></div>
      <div class="st-field"><label>修订于</label><div>
        <input class="st-input" id="st-f-updated" value="${esc(d.fields.updatedDate)}" style="max-width:10rem" placeholder="留空则不显示" />
        <div class="st-hint">留空就是没有「修订」这一栏；你手动填过之后，自动记录不会再覆盖它</div>
      </div></div>
      <div class="st-field"><label>修订记录</label><div>
        <select class="st-select" id="st-f-auto">
          <option value="follow"${autoValue === 'follow' ? ' selected' : ''}>跟随全局（当前：${globalAuto ? '自动记录' : '不记录'}）</option>
          <option value="on"${autoValue === 'on' ? ' selected' : ''}>始终自动记录</option>
          <option value="off"${autoValue === 'off' ? ' selected' : ''}>这一篇不记录</option>
        </select>
        <div class="st-hint">自动记录 = 保存时把「修订于」盖成今天。只有你动过这个选择、且和全局不同，才会写进 frontmatter</div>
      </div></div>
      <div class="st-field"><label>草稿</label><div class="st-check">
        <input type="checkbox" id="st-f-draft" ${d.fields.draft ? 'checked' : ''} />
        <span>打开后不出现在列表、RSS 和站点地图里（也不会生成页面）</span>
      </div></div>
    </div>
    <div class="st-editor-head">
      <span>正文</span>
      <span class="st-info">像写文档一样编辑；选中文字再用上面那排按钮加格式</span>
    </div>
    <div id="ed-host"></div>
    <div style="margin-top:var(--space-5);display:flex;gap:var(--space-2)">
      <button class="st-btn st-btn--danger" id="st-del-post">删除这篇文章</button>
    </div>`;

  // 字段绑定：只改草稿，不重画整个编辑区（否则输入框会失焦）
  const bindInput = (sel: string, key: string) =>
    $<HTMLInputElement>(sel)?.addEventListener('input', (e) => {
      d.fields[key] = (e.target as HTMLInputElement).value;
      markDirty();
      if (key === 'title') {
        const t = $('#st-live-title');
        if (t) t.textContent = String(d.fields.title ?? '');
      }
    });
  bindInput('#st-f-title', 'title');
  bindInput('#st-f-date', 'pubDate');
  bindInput('#st-f-desc', 'description');
  bindInput('#st-f-updated', 'updatedDate');
  // 用户亲手动过「修订于」就留个痕：自动记录要给它让位，否则手填的日期会被今天的日期顶掉
  $('#st-f-updated')?.addEventListener('input', () => {
    d.dateTouched = true;
  });
  $<HTMLSelectElement>('#st-f-auto')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    // 选「跟随」就把字段清掉（= 回到缺省，不会在文件里留一行）
    d.fields.autoUpdated = v === 'follow' ? undefined : v === 'on';
    markDirty();
  });

  $<HTMLInputElement>('#st-f-draft')?.addEventListener('change', (e) => {
    d.fields.draft = (e.target as HTMLInputElement).checked;
    markDirty();
  });
  $<HTMLInputElement>('#st-f-newtag')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Enter') return;
    const input = e.target as HTMLInputElement;
    const v = input.value.trim();
    if (v && !(d.fields.tags as string[]).includes(v)) {
      (d.fields.tags as string[]).push(v);
      markDirty();
      renderPostView();
    }
    input.value = '';
  });
  edit.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => {
      d.fields.tags = (d.fields.tags as string[]).filter((t) => t !== b.dataset.rm);
      markDirty();
      renderPostView();
    })
  );
  $('#st-del-post')?.addEventListener('click', () => void removePost(d.entry));

  // 右侧那一栏 = 「格式」面板：工具栏搬进来了；预览改由右下角的悬浮球打开
  const panel = $('#st-preview');
  if (panel) {
    // 面板里只放工具栏 —— 标题和底部提示都去掉了（分组标签自己就是引导）
    panel.innerHTML = `<div class="st-col-inner"><div id="ed-bar-host"></div></div>`;
  }

  // 挂上所见即所得编辑器（正文不再裸露 Markdown）。
  // 已经有编辑器就**搬到新宿主里**，不要用 d.body 重建 —— 那会丢掉还没保存的正文改动
  // （增删标签会重画整个表单，踩过）。
  const areaHost = $('#ed-host');
  const barHost = $('#ed-bar-host');
  if (areaHost && barHost) {
    if (d.editor) d.editor.remount(areaHost, barHost);
    else
      d.editor = createEditor(
        areaHost,
        barHost,
        d.body,
        () => markDirty(),
        () => `相对路径，例如 ../../assets/posts/${d.entry.id}-01.png\n（图片文件放在 src/assets/posts/ 下）`
      );
  }
}

/** 打开「按博客的样子预览」当前草稿 —— 由右下角的悬浮球调用（原来那个按钮收进去了） */
export function previewCurrentPost(): void {
  const d = postDraft();
  if (!d) return;
  const pubDate = String(d.fields.pubDate ?? '');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
  void openPreview({
    id: d.entry.id,
    title: String(d.fields.title ?? ''),
    dateText: when ? chineseFullDate(when) : '',
    bodyMarkdown: d.editor?.getMarkdown() ?? d.body,
    fallbackId: state.posts.find((p) => p.id !== d.entry.id)?.id ?? '',
  });
}

export async function createNewPost(): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  const title = prompt('新文章的标题：');
  if (!title) return;
  const slug = prompt(
    '文件名（英文小写加连字符，决定网址，例如 my-first-post）：',
    title.replace(/[^\w一-龥]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'new-post'
  );
  if (!slug) return;
  if (state.posts.some((p) => p.id === slug)) {
    toast(`已经有一篇叫 ${slug} 的文章了`, true);
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  setBusy(true, '创建中…');
  try {
    await createPost(gh, slug, newPostTemplate(title, date, []));
    await reload();
    state.selected = slug;
    rerender();
    toast('已创建');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

async function removePost(entry: PostEntry): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  if (!confirm(`确定删除「${postTitle(entry)}」？\n\n会从仓库删掉这个文件（git 历史里还能找回）。`)) return;
  setBusy(true, '删除中…');
  try {
    await deletePost(gh, entry);
    state.selected = null;
    state.draft = {};
    state.dirty = false;
    await reload();
    toast('已删除');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

export async function savePostCurrent(gh: Github): Promise<void> {
  const d = state.draft.post;
  if (!d) return;

  // 先挡一道：这几样写坏了不是"后台难看"，而是**整站构建失败**（内容集合校验不过），
  // 所以宁可在这儿拦住、让人当场改。空字段在 buildPost 里会整行删掉 → 必填项就没了。
  const dateOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
  if (!String(d.fields.title ?? '').trim()) {
    toast('标题不能为空 —— 空标题写下去，站点会构建失败', true);
    return;
  }
  if (!dateOk(d.fields.pubDate)) {
    toast('「日期」要写成 2026-03-09 这样（它决定文章在时间轴上的位置）', true);
    return;
  }
  if (d.fields.updatedDate && !dateOk(d.fields.updatedDate)) {
    toast('「修订于」要么留空，要么写成 2026-03-09 这样', true);
    return;
  }

  const body = d.editor?.getMarkdown() ?? d.body;

  // 正文"其实没改"的判据：两边各自渲染成 HTML，语义比较。
  // 不能逐字节比 Markdown —— 富文本编辑器转回来的写法会被规整化（空行、缩进），
  // 那不叫改动。所以：渲染结果相同 → 保留**原文**，一个字节都不写。
  const bodySame = normalizeHtml(renderMarkdown(body)) === normalizeHtml(renderMarkdown(d.body));

  // 自检：把 Markdown 再渲染回来，和编辑器里看到的是不是一回事。
  // 万一有哪种格式"所见"转不成"所得"，在这里提醒一声 —— 不然会静默地改掉外观。
  if (d.editor && !bodySame) {
    const intended = normalizeHtml(d.editor.getHtml());
    const roundTripped = normalizeHtml(renderMarkdown(body, { forEditor: true }));
    if (intended !== roundTripped) {
      toast('注意：正文里有格式无法准确地转成 Markdown，保存后外观可能略有差异 —— 建议点「按博客的样子预览」确认', true);
    }
  }

  // 「除了修订时间以外，这次有没有实质改动」。
  // 单独手填/清空「修订于」本身算一次改动（要能存下去），但它**不该**反过来被当成
  // "又改了一版" —— 否则你手填的日期存一次就被今天顶掉。
  const changedExceptDate = diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]);
  const manualDate = d.dateTouched === true && 'updatedDate' in changedExceptDate;
  delete changedExceptDate.updatedDate;
  const hasRealEdit = Object.keys(changedExceptDate).length > 0 || !bodySame || manualDate;

  if (!hasRealEdit) {
    toast('没有任何改动');
    return;
  }

  // 开了自动记录、这次确实改了东西、而且你没亲手填过「修订于」→ 盖成今天。
  // 用 isoDate（本地日期）而不是 toISOString —— 后者是 UTC，UTC+8 的凌晨会写成前一天。
  if (!d.dateTouched && postAutoUpdated(d.fields)) {
    d.fields.updatedDate = isoDate(new Date());
  }

  const changed = diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]);
  await savePost(gh, d.entry, changed, bodySame ? d.body : body);
  await refreshPost(d.entry.id);
}

/** 保存后重新拉这个文件：确认写入结果，并拿到新的 sha */
async function refreshPost(id: string): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  const entry = state.posts.find((p) => p.id === id);
  if (!entry) return;
  const remote = await gh.getFile(entry.path);
  if (!remote) return;
  const parsed = parsePost(remote.text);
  if (!parsed) return;
  entry.sha = remote.sha;
  entry.parsed = parsed;
  state.draft.post = {
    entry,
    fields: {
      title: parsed.data.title ?? '',
      pubDate: String(parsed.data.pubDate ?? ''),
      description: parsed.data.description ?? '',
      tags: [...(Array.isArray(parsed.data.tags) ? (parsed.data.tags as string[]) : [])],
      updatedDate: parsed.data.updatedDate ? String(parsed.data.updatedDate) : '',
      draft: parsed.data.draft === true,
      autoUpdated: typeof parsed.data.autoUpdated === 'boolean' ? parsed.data.autoUpdated : undefined,
    },
    body: parsed.body,
    dateTouched: false,
  };
  rerender();
}