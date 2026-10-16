/**
 * 文章视图 —— 右侧编辑区、新建、删除，以及"保存这一篇"。
 *
 * 正文交给所见即所得编辑器（editor.ts），这里只负责字段表单、标签，和保存时
 * 「哪些改动真算改动」的判断。保存逻辑跟视图放在一起，是因为它读的正是这个视图的草稿。
 */
import {
  buildPostText,
  diffFields,
  draftId,
  newPostEntry,
  POST_FIELDS,
  postTitle,
  savePost,
  type PostEntry,
} from '../content';
import { effectiveChanges, parsePost } from '../frontmatter';
import { createEditor } from '../editor';
import { normalizeHtml, renderMarkdown } from '../md';
import { openPreview } from '../preview';
import { chineseFullDate, isoDate } from '../../utils/date';
import { $, esc, toast } from '../ui';
import {
  isStagedNew,
  markDirty,
  rerender,
  settleBeforeLeaving,
  stageAdd,
  stageRemove,
  state,
  type Draft,
} from '../state';
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
    edit.innerHTML = '<p class="st-empty">左边选一篇文章；新建就点列表最上面那一行的「＋」。</p>';
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
  $('#st-del-post')?.addEventListener('click', () => removePost(d.entry));

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

/**
 * 新建文章：**不问标题和文件名，也不碰仓库** —— 点一下就出来一条空壳
 * （标题「草稿」、日期今天），落在列表最上面，然后自己滑开。
 *
 * 【为什么是"暂存"】点一下就要等 API 往返、还要重新拉一遍全库，既慢又白费 ——
 * 用户这一刻只是"想开个头"。所以先记进 `state.staged`，等点右上角「保存」时
 * 才真正写进仓库（见 app.ts 的 flushStaged）。**点「重新读取」就能把这一笔作废。**
 *
 * 【落盘时会带上 draft: true】后台是往仓库写的，仓库 main 一有提交就触发部署 ——
 * 不标草稿的话，这个空壳会立刻变成线上一篇文章（标题「草稿」、没有正文）。
 * 勾着草稿它就不生成页面；等真写完，在右边把「草稿」那一栏取消勾选就发布了。
 *
 * 【代价，得知道】文件名在这一下就定了（draft-20261016 这种），而且后台还没有"改网址"
 * 这个功能 —— 想让某篇的链接好看，得自己改文件名。要加这个功能说一声。
 */
export function createNewPost(): void {
  // 换掉当前打开的这篇之前先收尾（暂存的那条并进去、仓库里已有的问一句）
  if (!settleBeforeLeaving()) return;

  const date = isoDate(new Date());
  const id = draftId((x) => state.posts.some((p) => p.id === x));
  const entry = newPostEntry(id, date);
  if (!entry) {
    toast('新建失败：模板没能解析', true);
    return;
  }
  state.posts.unshift(entry); // 日期是今天，本来就排在最前面
  stageAdd(entry);
  state.selected = id;
  state.draft = {};
  markDirty();

  state.justAdded = id; // 让这一条在列表里滑出来（rerender 是同步的，画完就清）
  rerender();
  state.justAdded = null;

  toast('已加了一条草稿 —— 还没进仓库，点右上角「保存」才写进去');
}

/**
 * 删除文章：**不碰仓库、也不弹确认框**（用户嫌啰嗦），只记一笔、列表里立刻不画它。
 *
 * 敢省掉确认框，是因为这一下**是可逆的**：在点「保存」之前，点「重新读取」就把它还回来了
 * —— 提示语里写明了这点，比弹个框点一下"确定"更省事也不更危险。
 * 刚加进来还没写下去的那条，等于撤销新增（仓库里本来就没有它）。
 */
function removePost(entry: PostEntry): void {
  if (isStagedNew(entry)) {
    state.posts = state.posts.filter((p) => p.path !== entry.path);
    stageRemove(entry); // 会把它从"新增"那一笔里划掉
    state.selected = null;
    state.draft = {};
    rerender();
    toast('已拿掉（它还没写进仓库）');
    return;
  }

  stageRemove(entry);
  state.selected = null;
  state.draft = {};
  markDirty(); // 让「保存」亮起来 —— 这一笔还等着落盘
  rerender();
  toast('已从列表移除 —— 点「保存」才真删，点「重新读取」可以撤销');
}

/**
 * 这次到底有没有改动 —— **拿"真正会写进文件的那几个字段"比**，而不是原始 diff。
 *
 * 原始 diff 会把两样东西误判成"改过"：
 *   · `draft: false`（文件里根本没有这一行，而界面的复选框默认就是没勾）
 *   · `updatedDate: ''`（界面的空串 vs 文件里没有这个字段）
 * 它们一个字节都不会写下去（见 frontmatter.ts 的 `effectiveChanges`），所以按原始 diff
 * 算的话**每一篇文章一打开就是"有改动"** —— 后果有两个，都踩过：
 * 切文章时每次都弹"确定丢弃吗"（无头浏览器里 `confirm` 还会把渲染进程卡死），
 * 以及"什么都没改就点保存"真的提交一个内容没变的 commit。
 */
function realChanges(d: NonNullable<Draft['post']>): Record<string, unknown> {
  return effectiveChanges(d.entry.parsed, diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]));
}

/** 当前打开的这条有没有"还没保存的字段或正文改动"（判据必须和 savePostCurrent 一致） */
export function postDraftEdited(): boolean {
  const d = state.draft.post;
  if (!d) return false;
  const changed = realChanges(d);
  // 手填/清空「修订于」本身算一次改动，但它不该被当成"又改了一版"（同 savePostCurrent）
  const manualDate = d.dateTouched === true && 'updatedDate' in changed;
  delete changed.updatedDate;
  if (manualDate || Object.keys(changed).length) return true;
  const body = d.editor?.getMarkdown() ?? d.body;
  return normalizeHtml(renderMarkdown(body)) !== normalizeHtml(renderMarkdown(d.body));
}

/**
 * 把当前正在改的东西**并进那条还没写进仓库的草稿**里。
 *
 * 为什么要这一步：`state.draft.post` 只装"当前打开的这一条"，一换选中就重建 ——
 * 于是"改了草稿标题 → 又点了一下「＋」"本来会把它丢掉。而暂存的草稿本来就还没落盘，
 * 把改动并进去什么都不损失，也就不用弹窗问（用户刚说过不要弹窗）。
 *
 * 走的是保存时同一套 buildPostText：文件会怎么写，这里就怎么更新那条 entry，
 * 所以列表上显示的和最后写下去的一定一致。
 */
export function foldStagedPostDraft(): void {
  const d = state.draft.post;
  if (!d || !isStagedNew(d.entry)) return; // 仓库里已有的条目并不了（那要写文件，不能偷偷写）
  const parsed = parsePost(buildPostText(d.entry, diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]), d.editor?.getMarkdown() ?? d.body));
  if (!parsed) return;
  d.entry.parsed = parsed; // 就地改：state.posts 与 staged.added 里是同一个对象
  d.body = parsed.body;
}

export async function savePostCurrent(gh: Github): Promise<boolean> {
  const d = state.draft.post;
  if (!d) return true;
  /** 暂存着的新文章：仓库里还没有这个文件，这次是"新建"而不是"更新" */
  const isNew = isStagedNew(d.entry);

  // 先挡一道：这几样写坏了不是"后台难看"，而是**整站构建失败**（内容集合校验不过），
  // 所以宁可在这儿拦住、让人当场改。空字段在 buildPost 里会整行删掉 → 必填项就没了。
  const dateOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
  if (!String(d.fields.title ?? '').trim()) {
    toast('标题不能为空 —— 空标题写下去，站点会构建失败', true);
    return false;
  }
  if (!dateOk(d.fields.pubDate)) {
    toast('「日期」要写成 2026-03-09 这样（它决定文章在时间轴上的位置）', true);
    return false;
  }
  if (d.fields.updatedDate && !dateOk(d.fields.updatedDate)) {
    toast('「修订于」要么留空，要么写成 2026-03-09 这样', true);
    return false;
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
  const changedExceptDate = realChanges(d);
  const manualDate = d.dateTouched === true && 'updatedDate' in changedExceptDate;
  delete changedExceptDate.updatedDate;
  // 新加的这条**即使一个字都没改也要写**（仓库里还没有它）；已有的才看"有没有真改动"
  const hasRealEdit = isNew || Object.keys(changedExceptDate).length > 0 || !bodySame || manualDate;

  if (!hasRealEdit) {
    toast('没有任何改动');
    return true;
  }

  // 开了自动记录、这次确实改了东西、而且你没亲手填过「修订于」→ 盖成今天。
  // 用 isoDate（本地日期）而不是 toISOString —— 后者是 UTC，UTC+8 的凌晨会写成前一天。
  // **新文章不记**：它还没有"上一版"，第一次写下去就是初版，标个"修订于今天"没有意义。
  if (!isNew && !d.dateTouched && postAutoUpdated(d.fields)) {
    d.fields.updatedDate = isoDate(new Date());
  }

  const changed = diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]);
  await savePost(gh, d.entry, changed, bodySame ? d.body : body);
  // 不在这里刷 sha / 重画：保存是**一批**（可能还有别的暂存要落盘），
  // 由 app.ts 收尾时统一 reload 一次 —— 那里会把新的 sha 和顺序都取回来。
  return true;
}