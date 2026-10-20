/**
 * 文章/主页封面缺失时的主题化「未解锁」静态兜底面板。
 *
 * 包含：
 * 1. 「该内容未解锁」静态纸墨印章标题（无动态闪烁，契合纸本沉静基调）；
 * 2. 文字底部使用 SVG 绘制对应主题的图案（白天：支持 3 版切换的莫比乌斯穿插无限徽标 ∞，无正负号；黑夜：卡冈图雅黑洞视界），随昼夜主题动态切换。
 */
export const THEME_COVER_SVG_HTML = `<div class="cover-locked-stage" role="img" aria-label="该内容未解锁">
  <div class="cover-locked-grid-bg" aria-hidden="true"></div>
  <span class="reticle-mark reticle-mark--tl" aria-hidden="true"></span>
  <span class="reticle-mark reticle-mark--tr" aria-hidden="true"></span>
  <span class="reticle-mark reticle-mark--bl" aria-hidden="true"></span>
  <span class="reticle-mark reticle-mark--br" aria-hidden="true"></span>

  <div class="cover-locked-content">
    <div class="cover-locked-kicker">
      <span class="locked-kicker-dot" aria-hidden="true"></span>
      <span>ARCHIVE SEALED // MANIFOLD RECORD</span>
    </div>

    <div class="cover-locked-title-stage">
      <span class="locked-bracket locked-bracket--left" aria-hidden="true">〔</span>
      <span class="cover-locked-glitch">
        <span class="locked-char-layer">该内容未解锁</span>
      </span>
      <span class="locked-bracket locked-bracket--right" aria-hidden="true">〕</span>
    </div>

    <div class="cover-locked-sub">NO COVER ATTACHED · CLICK TO ENTER ARTICLE</div>

    <div class="cover-locked-motif" aria-hidden="true">
      <!-- 白天主题：重绘无限徽标 ∞（去掉正负号，内置 3 版变形供切换） -->
      <svg class="cover-motif-svg cover-motif-svg--day" viewBox="0 0 220 76" fill="none">
        <line x1="16" y1="38" x2="204" y2="38" stroke="currentColor" stroke-width="0.65" stroke-dasharray="3 4" stroke-opacity="0.32"/>
        <line x1="110" y1="8" x2="110" y2="68" stroke="currentColor" stroke-width="0.65" stroke-dasharray="3 4" stroke-opacity="0.32"/>
        <!-- Logo 方案一 (v1)：经典穿插 · 斜切明暗纽带 -->
        <g class="inf-logo-v1">
          <path d="M91 19A26.87 26.87 0 1 0 91 57L129 19A26.87 26.87 0 1 1 129 57" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M91 19L101.5 29.5M118.5 46.5L129 57" stroke="currentColor" stroke-width="4.2" stroke-linecap="butt"/>
          <path d="M99 33L106 26M114 50L121 43" stroke="currentColor" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round"/>
          <path d="M87 25A19.5 19.5 0 1 0 87 51M133 25A19.5 19.5 0 1 1 133 51" stroke="currentColor" stroke-width="1.0" stroke-opacity="0.45" stroke-linecap="round"/>
        </g>
        <!-- Logo 方案二 (v2)：双轨流形 · 偏心伴随交叠 -->
        <g class="inf-logo-v2">
          <path d="M91 19A26.87 26.87 0 1 0 91 57L129 19A26.87 26.87 0 1 1 129 57" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M91 19L102 30M118 46L129 57" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
          <path d="M94.5 24.5A20.5 20.5 0 1 0 94.5 51.5L125.5 24.5A20.5 20.5 0 1 1 125.5 51.5" stroke="currentColor" stroke-width="1.15" stroke-opacity="0.58" stroke-dasharray="5 3"/>
          <circle cx="51" cy="38" r="2.2" fill="currentColor" opacity="0.65"/>
          <circle cx="169" cy="38" r="2.2" fill="currentColor" opacity="0.65"/>
        </g>
        <!-- Logo 方案三 (v3)：折角切面 · 莫比乌斯宽带 -->
        <g class="inf-logo-v3">
          <path d="M91 19A26.87 26.87 0 1 0 91 57L129 19A26.87 26.87 0 1 1 129 57" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M94 23.5A21.2 21.2 0 1 0 94 52.5L126 23.5A21.2 21.2 0 1 1 126 52.5" stroke="currentColor" stroke-width="1.4" stroke-opacity="0.72" stroke-linecap="round"/>
          <path d="M91 19L101 29M119 47L129 57" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
          <polygon points="99,31 104,26 107,29 102,34" fill="currentColor" fill-opacity="0.42"/>
          <polygon points="113,45 118,40 121,43 116,48" fill="currentColor" fill-opacity="0.42"/>
        </g>
      </svg>

      <!-- 夜间主题：平面卡冈图雅黑洞视界与吸积盘（后环被黑洞视界遮挡） -->
      <svg class="cover-motif-svg cover-motif-svg--night" viewBox="0 0 220 76" fill="none">
        <line x1="16" y1="38" x2="204" y2="38" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 4" stroke-opacity="0.38"/>
        <circle cx="110" cy="38" r="30" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 4" stroke-opacity="0.42"/>
        <path d="M58 35C76 4 144 4 162 35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M66 43C84 68 136 68 154 43" stroke="currentColor" stroke-width="1.15" stroke-opacity="0.78" stroke-linecap="round"/>
        <path d="M42 49.5A69 15 0 0 1 178 26.5" transform="rotate(-9 110 38)" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.48" stroke-dasharray="3 3"/>
        <circle cx="110" cy="38" r="15" fill="var(--paper)" stroke="currentColor" stroke-width="1.45"/>
        <circle cx="110" cy="38" r="10.5" fill="currentColor"/>
        <path d="M41 38A69 15.5 0 0 0 179 38" transform="rotate(-9 110 38)" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M56 38A54 11 0 0 0 164 38" transform="rotate(-9 110 38)" stroke="currentColor" stroke-width="0.95" stroke-dasharray="4 3" stroke-opacity="0.82"/>
      </svg>
    </div>
  </div>
</div>`;
