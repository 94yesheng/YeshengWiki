# 世界线变动率探测仪

页脚彩蛋：《命运石之门》里那台用辉光管做的机器。滚到页脚时七位数字一起乱跳，
跳够了**同时**定下来，停在某个 `1.xxxxxx` 上；**每次刷新都是新的随机数**。

这个文件夹是自包含的 —— 三个文件各自单一职责，搬走就能用：

| 文件 | 管什么 |
|---|---|
| `glyphs.ts` | 十个**灯丝字形**（纯数据，没有任何依赖）。改字形只动这里 |
| `meter.ts` | **客户端行为**（与站点、框架、主题全都无关，只认一组 DOM 约定） |
| `DivergenceMeter.astro` | **结构 + 样式 + 挂载**。样式全部 scoped，不引用站点 token |

## 用法

```astro
---
import DivergenceMeter from '../components/divergence-meter/DivergenceMeter.astro';
---
<DivergenceMeter />
```

### Props

| | 默认 | 说明 |
|---|---|---|
| `size` | `clamp(8px, 2.5vw, 12px)` | 整台的缩放。管子宽 `3.2em`，所以这就是"1em 多高" |
| `decimals` | `6` | 小数位数。管子总数 = 1 整数位 + 1 小数点 + 这么多个 |
| `onlyInDark` | `true` | 只在夜间模式出现（见下） |

## 只在夜间模式出现

白天整台 `display: none`（`.dm--dark-only` + `:root[data-theme='dark']` 两行，都在
`DivergenceMeter.astro` 的样式里）。

**DOM 不删**，因为主题是客户端定的（本站由 `BaseLayout` 的首屏内联脚本写进
`<html data-theme>`，数据来自 `localStorage` / `prefers-color-scheme`），服务端不知道。
留着它，等切到夜间、元素有了布局，`IntersectionObserver` 会自己报一次、然后就地开播 ——
所以"滚到页脚才切夜间"也能正常触发。

宿主用的主题约定如果不是 `data-theme="dark"`，改那两行选择器即可；
想让它一直显示就传 `onlyInDark={false}`。

## 搬到别处

`meter.ts` 只认这组 DOM 约定（都是组件自己渲染出来的），所以换宿主页一样跑：

```
[data-dm]                  根节点，可以有好几个
  .dm-tube                 一根管
    .dm-ghost  g[data-n]   虚影层的一位（里面有 path 两段：本体 + 十字）
    .dm-lit-digit          点亮层（里面有同样两段 path）
  .is-spinning/.is-settled 由 meter.ts 挂，样式认这两个类做闪烁/呼吸
```

字形数据**不从 JS 里来**：`meter.ts` 直接从自己那根管的虚影层上按 `data-n` 抄
（不靠 DOM 顺序）。所以换字形只改 `glyphs.ts`，行为那边一行不用动。

要搬到非 Astro 的页面：把这个 `.astro` 渲染出来的那段 HTML、它的 `<style>`、
和 `meter.ts` 打包后的那份 `<script>` 抄过去即可 —— 原始出处那份
`divergence-meter.html` 就是这么个单文件形态。注意 `<style>` 会被 Astro 加上
`data-astro-cid-*` 作用域，抄的时候把那部分属性一起去掉。

## 几个坑

- **6 是 9 绕 (30,50) 转 180° 推出来的**（参考截图里没出现过 6）。抄字形时
  `transform` 必须连着 `d` 一起换，漏了 6 会倒着站。
- **十位数字的十字是画在字形里的**（每位 `c` 一段），不是叠出来的 —— 每位的十字
  起止位置都不一样，别当成同一条线去"对齐"。
- **样式是给黑底设计的**。放到浅色页面上，虚影层（`--ghost` 那层）会显得比点亮那位
  更重 —— 在黑底上它是"暗"，在浅底上它是"中调"。这是已知且被接受的效果，
  不要再加回深色底板去"修"它。
- `prefers-reduced-motion` 时不做动画，直接显示结果。
