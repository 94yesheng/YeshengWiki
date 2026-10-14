# 后台界面用到的字体（本地托管）

网页后台（Sveltia CMS）的界面自带三处 `@font-face`，默认从 `cdn.jsdelivr.net` 加载。
这里把它们下载下来放在自己域名下，由 `scripts/copy-cms.mjs` 在复制时把包里的地址改写
成 `/admin/fonts/...`。

**为什么这么做**：一是本机网络对 jsdelivr 并不可靠（实测三个文件里两个要重试、一个直接
失败），而 `material-symbols-outlined` 是**图标字体** —— 它加载失败的话，后台按钮上的
图标会退化成文字，界面很难看；二是本站的原则是不依赖第三方，后台也不该例外。

| 本地文件 | 上游 | 用途 | 许可 |
|---|---|---|---|
| `source-sans-3-var.woff2` | `fontsource/source-sans-3:vf@5.3.1` | 界面正文字体 | SIL Open Font License 1.1 |
| `material-symbols-outlined-var.woff2` | `fontsource/material-symbols-outlined:vf@5.3.9` | 图标 | Apache License 2.0 |
| `noto-mono-400.woff2` | `fontsource/noto-mono@5.3.0` | 代码/等宽 | SIL Open Font License 1.1 |

三个都是可自由再分发的开源字体。体积合计约 824 KB —— 只在你打开 `/admin/` 时才会被
加载，访客侧不受影响（访客页面的字体一律用系统自带的，零下载）。

**升级 Sveltia 时注意**：如果新版本的字体 URL 变了，`npm run build` 会打印一条警告
（改写处数不符），这时需要重新下载并更新本目录，否则后台会去连 jsdelivr。
