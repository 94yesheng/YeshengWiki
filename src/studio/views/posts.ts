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
import { chineseFullDate } from '../../utils/date';
import { $, esc, reportError, setBusy, toast } from '../ui';
import { state, markDirty, reload, rerender, type Draft } from '../state';
import type { Github } from '../github';

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
      },
      body: entry.parsed.body,
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

  const tags = (d.fields.tags as string[])
    .map((t) => `<span class="st-chip">${esc(t)}<button data-rm="${esc(t)}" title="移除">×</button></span>`)
    .join('');

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">${esc(d.fields.pubDate || '未填日期')} · ${esc(d.entry.path)}</div>
      <h2 id="st-live-title">${esc(d.fields.title)}</h2>
      <div class="st-head-actions">
        <button class="st-btn" id="st-preview-btn">按博客的样子预览</button>
        <span class="st-hint">打开一篇真实文章页，只把正文换成你现在的草稿</span>
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

  // 预览：取一篇真实文章页当外壳，正文换成当前草稿
  $('#st-preview-btn')?.addEventListener('click', () => {
    const pubDate = String(d.fields.pubDate ?? '');
    const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
    void openPreview({
      id: d.entry.id,
      title: String(d.fields.title ?? ''),
      dateText: when ? chineseFullDate(when) : '',
      bodyMarkdown: d.editor?.getMarkdown() ?? d.body,
      fallbackId: state.posts.find((p) => p.id !== d.entry.id)?.id ?? '',
    });
  });

  // 挂上所见即所得编辑器（正文不再裸露 Markdown）
  const host = $('#ed-host');
  if (host) {
    d.editor = createEditor(
      host,
      d.body,
      () => markDirty(),
      () => `相对路径，例如 ../../assets/posts/${d.entry.id}-01.png\n（图片文件放在 src/assets/posts/ 下）`
    );
  }
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
  const changed = diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]);
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

  if (Object.keys(changed).length === 0 && bodySame) {
    toast('没有任何改动');
    return;
  }
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
    },
    body: parsed.body,
  };
  rerender();
}