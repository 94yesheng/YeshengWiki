/**
 * 文章/主页封面缺失时的主题化兜底封面（16:9 内联 SVG）。
 *
 * 导入包引用了本模块但没有带文件，这里按站点视觉语言重建：
 * 细网格 + 伯努利双纽线（∞）+ 三枚轨道粒子 + 等宽角标，颜色全部取自 CSS 变量，
 * 昼夜两套主题下都能自适应。
 */
export const THEME_COVER_SVG_HTML = `<svg class="theme-cover-svg" viewBox="0 0 960 540" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="默认封面：立体无限流形">
  <defs>
    <pattern id="cover-grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M60 0H0V60" fill="none" stroke="currentColor" stroke-opacity="0.09" stroke-width="1"/>
    </pattern>
    <radialGradient id="cover-glow" cx="50%" cy="46%" r="46%">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.16"/>
      <stop offset="70%" stop-color="var(--accent)" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="960" height="540" fill="currentColor" fill-opacity="0.02"/>
  <rect width="960" height="540" fill="url(#cover-grid)"/>
  <rect width="960" height="540" fill="url(#cover-glow)"/>

  <!-- 立体无限环：两条交织的伯努利双纽线 -->
  <g fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round">
    <path d="M300 270c0-58 44-96 96-96 66 0 108 60 84 118-20 48-74 82-136 82-92 0-160-56-160-128 0-86 76-152 176-152 118 0 210 76 210 176 0 110-94 192-224 192"/>
    <path d="M660 270c0-58-44-96-96-96-66 0-108 60-84 118 20 48 74 82 136 82 92 0 160-56 160-128 0-86-76-152-176-152-118 0-210 76-210 176 0 110 94 192 224 192" opacity="0.35"/>
  </g>

  <!-- 三枚轨道粒子 -->
  <g fill="var(--accent)">
    <circle cx="300" cy="270" r="5.5" fill-opacity="0.9"/>
    <circle cx="660" cy="270" r="4" fill-opacity="0.6"/>
    <circle cx="480" cy="152" r="3" fill-opacity="0.45"/>
  </g>

  <!-- 角标 -->
  <g font-family="var(--mono, ui-monospace, monospace)" fill="currentColor">
    <text x="48" y="60" font-size="15" letter-spacing="3" fill-opacity="0.72">COVER // ∞ MANIFOLD</text>
    <text x="48" y="84" font-size="12" letter-spacing="2" fill-opacity="0.42">SPATIAL LEMNISCATE · 16:9</text>
    <text x="912" y="500" font-size="12" letter-spacing="2" text-anchor="end" fill-opacity="0.42">YESHENG // STUDIO</text>
  </g>

  <!-- 四角准星 -->
  <g stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <path d="M32 52V32h20M908 32h20v20M928 488v20h-20M52 508H32v-20"/>
  </g>
</svg>`;
