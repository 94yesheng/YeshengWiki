# 后台 UI 字号与字体清单

> 生成时间：2026-10-18 · 对应 /studio/ HUD 重构版
> 修改前请先读文末「修改入口」与「楷体字号」注意事项。

## 1. 字体族

| 变量 | 实际字体栈 | 主要用途 |
|---|---|---|
| `--kai` | `KaiDigits, KaiTi, 楷体, STKaiti, Kaiti SC, Noto Serif SC, serif` | 后台品牌字、板块标题、列表文章名、对话框标题、FAB 文字 |
| `--song` | `SongDigits, Songti SC, SimSun, 宋体, Noto Serif SC, serif` | `.st-body` 默认正文、正文编辑器 `.ed-area` |
| `--sans` | `Noto Sans SC, Microsoft YaHei, 微软雅黑, PingFang SC, system-ui, sans-serif` | 按钮、表单标签/输入框、提示、右侧预览、对话框正文 |
| `--mono` | `ui-monospace, Cascadia Code, Consolas, SFMono-Regular, monospace` | 编号、坐标、遥测、EXIF、按钮角标、导航计数 |
| `monospace`（内联 SVG） | 浏览器等宽字体 | 右栏拓扑图 SVG `<text>` |


## 2. 字号令牌

| 变量 | rem | 计算值 | 主要用途 |
|---|---|---|---|
| `--text-xs` | `0.875rem` | 14px | 提示、hint、次级标签、登录说明 |
| `--text-sm` | `0.9375rem` | 15px | 表单 label、section 标题、对话框正文 |
| `--text-base` | `1rem` | 16px | `.st-body` 正文、输入框、列表按钮 |
| `--text-md` | `1.125rem` | 18px | 分节小标题、程序预览标题、FAB 按钮 |
| `--text-lg` | `1.28rem` | 20.48px | 楷体标题、左栏文章名、品牌字 |
| `--text-xl` | `1.52rem` | 24.32px | 页头 h2、加载态、对话框标题 |
| `--text-2xl` | `1.88rem` | 30.08px | 当前未使用（仅定义） |
| `--text-3xl` | `2.25rem` | 36px | 当前未使用（仅定义） |


## 3. 全部显式字号（studio.css / fab.css）

| 区域 | 选择器 | font-size | 计算值 | font-family | 备注 |
|---|---|---|---|---|---|
| 顶栏 / 登录 | `.nav-brand-coord` | `0.66rem` | 10.56px | 等宽 --mono | 字距 0.08em |
| 顶栏 / 登录 | `.nav-brand-text` | `var(--text-lg)` | 20.48px | 楷体 --kai | 字距 0.08em；行高 1 |
| 顶栏 / 登录 | `.q-footbar` | `0.68rem` | 10.88px | 等宽 --mono | 字距 0.07em |
| 顶栏 / 登录 | `.q-sec-badge` | `0.68rem` | 10.88px | 等宽 --mono | weight 600；字距 0.1em |
| 顶栏 / 登录 | `.q-topbar` | `0.72rem` | 11.52px | 等宽 --mono | 字距 0.08em |
| 顶栏 / 登录 | `.st-boot` | `var(--text-lg)` | 20.48px | 楷体 --kai | 字距 0.15em |
| 顶栏 / 登录 | `.st-boot span` | `var(--text-xs)` | 14px | 宋体 --song | 字距 0 |
| 顶栏 / 登录 | `.st-brand-name` | `var(--text-xl)` | 24.32px | 楷体 --kai | 字距 0.14em |
| 顶栏 / 登录 | `.st-brand-tag` | `0.7rem` | 11.2px | 等宽 --mono | 字距 0.18em |
| 顶栏 / 登录 | `.st-btn, .stage-mini-btn` | `0.8125rem` | 13px | 黑体 --sans | 字距 0.02em |
| 顶栏 / 登录 | `.st-dirty-badge` | `0.72rem` | 11.52px | 等宽 --mono | — |
| 顶栏 / 登录 | `.st-error` | `var(--text-xs)` | 14px | 继承 | — |
| 顶栏 / 登录 | `.st-label` | `0.7rem` | 11.2px | 等宽 --mono | 字距 0.08em |
| 顶栏 / 登录 | `.st-login-note` | `var(--text-xs)` | 14px | 继承 | 行高 1.8 |
| 顶栏 / 登录 | `.st-meta-badge` | `0.7rem` | 11.2px | 等宽 --mono | 字距 0.05em |
| 顶栏 / 登录 | `.st-nav .st-n` | `0.68rem` | 10.88px | 等宽 --mono | — |
| 顶栏 / 登录 | `.st-nav button` | `var(--text-base)` | 16px | 楷体 --kai | — |
| 顶栏 / 登录 | `.st-nav-idx` | `0.68rem` | 10.88px | 等宽 --mono | — |
| 顶栏 / 登录 | `.st-nav-idx-pill` | `0.7rem` | 11.2px | 等宽 --mono | — |
| 顶栏 / 登录 | `.theme-transition-badge` | `0.72rem` | 11.52px | 等宽 --mono | 字距 0.12em |
| 左栏列表 | `.chip` | `0.72rem` | 11.52px | 黑体 --sans | — |
| 左栏列表 | `.chip-count` | `0.65rem` | 10.4px | 等宽 --mono | — |
| 左栏列表 | `.st-empty` | `var(--text-sm)` | 15px | 继承 | — |
| 左栏列表 | `.st-list .st-date` | `0.8rem` | 12.8px | 等宽 --mono | weight 600 |
| 左栏列表 | `.st-list .st-name` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 左栏列表 | `.st-list .st-sub` | `var(--text-xs)` | 14px | 黑体 --sans | — |
| 左栏列表 | `.st-list li button` | `var(--text-base)` | 16px | 继承 | — |
| 左栏列表 | `.st-list li.st-list-add button` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 左栏列表 | `.st-list-search` | `0.76rem` | 12.16px | 继承 | — |
| 左栏列表 | `.st-panel-title` | `0.72rem` | 11.52px | 等宽 --mono | weight 600；字距 0.1em |
| 左栏列表 | `.tl-count` | `0.68rem` | 10.88px | 等宽 --mono | — |
| 左栏列表 | `.tl-day` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 左栏列表 | `.tl-mark` | `0.64rem` | 10.24px | 等宽 --mono | — |
| 左栏列表 | `.tl-meta` | `0.66rem` | 10.56px | 等宽 --mono | — |
| 左栏列表 | `.tl-month-label` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 左栏列表 | `.tl-name` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 左栏列表 | `.tl-year-label` | `var(--text-lg)` | 20.48px | 楷体 --kai | 字距 0.08em |
| 中栏表单 | `.cover-ratio-pill` | `0.64rem` | 10.24px | 等宽 --mono | — |
| 中栏表单 | `.st-check` | `var(--text-sm)` | 15px | 继承 | — |
| 中栏表单 | `.st-chip` | `0.74rem` | 11.84px | 黑体 --sans | — |
| 中栏表单 | `.st-chip button` | `0.85rem` | 13.6px | 继承 | — |
| 中栏表单 | `.st-field .st-hint, .st-hint` | `var(--text-xs)` | 14px | 黑体 --sans | 行高 1.55 |
| 中栏表单 | `.st-field > label, .st-mini-label` | `var(--text-sm)` | 15px | 黑体 --sans | weight 500；字距 0 |
| 中栏表单 | `.st-field-state` | `0.6rem` | 9.6px | 等宽 --mono | — |
| 中栏表单 | `.st-head .st-kicker` | `var(--text-xs)` | 14px | 等宽 --mono | 字距 0.05em |
| 中栏表单 | `.st-head h2` | `var(--text-xl)` | 24.32px | 楷体 --kai | weight 400；行高 1.3 |
| 中栏表单 | `.st-input, .st-textarea, .st-select` | `var(--text-base)` | 16px | 黑体 --sans | 行高 1.5 |
| 中栏表单 | `.st-quick-tags` | `0.72rem` | 11.52px | 继承 | — |
| 中栏表单 | `.st-section-head` | `var(--text-sm)` | 15px | 黑体 --sans | weight 600；字距 0 |
| 中栏表单 | `.st-section-head .st-sec-mono` | `0.72rem` | 11.52px | 等宽 --mono | weight 400；字距 0.06em |
| 中栏表单 | `.st-sub-kicker` | `0.75rem` | 12px | 等宽 --mono | 字距 0.06em |
| 正文编辑器 | `.ed-area` | `var(--text-base)` | 16px | 宋体 --song | 行高 1.95 |
| 正文编辑器 | `.ed-area code` | `0.86em` | 相对单位 | 等宽 --mono | — |
| 正文编辑器 | `.ed-area h2` | `var(--text-xl)` | 24.32px | 继承 | — |
| 正文编辑器 | `.ed-area h2, .ed-area h3` | `—` | — | 楷体 --kai | weight 400 |
| 正文编辑器 | `.ed-area h3` | `var(--text-lg)` | 20.48px | 继承 | — |
| 正文编辑器 | `.ed-area pre` | `0.82rem` | 13.12px | 等宽 --mono | 行高 1.6 |
| 正文编辑器 | `.ed-area table` | `0.88rem` | 14.08px | 继承 | — |
| 正文编辑器 | `.ed-area th` | `var(--text-lg)` | 20.48px | 楷体 --kai | weight 400 |
| 正文编辑器 | `.ed-asset-label` | `0.72rem` | 11.52px | 继承 | — |
| 正文编辑器 | `.ed-btn` | `0.76rem` | 12.16px | 黑体 --sans | — |
| 正文编辑器 | `.ed-count` | `0.68rem` | 10.88px | 等宽 --mono | — |
| 正文编辑器 | `.ed-drawer-head` | `0.7rem` | 11.2px | 等宽 --mono | — |
| 正文编辑器 | `.ed-glabel` | `0.68rem` | 10.88px | 等宽 --mono | 字距 0.08em |
| 正文编辑器 | `.ed-mode-tab` | `0.7rem` | 11.2px | 等宽 --mono | — |
| 正文编辑器 | `.ed-source` | `0.84rem` | 13.44px | 等宽 --mono | 行高 1.75 |
| 正文编辑器 | `.ed-telemetry-stat` | `0.7rem` | 11.2px | 等宽 --mono | — |
| 正文编辑器 | `.ed-toc-empty` | `0.74rem` | 11.84px | 继承 | — |
| 正文编辑器 | `.ed-toc-item` | `0.78rem` | 12.48px | 继承 | — |
| 正文编辑器 | `.ed-toc-num` | `0.68rem` | 10.88px | 等宽 --mono | — |
| 正文编辑器 | `.st-dock-head` | `0.72rem` | 11.52px | 等宽 --mono | weight 600；字距 0.08em |
| 正文编辑器 | `.st-dock-tab` | `0.68rem` | 10.88px | 等宽 --mono | 字距 0.06em |
| 右栏 / 预览 / 浮层 | `.exif-cell > span` | `0.6rem` | 9.6px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.exif-cipher-mask` | `0.58rem` | 9.28px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.exif-val-cipher` | `0.72rem` | 11.52px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.exif-val-normal` | `0.75rem` | 12px | 黑体 --sans | weight 600 |
| 右栏 / 预览 / 浮层 | `.histogram-head` | `0.62rem` | 9.92px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.pv-bar` | `0.74rem` | 11.84px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.pv-close` | `0.72rem` | 11.52px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.rail-card-kicker` | `0.66rem` | 10.56px | 等宽 --mono | 字距 0.08em |
| 右栏 / 预览 / 浮层 | `.rail-kv-list` | `0.7rem` | 11.2px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.rail-rel-mock .r-idx` | `0.64rem` | 10.24px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.rail-rel-mock .r-tit` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 右栏 / 预览 / 浮层 | `.st-busy` | `var(--text-xl)` | 24.32px | 楷体 --kai | 字距 0.18em |
| 右栏 / 预览 / 浮层 | `.st-col--preview, .st-col--tools` | `—` | — | 黑体 --sans | — |
| 右栏 / 预览 / 浮层 | `.st-dialog-body` | `var(--text-sm)` | 15px | 黑体 --sans | 行高 1.75 |
| 右栏 / 预览 / 浮层 | `.st-dialog-footer .st-btn` | `var(--text-sm)` | 15px | 继承 | — |
| 右栏 / 预览 / 浮层 | `.st-dialog-icon` | `1.05rem` | 16.8px | 继承 | — |
| 右栏 / 预览 / 浮层 | `.st-dialog-title` | `var(--text-lg)` | 20.48px | 楷体 --kai | weight 400；行高 1.3 |
| 右栏 / 预览 / 浮层 | `.st-exif-badge` | `0.62rem` | 9.92px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-exif-code` | `0.66rem` | 10.56px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-peer-avatar-badge` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 右栏 / 预览 / 浮层 | `.st-peer-tag-pill` | `0.62rem` | 9.92px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-photo-card-title` | `var(--text-lg)` | 20.48px | 楷体 --kai | — |
| 右栏 / 预览 / 浮层 | `.st-photo-idx, .st-photo-ratio` | `0.62rem` | 9.92px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-pick button` | `0.72rem` | 11.52px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-prog-preview-desc` | `0.82rem` | 13.12px | 继承 | 行高 1.6 |
| 右栏 / 预览 / 浮层 | `.st-prog-preview-foot` | `0.68rem` | 10.88px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-prog-preview-title` | `var(--text-md)` | 18px | 楷体 --kai | — |
| 右栏 / 预览 / 浮层 | `.st-terminal-mock` | `0.66rem` | 10.56px | 等宽 --mono | — |
| 右栏 / 预览 / 浮层 | `.st-toast` | `0.78rem` | 12.48px | 黑体 --sans | — |
| 悬浮球 FAB | `.fab-btn` | `var(--text-md)` | 18px | 楷体 --kai | 行高 1 |
| 悬浮球 FAB | `.fab-btn--main` | `var(--text-xl)` | 24.32px | 继承 | — |
| 其它 | `.st-body` | `var(--text-base)` | 16px | 宋体 --song | 行高 1.65 |
| 其它 | `.st-collapse-icon` | `0.75rem` | 12px | 等宽 --mono | — |
| 其它 | `.st-drop-title` | `0.82rem` | 13.12px | 继承 | — |
| 其它 | `.st-sec-tag` | `0.72rem` | 11.52px | 等宽 --mono | — |
| 其它 | `.st-user-photo-coord` | `0.66rem` | 10.56px | 等宽 --mono | — |
| 其它 | `.st-user-photo-story` | `0.78rem` | 12.48px | 继承 | 行高 1.55 |
| 其它 | `.st-user-photo-title` | `var(--text-lg)` | 20.48px | 楷体 --kai | weight 400 |

## 4. 内联字号（TS 模板）

| 位置 | 元素/用途 | font-size | 计算值 | font-family |
|---|---|---|---|---|
| `preview.ts:102` | 文章预览 ARCHIVE COORDINATE | `0.72rem` | 11.52px | `--mono` |
| `preview.ts:103` | 文章预览标题 | `2rem` | 32px | `--kai` |
| `preview.ts:104` | 文章预览元信息 | `0.75rem` | 12px | `--mono` |
| `links.ts:160` | 友链预览站名 | `1.25rem` | 20px | `--kai` |
| `links.ts:163` | 友链预览 URL | `0.68rem` | 10.88px | `--mono` |
| `links.ts:166` | 友链预览描述 | `0.86rem` | 13.76px | 继承 `--sans` |
| `links.ts:167` | 友链预览底栏 | `0.68rem` | 10.88px | `--mono` |
| `posts.ts:336` | 「高级 · 可折叠」标签 | `0.72rem` | 11.52px | `--mono` |
| `posts.ts:764-776` | 右栏拓扑 SVG 文本 | `8.5 / 8` | 8.5 / 8px | `monospace` |
| `posts.ts:801` | 自定义伴读卡片正文 | `0.84rem` | 13.44px | 继承 `--sans` |
| `site.ts:508` | 自定义卡片 Kicker 输入框 | `0.75rem` | 12px | `--mono` |
| `site.ts:948-960` | 右栏拓扑 SVG 文本 | `8.5 / 8` | 8.5 / 8px | `monospace` |
| `site.ts:993` | 自定义伴读卡片正文 | `0.84rem` | 13.44px | 继承 `--sans` |
| `site.ts:1045` | 站点预览标题 | `1.5rem` | 24px | `--kai` |
| `site.ts:1046/1055` | 站点预览副标题/正文 | `0.86rem` | 13.76px | 继承 |
| `site.ts:1080` | 关于我预览标题 | `1.2rem` | 19.2px | `--kai` |
| `site.ts:1081` | 关于我预览简介 | `0.82rem` | 13.12px | 继承 |



## 5. 文章编辑右栏工具面板（2026-10-18：统一 18px 下限）

作用域：`.st-col--tools`（文章编辑页 FORMAT / RAIL 两页签）。这里的字号被单独抬高，不影响后台其它区域。

| 元素 | 字号 | 布局调整 |
|---|---|---|
| 页签 `.st-dock-tab` | 18px | 两列等宽、允许换行；标签缩短为「格式工具 / 右侧悬浮栏」 |
| 分组标题 `.ed-glabel`、`.st-dock-head` | 18px | 行高 1.55，分组间距加大 |
| 工具按钮 `.ed-btn`、`.st-btn`、`.stage-mini-btn` | 18px | padding 0.42/0.7rem，按钮自动换行 |
| 图标按钮 `.ed-btn--icon` | 18px | 点击区 2.7 × 2.45rem |
| 目录 `.ed-toc-item` / `.ed-toc-num` | 18px | 行高、间距加大 |
| 计数/空态 `.ed-count` / `.ed-toc-empty` | 18px | — |
| 右栏预览 `.rail-card-kicker` / `.rail-kv-list` / `.r-idx` | 18px | 允许换行，卡片 padding 加大 |
| 右栏说明 `.st-hint` | 18px | 行高 1.55 |
| 自定义伴读卡正文（内联） | 18px | `posts.ts` 内联样式改为 1.125rem |

另外：
- 文章编辑页右缘的滑动把手 `#st-tools-handle` 已删除，右侧工具面板常驻显示。
- 后台所有列（`.st-col`）的浏览器滚动条已隐藏（`scrollbar-width:none` + `::-webkit-scrollbar`），滚轮/触控板滚动仍然可用。
- 右栏分组标题去掉括号内的英文说明，改为 `accent` 橙色 + `font-weight:700` + 行首圆点。

## 修改入口

- **字号令牌**：`src/styles/studio.css` 的 `.st-body`（约 11–23 行）。改这里会同时影响所有使用 `var(--text-*)` 的地方。
- **字体栈**：`src/styles/tokens.css` 的 `:root`（约 91–94 行）。后台和前台共用。
- **单个组件字号**：`src/styles/studio.css` 里对应选择器；表格中的显式 rem/px 值直接改。
- **内联样式**：`src/studio/preview.ts`、`views/links.ts`、`views/posts.ts`、`views/site.ts` 里的 `style="font-size:…"`。

## 需要注意的楷体字号

项目硬规则：**楷体 `--kai` 不用小于 20px**（Windows 楷体小字号发虚）。当前有以下几处低于 20px，修改时可一并考虑：

| 位置 | 当前字号 | 说明 |
|---|---|---|
| `.st-nav button` | 16px + `--kai` | 后台顶栏导航（另一个 agent 为压缩宽度改成 16px） |
| `.st-prog-preview-title` | 18px + `--kai` | 程序工坊预览标题 |
| `.fab-btn` | 18px + `--kai` | 右下角悬浮球按钮 |
| `site.ts:1080` | 19.2px + `--kai` | 「关于我」预览标题 |

其余楷体项都在 20px 以上（`--text-lg` = 20.48px、`--text-xl` = 24.32px）。

> 计算基准：`1rem = 16px`。若浏览器根字号被改动，表格里的 px 会随之变化。
