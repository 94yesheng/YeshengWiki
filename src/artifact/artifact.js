(function () {
  var toastEl = document.getElementById('toast-msg');
  var toastTimer = 0;
  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.dataset.show = 'true';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.dataset.show = 'false';
    }, 2600);
  }

  var THEME_COLOR = { light: '#faf9f5', dark: '#121211' };

  var state = {
    mode: 'infinity',
    view: document.body.dataset.page === 'article' ? 'article' : 'home',
    particleCount: 560,
    speed: 1.0,
    mouseStrength: 1.0,
    time: 0
  };

  var MODE_META = {
    infinity: {
      pillText: 'DAY // 纯粒子无限环',
      topbarTag: 'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场',
      coordText: 'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）',
      originBadge: 'ORIGIN (0, 0, L3)',
      themeChip: 'DAY // 纯粒子无限环',
      equation: 'L3 : x = a·cos(t)/(1+sin²t), y = b·sin(t)cos(t)/(1+sin²t), z = c·sin(t)',
      labInd: 'DAY // INFINITY',
      fabLabel: 'NIGHT // 黑洞场'
    },
    gargantua: {
      pillText: 'NIGHT // 卡冈图雅黑洞',
      topbarTag: 'NIGHT SINGULARITY // 卡冈图雅黑洞与连续引力透镜纯粒子场',
      coordText: 'GARGANTUA SINGULARITY · 视界黑球、连续光子环与零断层开普勒粒子吸积盘',
      originBadge: 'SINGULARITY (r -> r_s)',
      themeChip: 'NIGHT // 卡冈图雅视界',
      equation: 'ds² = -(1-r_s/r)c²dt² + (1-r_s/r)⁻¹dr² + r²dΩ² · GRAVITATIONAL LENSING',
      labInd: 'NIGHT // GARGANTUA',
      fabLabel: 'DAY // 无限环'
    }
  };

  var SUN_SVG_CONTENT = '<circle cx="9" cy="9" r="3.6"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.1 4.1l1.4 1.4M12.5 12.5l1.4 1.4M13.9 4.1l-1.4 1.4M5.5 12.5l-1.4 1.4"/>';
  var MOON_SVG_CONTENT = '<path d="M14.5 11.8A5.8 5.8 0 0 1 6.2 3.5a5.8 5.8 0 1 0 8.3 8.3Z"/>';

  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }

  /* ========================================================================
     需求 7：结合无限主题与主页无限粒子模型的简洁加载动画
     ======================================================================== */
  var loaderEl = document.getElementById('infinity-loader');
  var loaderCanvas = document.getElementById('loader-infinity-canvas');
  var loaderFill = document.getElementById('loader-bar-fill');
  var loaderStatus = document.getElementById('loader-status-text');
  var loaderAnimId = 0;
  var loaderStartTs = 0;
  var loaderActive = false;

  function runInfinityLoader(durationMs) {
    if (!loaderEl) return;
    cancelAnimationFrame(loaderAnimId);
    loaderEl.dataset.loaded = 'false';
    loaderActive = true;
    loaderStartTs = performance.now();
    var dur = durationMs || 720;

    function stepLoader(now) {
      if (!loaderActive) return;
      var elapsed = now - loaderStartTs;
      var p = Math.min(1, elapsed / dur);
      if (loaderFill) loaderFill.style.width = Math.round(p * 100) + '%';
      if (loaderStatus) {
        loaderStatus.textContent = p < 0.85
          ? 'INFINITY MANIFOLD // 正在聚合纯粒子无限流形 (' + Math.round(p * 100) + '%)'
          : 'INFINITY MANIFOLD // 流形就绪 · READY';
      }

      if (loaderCanvas) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var rect = loaderCanvas.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) {
          var lw = Math.round(rect.width * dpr);
          var lh = Math.round(rect.height * dpr);
          if (loaderCanvas.width !== lw || loaderCanvas.height !== lh) {
            loaderCanvas.width = lw;
            loaderCanvas.height = lh;
          }
          var lctx = loaderCanvas.getContext('2d');
          var W = lw / dpr;
          var H = lh / dpr;
          lctx.save();
          lctx.scale(dpr, dpr);
          lctx.clearRect(0, 0, W, H);

          var cx = W * 0.5;
          var cy = H * 0.5;
          var a = W * 0.36;
          var b = H * 0.56;
          var tSec = now * 0.0024;
          var palette = ['217, 119, 87', '232, 146, 110', '242, 179, 126', '202, 112, 82'];

          // 沿伯努利双纽线运动的 42 颗纯粒子（无尾迹线段，与主页无限模型完全一致）
          for (var i = 0; i < 42; i++) {
            var u = (i / 42) * Math.PI * 2 + tSec * (0.9 + (i % 3) * 0.15);
            var sinU = Math.sin(u), cosU = Math.cos(u);
            var den = 1 + sinU * sinU;
            var spread = ((i % 5) - 2) * 2.2;
            var px = cx + (a * cosU) / den + Math.cos(u * 2 + i) * spread;
            var py = cy + (b * sinU * cosU) / den + Math.sin(u * 2 + i) * spread;
            var r = 1.3 + (i % 4) * 0.45;
            var col = palette[i % palette.length];

            if (i % 4 === 0) {
              lctx.beginPath();
              lctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
              lctx.fillStyle = 'rgba(' + col + ', 0.18)';
              lctx.fill();
            }
            lctx.beginPath();
            lctx.arc(px, py, r, 0, Math.PI * 2);
            lctx.fillStyle = 'rgba(' + col + ', 0.88)';
            lctx.fill();
          }
          lctx.restore();
        }
      }

      if (p < 1) {
        loaderAnimId = requestAnimationFrame(stepLoader);
      } else {
        loaderActive = false;
        loaderEl.dataset.loaded = 'true';
      }
    }

    loaderAnimId = requestAnimationFrame(stepLoader);
  }

  // 页面首次载入启动简洁无限加载动画
  runInfinityLoader(680);

  var btnReplayLoader = document.getElementById('btn-replay-loader');
  if (btnReplayLoader) {
    btnReplayLoader.addEventListener('click', function () {
      runInfinityLoader(950);
    });
  }

  /* ========================================================================
     需求 8：结合无限（∞）与黑洞（Singularity）主题的昼夜切换过渡动画
     ======================================================================== */
  var transStage = document.getElementById('theme-transition-stage');
  var transCanvas = document.getElementById('theme-transition-canvas');
  var transBadge = document.getElementById('theme-transition-badge');
  var transAnimId = 0;

  function playThemeTransition(targetTheme) {
    if (!transStage || !transCanvas) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    cancelAnimationFrame(transAnimId);
    var toDark = targetTheme === 'dark';
    transStage.dataset.active = 'true';
    if (transBadge) {
      transBadge.textContent = toDark
        ? 'SINGULARITY COLLAPSE // 无限流形 ∞ 坍缩至卡冈图雅黑洞'
        : 'MANIFOLD UNFOLD // 黑洞奇点展开至立体无限环 ∞';
    }

    var startTs = performance.now();
    var duration = 740;

    function stepTransition(now) {
      var p = Math.min(1, (now - startTs) / duration);
      var ease = 1 - Math.pow(1 - p, 3);
      var fadeAlpha = p < 0.25 ? (p / 0.25) : (1 - (p - 0.25) / 0.75);
      fadeAlpha = Math.max(0, Math.min(1, fadeAlpha));

      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(window.innerWidth * dpr);
      var h = Math.round(window.innerHeight * dpr);
      if (transCanvas.width !== w || transCanvas.height !== h) {
        transCanvas.width = w;
        transCanvas.height = h;
      }

      var ctx = transCanvas.getContext('2d');
      var W = w / dpr;
      var H = h / dpr;
      var cx = W * 0.5;
      var cy = H * 0.5;
      var minDim = Math.min(W, H);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      // 背景径向引力波涟漪
      var maxWaveR = Math.hypot(W, H) * 0.6;
      var waveR = Math.max(8, ease * maxWaveR);
      var waveGrad = ctx.createRadialGradient(cx, cy, waveR * 0.15, cx, cy, waveR);
      if (toDark) {
        waveGrad.addColorStop(0, 'rgba(18, 18, 17, ' + (fadeAlpha * 0.52).toFixed(3) + ')');
        waveGrad.addColorStop(0.7, 'rgba(217, 119, 87, ' + (fadeAlpha * 0.16).toFixed(3) + ')');
        waveGrad.addColorStop(1, 'rgba(18, 18, 17, 0)');
      } else {
        waveGrad.addColorStop(0, 'rgba(250, 249, 245, ' + (fadeAlpha * 0.52).toFixed(3) + ')');
        waveGrad.addColorStop(0.7, 'rgba(242, 179, 126, ' + (fadeAlpha * 0.18).toFixed(3) + ')');
        waveGrad.addColorStop(1, 'rgba(250, 249, 245, 0)');
      }
      ctx.fillStyle = waveGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
      ctx.fill();

      // 核心几何形变：morphFactor = 0 为平面无限环 ∞，morphFactor = 1 为黑洞奇点与吸积盘
      var morph = toDark ? ease : (1 - ease);
      var infScale = 1 - morph * 0.72;
      var a = minDim * 0.16 * infScale;
      var b = a * 0.85;
      var bhR = minDim * 0.055 * (0.25 + 0.75 * morph);

      // 绘制形变中的平面无限环 ∞
      if (morph < 0.92) {
        var infAlpha = (1 - morph) * fadeAlpha * 0.9;
        ctx.beginPath();
        for (var s = 0; s <= 96; s++) {
          var t = (s / 96) * Math.PI * 2;
          var st = Math.sin(t), ct = Math.cos(t);
          var den = 1 + st * st;
          var ix = (a * ct) / den;
          var iy = (b * st * ct) / den;
          // 随坍缩向中心旋转聚拢
          var rot = morph * 1.15;
          var rx = ix * Math.cos(rot) - iy * Math.sin(rot);
          var ry = ix * Math.sin(rot) + iy * Math.cos(rot);
          if (s === 0) ctx.moveTo(cx + rx, cy + ry);
          else ctx.lineTo(cx + rx, cy + ry);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(217, 119, 87, ' + infAlpha.toFixed(3) + ')';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }

      // 绘制形变中的平面黑洞视界与吸积环
      if (morph > 0.08) {
        var bhAlpha = morph * fadeAlpha * 0.95;
        // 平面吸积椭圆环
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.19);
        ctx.beginPath();
        ctx.ellipse(0, 0, bhR * 2.55, bhR * 0.52, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(242, 179, 126, ' + bhAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // 上方平面引力透镜弧
        ctx.beginPath();
        ctx.arc(0, 0, bhR * 1.25, Math.PI * 1.08, Math.PI * 1.92);
        ctx.strokeStyle = 'rgba(217, 119, 87, ' + (bhAlpha * 0.85).toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();

        // 中心事件视界圆盘
        ctx.beginPath();
        ctx.arc(cx, cy, bhR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(18, 18, 17, ' + bhAlpha.toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 228, 190, ' + bhAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 36 颗纯粒子随形变在双焦点与黑洞奇点之间收束/展开（纯粒子，无尾迹线）
      for (var k = 0; k < 36; k++) {
        var ang = (k / 36) * Math.PI * 2 + p * 2.2;
        var stK = Math.sin(ang), ctK = Math.cos(ang);
        var denK = 1 + stK * stK;
        var infPx = (a * 1.15 * ctK) / denK;
        var infPy = (b * 1.15 * stK * ctK) / denK;
        var diskR = bhR * (1.25 + (k % 5) * 0.34);
        var bhPx = diskR * Math.cos(ang * 1.5);
        var bhPy = diskR * Math.sin(ang * 1.5) * 0.28;

        var px = cx + infPx * (1 - morph) + bhPx * morph;
        var py = cy + infPy * (1 - morph) + bhPy * morph;
        ctx.beginPath();
        ctx.arc(px, py, 1.6 + (k % 3) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(217, 119, 87, ' + (fadeAlpha * 0.85).toFixed(3) + ')';
        ctx.fill();
      }

      ctx.restore();

      if (p < 1) {
        transAnimId = requestAnimationFrame(stepTransition);
      } else {
        transStage.dataset.active = 'false';
      }
    }

    transAnimId = requestAnimationFrame(stepTransition);
  }

  function applyTheme(nextTheme, withTransition) {
    if (withTransition) {
      playThemeTransition(nextTheme);
    }
    var mode = nextTheme === 'dark' ? 'gargantua' : 'infinity';
    state.mode = mode;
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem('theme', nextTheme);
    } catch (e) {}

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', nextTheme === 'dark' ? THEME_COLOR.dark : THEME_COLOR.light);

    var navSvg = document.getElementById('nav-theme-svg');
    if (navSvg) navSvg.innerHTML = nextTheme === 'dark' ? MOON_SVG_CONTENT : SUN_SVG_CONTENT;

    var fabSvg = document.getElementById('fab-theme-svg');
    if (fabSvg) {
      fabSvg.innerHTML = nextTheme === 'dark'
        ? '<circle cx="10" cy="10" r="4"/><path d="M10 2.2v2.2M10 15.6v2.2M2.2 10h2.2M15.6 10h2.2M4.5 4.5l1.6 1.6M13.9 13.9l1.6 1.6M15.5 4.5l-1.6 1.6M6.1 13.9l-1.6 1.6"/>'
        : '<path d="M16.2 12.4A6.8 6.8 0 0 1 7.6 3.8a6.8 6.8 0 1 0 8.6 8.6Z"/>';
    }

    var info = MODE_META[mode];
    var navModeText = document.getElementById('nav-mode-text');
    var heroTopbarTag = document.getElementById('hero-topbar-tag');
    var heroCoordText = document.getElementById('hero-coord-text');
    var heroOriginBadge = document.getElementById('hero-origin-badge');
    var heroThemeChip = document.getElementById('hero-theme-chip');
    var stageEq = document.getElementById('telemetry-equation');
    var labModeInd = document.getElementById('lab-mode-indicator');
    var fabThemeLabel = document.getElementById('fab-theme-label');

    if (navModeText) navModeText.textContent = info.pillText;
    if (heroTopbarTag) heroTopbarTag.textContent = info.topbarTag;
    if (heroCoordText) heroCoordText.textContent = info.coordText;
    if (heroOriginBadge) heroOriginBadge.textContent = info.originBadge;
    if (heroThemeChip) heroThemeChip.textContent = info.themeChip;
    if (stageEq) stageEq.textContent = info.equation;
    if (labModeInd) labModeInd.textContent = info.labInd;
    if (fabThemeLabel) fabThemeLabel.textContent = info.fabLabel;

    var themeBtns = document.querySelectorAll('[data-theme-mode]');
    themeBtns.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.themeMode === nextTheme ? 'true' : 'false');
    });

    if (nextTheme === 'dark') {
      playDivergenceMeter();
    }
  }

  /* 视图切换：主页五屏 (#home-view) <-> 重构文章详细页 (#article-view) */
  var homeView = document.getElementById('home-view');
  var articleView = document.getElementById('article-view');
  var screenRuler = document.getElementById('screen-ruler');
  var viewSwitchBtns = document.querySelectorAll('[data-switch-view]');

  var ARTICLE_DB = {
    mc: {
      slug: '/posts/mc-server/',
      path: '/posts/mc-server/',
      title: '如何快速零成本搭建一个 Mc 小型服务器',
      date: '二〇二五年三月十三日',
      tags: '技术 · 服务器',
      lead: '用尽量简单且低成本的方法让 Minecraft 服务器迅速跑起来。针对无公网 IP 场景，通过 frp 内网穿透结合本地闲置算力，三步完成多人联机部署。'
    },
    jibao: {
      slug: '/posts/ji-bao/',
      path: '/posts/ji-bao/',
      title: '3月9号，想吃鸡煲',
      date: '二〇二五年三月九日',
      tags: '随笔 · 日常',
      lead: '有些念头其实没有什么严密的逻辑推导，就像在三月初春的傍晚突然很想吃一锅热气腾腾的炭火鸡煲。记下这些微不足道却真实存在的生活切片，大概也是探索世界广度的一种方式。'
    },
    maptoposter: {
      slug: '/posts/maptoposter/',
      path: '/posts/maptoposter/',
      title: '一键生成城市地图壁纸 —— MapToPoster',
      date: '二〇二五年三月九日',
      tags: '技术 · 工具',
      lead: '利用 OpenStreetMap 的道路拓扑矢量与经纬度网格数据，通过 Python 脚本将任意城市的街道肌理渲染成极简理性的几何海报壁纸。'
    },
    blender: {
      slug: '/posts/blender/',
      path: '/posts/blender/',
      title: '七天了解一件事 —— Blender',
      date: '二〇二五年二月二十四日',
      tags: '技术 · 建模',
      lead: '给自己设定七天的时间边界，从零开始接触三维网格拓扑、修改器堆栈、着色器节点与 Cycles 光线追踪渲染。'
    },
    deepseek: {
      slug: '/posts/deepseek-wechat/',
      path: '/posts/deepseek-wechat/',
      title: '关于将 Deepseek 接入微信',
      date: '二〇二五年三月七日',
      tags: '技术 · AI',
      lead: '记录如何通过轻量级服务容器将 DeepSeek API 接入日常即时通讯工作流，配置上下文记忆窗口与异常重试机制。'
    }
  };

  function setViewMode(nextView, articleKey) {
    state.view = nextView;
    if (articleKey && ARTICLE_DB[articleKey]) {
      var item = ARTICLE_DB[articleKey];
      var topTitle = document.getElementById('detail-topbar-title');
      var mainTitle = document.getElementById('detail-main-title');
      var leadSummary = document.getElementById('detail-lead-summary');
      var metaDate = document.getElementById('detail-meta-date');
      var metaTags = document.getElementById('detail-meta-tags');
      if (topTitle) topTitle.textContent = item.slug + ' · ' + item.title;
      if (mainTitle) mainTitle.textContent = item.title;
      if (leadSummary) leadSummary.textContent = item.lead;
      if (metaDate) metaDate.textContent = item.date;
      if (metaTags) metaTags.textContent = item.tags;
    }

    var fabViewLabel = document.getElementById('fab-view-label');
    if (fabViewLabel) {
      fabViewLabel.textContent = nextView === 'article' ? 'VIEW // 返回主页' : 'VIEW // 切换文章页';
    }

    if (nextView === 'article') {
      if (homeView) homeView.hidden = true;
      if (articleView) articleView.hidden = false;
      if (screenRuler) screenRuler.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(resizeCanvas, 30);
    } else {
      if (articleView) articleView.hidden = true;
      if (homeView) homeView.hidden = false;
      if (screenRuler) screenRuler.style.display = '';
      setTimeout(resizeCanvas, 30);
    }

    viewSwitchBtns.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.switchView === nextView ? 'true' : 'false');
    });
  }

  viewSwitchBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setViewMode(btn.dataset.switchView);
    });
  });

  var backHomeBtn = document.getElementById('article-back-home');
  if (backHomeBtn) {
    backHomeBtn.addEventListener('click', function () {
      setViewMode('home');
    });
  }

  document.querySelectorAll('[data-nav-section]').forEach(function (navLink) {
    navLink.addEventListener('click', function (e) {
      var targetId = navLink.dataset.navSection;
      if (state.view !== 'home') {
        e.preventDefault();
        setViewMode('home');
        setTimeout(function () {
          var sec = document.getElementById(targetId);
          if (sec) sec.scrollIntoView({ behavior: 'smooth' });
        }, 40);
      }
    });
  });

  /* 右下角悬浮球交互 */
  var fab = document.getElementById('fab');
  var fabMain = document.getElementById('fab-main');
  var fabThemeBtn = fab ? fab.querySelector('[data-action="theme"]') : null;
  var fabViewBtn = fab ? fab.querySelector('[data-action="view"]') : null;
  var fabTopBtn = fab ? fab.querySelector('[data-action="top"]') : null;

  function setFabOpen(open) {
    if (!fab || !fabMain) return;
    if (open) fab.dataset.open = 'true';
    else delete fab.dataset.open;
    fabMain.setAttribute('aria-expanded', String(open));
  }

  if (fabMain) {
    fabMain.addEventListener('click', function () {
      setFabOpen(fab.dataset.open !== 'true');
    });
  }
  if (fabThemeBtn) {
    fabThemeBtn.addEventListener('click', function () {
      applyTheme(isDark() ? 'light' : 'dark', true);
    });
  }
  if (fabViewBtn) {
    fabViewBtn.addEventListener('click', function () {
      setViewMode(state.view === 'home' ? 'article' : 'home');
      setFabOpen(false);
    });
  }
  if (fabTopBtn) {
    fabTopBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setFabOpen(false);
    });
  }

  var navThemePill = document.getElementById('nav-theme-pill');
  if (navThemePill) {
    navThemePill.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      applyTheme(next, true);
      showToast(next === 'dark' ? '已切换至夜间模式：卡冈图雅黑洞纯粒子场已启动' : '已切换至白天模式：立体纯粒子无限环已启动');
    });
  }

  document.querySelectorAll('[data-theme-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.dataset.themeMode;
      applyTheme(next, true);
      showToast(next === 'dark' ? '已切换至夜间模式：卡冈图雅黑洞' : '已切换至白天模式：纯粒子无限环');
    });
  });

  var detailToggleTheme = document.getElementById('detail-toggle-theme');
  if (detailToggleTheme) {
    detailToggleTheme.addEventListener('click', function () {
      applyTheme(isDark() ? 'light' : 'dark', true);
    });
  }

  var detailCopyLink = document.getElementById('detail-copy-link');
  if (detailCopyLink) {
    detailCopyLink.addEventListener('click', function () {
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).catch(function () {});
      }
      showToast('已复制文章永久链接：' + url);
    });
  }

  var btnCopySiteCard = document.getElementById('btn-copy-site-card');
  if (btnCopySiteCard) {
    btnCopySiteCard.addEventListener('click', function () {
      var cardText = '站名：夜笙的小世界 | 网址：https://www.yesheng.wiki | 简介：一个普通人的自述 | RSS：https://www.yesheng.wiki/rss.xml';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cardText).catch(function () {});
      }
      showToast('已复制「夜笙的小世界」友链名片信息到剪贴板');
    });
  }

  function activateDarkAndScrollFoot(e) {
    if (e) e.preventDefault();
    applyTheme('dark', true);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    showToast('已切换至夜间黑洞模式，底部世界线变动率探测仪已点亮');
  }

  var footerDarkHint = document.getElementById('footer-dark-hint');
  if (footerDarkHint) footerDarkHint.addEventListener('click', activateDarkAndScrollFoot);
  var progTriggerDm = document.getElementById('prog-trigger-dm');
  if (progTriggerDm) progTriggerDm.addEventListener('click', activateDarkAndScrollFoot);

  /* 世界线变动率探测仪（Divergence Meter） */
  var GLYPHS = {
    0: { g: 'M30 6C41.6 6 51 25.7 51 50C51 74.3 41.6 94 30 94C18.4 94 9 74.3 9 50C9 25.7 18.4 6 30 6Z', c: 'M30 6V94M12 26H48' },
    1: { g: 'M14 26L31 6V94', c: 'M11 26H51' },
    2: { g: 'M10 26C10 12 20 6 30 6C41 6 50 12 50 26C50 40 38 52 28 66L9 94H52', c: 'M30 6V64M12 22H48' },
    3: { g: 'M10 8H50L26 44C44 44 52 56 52 68C52 84 43 94 30 94C20 94 13 90 8 83', c: 'M30 8V94M10 68H52' },
    4: { g: 'M35 6L8 70', c: 'M35 6V94M8 70H54' },
    5: { g: 'M51 7H23L21 47.4A24 24 0 1 1 8.5 82', c: 'M30 7V94M5 68H53' },
    6: { g: 'M10 29A20 23 0 1 0 50 29A20 23 0 1 0 10 29ZM50 31L30 94', c: 'M30 6V52M10 29H50', rot: true },
    7: { g: 'M12 8H50C40 40 30 70 24 94', c: 'M30 8V70M6 24H46' },
    8: { g: 'M33.4 41.7A18 18 0 1 0 26.6 41.7M26.6 42.3A22 26 0 1 0 33.4 42.3', c: 'M30 6V94M12 24H48M8 68H52' },
    9: { g: 'M10 29A20 23 0 1 0 50 29A20 23 0 1 0 10 29ZM50 31L30 94', c: 'M30 6V52M10 29H50' }
  };

  var dmHost = document.getElementById('dm-tubes-host');
  var dmDigitNodes = [];
  if (dmHost) {
    var tubeSpecs = [{ dot: false, init: 1 }, { dot: true, init: 0 }, { dot: false, init: 0 }, { dot: false, init: 4 }, { dot: false, init: 8 }, { dot: false, init: 5 }, { dot: false, init: 9 }, { dot: false, init: 6 }];
    tubeSpecs.forEach(function (spec) {
      var span = document.createElement('span');
      span.className = 'dm-tube';
      var ghostPaths = '';
      for (var d = 0; d <= 9; d++) {
        var tf = GLYPHS[d].rot ? ' transform="rotate(180 30 50)"' : '';
        ghostPaths += '<g data-n="' + d + '"' + tf + '><path class="g" d="' + GLYPHS[d].g + '"/><path class="c" d="' + GLYPHS[d].c + '"/></g>';
      }
      var litHtml = '';
      if (spec.dot) {
        litHtml = '<svg class="dm-lit" viewBox="0 0 60 110"><circle class="dm-dot" cx="51" cy="103" r="3.4"/></svg>';
      } else {
        var initTf = GLYPHS[spec.init].rot ? ' transform="rotate(180 30 50)"' : '';
        litHtml = '<svg class="dm-lit" viewBox="0 0 60 110"><g class="dm-lit-digit"' + initTf + '><path class="g" d="' + GLYPHS[spec.init].g + '"/><path class="c" d="' + GLYPHS[spec.init].c + '"/></g></svg>';
      }
      span.innerHTML = '<svg class="dm-ghost" viewBox="0 0 60 110">' + ghostPaths + '</svg>' + litHtml;
      dmHost.appendChild(span);
      if (!spec.dot) {
        dmDigitNodes.push(span.querySelector('.dm-lit-digit'));
      }
    });
  }

  function setTubeDigit(gNode, n) {
    if (!gNode || !GLYPHS[n]) return;
    var paths = gNode.querySelectorAll('path');
    if (paths[0]) paths[0].setAttribute('d', GLYPHS[n].g);
    if (paths[1]) paths[1].setAttribute('d', GLYPHS[n].c);
    if (GLYPHS[n].rot) gNode.setAttribute('transform', 'rotate(180 30 50)');
    else gNode.removeAttribute('transform');
  }

  var dmSpinTimer = 0;
  function playDivergenceMeter() {
    if (!dmDigitNodes.length) return;
    clearInterval(dmSpinTimer);
    var target = dmDigitNodes.map(function (_, idx) {
      return idx === 0 ? 1 : Math.floor(Math.random() * 10);
    });
    var ticks = 0;
    dmSpinTimer = window.setInterval(function () {
      ticks++;
      if (ticks < 20) {
        dmDigitNodes.forEach(function (node) {
          setTubeDigit(node, Math.floor(Math.random() * 10));
        });
      } else {
        clearInterval(dmSpinTimer);
        dmDigitNodes.forEach(function (node, idx) {
          setTubeDigit(node, target[idx]);
        });
      }
    }, 45);
  }

  /* 照片墙灯箱与文章预览切换 */
  var lbBox = null;
  var lbItems = [];
  var lbIndex = 0;

  function ensureLightbox() {
    if (lbBox) return lbBox;
    var el = document.createElement('div');
    el.className = 'lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<button type="button" class="lightbox-close" aria-label="关闭">×</button>' +
      '<button type="button" class="lightbox-nav" data-dir="prev" aria-label="上一张">‹</button>' +
      '<button type="button" class="lightbox-nav" data-dir="next" aria-label="下一张">›</button>' +
      '<img alt="" />' +
      '<p class="lightbox-note"><span class="lightbox-caption"></span><span class="lightbox-count"></span></p>';
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('.lightbox-close')) return closeLightbox();
      if (t.closest('[data-dir="prev"]')) return showLightboxAt(lbIndex - 1);
      if (t.closest('[data-dir="next"]')) return showLightboxAt(lbIndex + 1);
      if (!t.closest('img')) closeLightbox();
    });
    document.body.appendChild(el);
    lbBox = el;
    return el;
  }

  function showLightboxAt(i) {
    if (!lbBox || !lbItems.length) return;
    lbIndex = (i + lbItems.length) % lbItems.length;
    var a = lbItems[lbIndex];
    var img = lbBox.querySelector('img');
    img.src = a.getAttribute('href');
    img.alt = a.dataset.caption || '';
    lbBox.querySelector('.lightbox-caption').textContent = a.dataset.caption || '';
    lbBox.querySelector('.lightbox-count').textContent = (lbIndex + 1) + ' / ' + lbItems.length;
  }

  function closeLightbox() {
    document.body.classList.remove('lightbox-open');
    if (lbBox) {
      lbBox.remove();
      lbBox = null;
    }
  }

  var currentSpotId = 'mc';
  var defaultSpot = {
    id: 'mc',
    title: '如何快速零成本搭建一个 Mc 小型服务器',
    date: '三月十三日',
    tags: '技术 · 服务器',
    coord: 'ENTRY #01 · LATEST SPOTLIGHT // FEATURED',
    cover: (function () { var el = document.getElementById('spot-cover-img'); return el ? (el.getAttribute('src') || '') : ''; })(),
    excerpt: '本篇文章旨在用尽量简单且低成本的方法让 Mc 服务器迅速的跑起来。考虑到大部分人并没有公网 IP，本文将使用 frp（内网穿透）解决连接问题，只需配齐 Java 环境、服务端内核与内网穿透三要素即可零成本联机。'
  };

  function applyPostSpotlight(data, activeLink) {
    currentSpotId = data.id || 'mc';
    var spotTitle = document.getElementById('spot-title-link');
    var spotDate = document.getElementById('spot-date');
    var spotTags = document.getElementById('spot-tags');
    var spotCoord = document.getElementById('spot-coord-badge');
    var spotLead = document.getElementById('spot-lead-text');
    var spotReadBtn = document.getElementById('spot-read-btn');
    var spotCoverImg = document.getElementById('spot-cover-img');
    var spotPath =
      (ARTICLE_DB[currentSpotId] && ARTICLE_DB[currentSpotId].path) || '/posts/';
    var spotCoverLink = document.getElementById('spot-cover-link');
    if (spotTitle) {
      spotTitle.textContent = data.title;
      spotTitle.href = spotPath;
    }
    if (spotReadBtn) spotReadBtn.href = spotPath;
    if (spotCoverLink) spotCoverLink.href = spotPath;
    if (spotDate) spotDate.textContent = data.date;
    if (spotTags) spotTags.textContent = data.tags;
    if (spotCoord) spotCoord.textContent = data.coord;
    if (spotLead) spotLead.textContent = data.excerpt;
    if (spotCoverImg && data.cover) spotCoverImg.src = data.cover;

    var allLinks = document.querySelectorAll('#posts-recent-list a');
    allLinks.forEach(function (a) {
      if (a === activeLink) a.dataset.active = 'true';
      else delete a.dataset.active;
    });
  }

  var spotResetBtn = document.getElementById('spot-reset-btn');
  if (spotResetBtn) {
    spotResetBtn.addEventListener('click', function () {
      applyPostSpotlight(defaultSpot, null);
      showToast('已恢复展示最新一篇文章');
    });
  }

  document.addEventListener('click', function (e) {
    var lbLink = e.target.closest('a[data-lightbox]');
    if (lbLink) {
      e.preventDefault();
      lbItems = Array.from(document.querySelectorAll('a[data-lightbox]'));
      ensureLightbox();
      document.body.classList.add('lightbox-open');
      showLightboxAt(lbItems.indexOf(lbLink));
      return;
    }

    var openArtTrigger = e.target.closest('[data-open-article]');
    if (openArtTrigger) {
      e.preventDefault();
      var artKey = openArtTrigger.dataset.openArticle || currentSpotId || 'mc';
      setViewMode('article', artKey);
      showToast('已进入文章详细页（右侧运行《三体》引力运动模型）');
      return;
    }

    var switchArtTrigger = e.target.closest('[data-switch-article]');
    if (switchArtTrigger) {
      var nextKey = switchArtTrigger.dataset.switchArticle;
      setViewMode('article', nextKey);
      showToast('已切换至文章《' + (ARTICLE_DB[nextKey] ? ARTICLE_DB[nextKey].title : '') + '》');
      return;
    }

    var copyCodeBtn = e.target.closest('[data-copy-code]');
    if (copyCodeBtn) {
      var codeText = copyCodeBtn.dataset.copyCode;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeText).catch(function () {});
      }
      showToast('已复制配置代码到剪贴板');
      return;
    }

    var postLink = e.target.closest('a[data-post-title]');
    if (postLink) {
      e.preventDefault();
      applyPostSpotlight({
        id: postLink.dataset.postId || 'mc',
        title: postLink.dataset.postTitle,
        date: postLink.dataset.postDate || '',
        tags: postLink.dataset.postTags || '随笔',
        coord: postLink.dataset.postCoord || 'ARCHIVE ENTRY',
        cover: postLink.dataset.postCover || defaultSpot.cover,
        excerpt: postLink.dataset.postExcerpt || defaultSpot.excerpt
      }, postLink);
      showToast('已在右侧预览《' + postLink.dataset.postTitle + '》（16:9 横幅封面），点击「阅读全文」进入详细页');
      return;
    }

    var toastTrigger = e.target.closest('[data-preview-toast]');
    if (toastTrigger) {
      showToast(toastTrigger.dataset.previewToast);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!lbBox) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showLightboxAt(lbIndex - 1);
    else if (e.key === 'ArrowRight') showLightboxAt(lbIndex + 1);
  });

  /* 五屏刻度尺与导航高亮同步 */
  var screens = Array.from(document.querySelectorAll('.screen'));
  var rulerTicks = Array.from(document.querySelectorAll('.ruler-tick'));
  var navLinks = Array.from(document.querySelectorAll('.site-nav-link'));

  rulerTicks.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.dataset.scrollTo;
      var el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  });

  function onScrollUpdate() {
    if (state.view === 'home') {
      var center = window.scrollY + window.innerHeight * 0.45;
      var activeId = 'screen-hero';
      screens.forEach(function (sec) {
        if (sec.offsetTop <= center) activeId = sec.id;
      });
      rulerTicks.forEach(function (btn) {
        btn.setAttribute('aria-current', btn.dataset.scrollTo === activeId ? 'true' : 'false');
      });
      navLinks.forEach(function (link) {
        if (link.dataset.navSection === activeId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    } else {
      var docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var pct = Math.min(100, Math.max(0, Math.round((window.scrollY / docH) * 100)));
      var pBar = document.getElementById('sidebar-progress-bar');
      var pText = document.getElementById('sidebar-progress-text');
      var topProg = document.getElementById('detail-top-progress');
      if (pBar) pBar.style.width = pct + '%';
      if (pText) pText.textContent = pct + '%';
      if (topProg) topProg.textContent = pct + '%';
    }
  }
  window.addEventListener('scroll', onScrollUpdate, { passive: true });

  /* ========================================================================
     核心引擎：
     1. 主页白天模型 (drawInfinity3DModel)：纯粒子立体无限环（删去所有粒子连线与尾部线段，粒子本体纯粹是粒子）
     2. 主页夜间模型 (drawGargantuaParticleModel)：零断层卡冈图雅黑洞纯粒子场（删去尾部线段，消除赤道与透镜弧之间的粒子断层）
     3. 文章详细页右侧模型 (drawArticleThreeBodyCanvas)：《三体》三恒星 + 行星混沌引力运动模型
     ======================================================================== */
  var stageCanvas = document.getElementById('hero-stage-canvas');
  var articleCanvas = document.getElementById('article-infinity-canvas');
  var telemetryPhase = document.getElementById('telemetry-phase');
  var telemetryPcount = document.getElementById('telemetry-pcount');
  var telemetryCursor = document.getElementById('telemetry-cursor');

  var mouse = {
    active: false,
    x: 0,
    y: 0,
    nx: 0,
    ny: 0,
    snx: 0,
    sny: 0,
    vx: 0,
    vy: 0,
    energy: 0
  };

  var artMouse = {
    active: false,
    x: 0,
    y: 0,
    nx: 0,
    ny: 0,
    snx: 0,
    sny: 0
  };

  if (stageCanvas) {
    stageCanvas.addEventListener('pointermove', function (e) {
      var rect = stageCanvas.getBoundingClientRect();
      var px = e.clientX - rect.left;
      var py = e.clientY - rect.top;
      mouse.vx = px - mouse.x;
      mouse.vy = py - mouse.y;
      mouse.x = px;
      mouse.y = py;
      mouse.nx = ((px / Math.max(1, rect.width)) - 0.5) * 2;
      mouse.ny = ((py / Math.max(1, rect.height)) - 0.5) * 2;
      mouse.active = true;
      mouse.energy = Math.min(1, mouse.energy + Math.hypot(mouse.vx, mouse.vy) * 0.015);
    });
    stageCanvas.addEventListener('pointerleave', function () {
      mouse.active = false;
    });
  }

  if (articleCanvas) {
    articleCanvas.addEventListener('pointermove', function (e) {
      var rect = articleCanvas.getBoundingClientRect();
      var px = e.clientX - rect.left;
      var py = e.clientY - rect.top;
      artMouse.x = px;
      artMouse.y = py;
      artMouse.nx = ((px / Math.max(1, rect.width)) - 0.5) * 2;
      artMouse.ny = ((py / Math.max(1, rect.height)) - 0.5) * 2;
      artMouse.active = true;
    });
    articleCanvas.addEventListener('pointerleave', function () {
      artMouse.active = false;
    });
    articleCanvas.addEventListener('click', function () {
      perturbThreeBodySystem();
      showToast('已对《三体》恒星系统施加引力微扰（蝴蝶效应已触发）');
    });
  }

  var perturbBtn = document.getElementById('detail-perturb-threebody');
  if (perturbBtn) {
    perturbBtn.addEventListener('click', function () {
      perturbThreeBodySystem();
      showToast('已对《三体》恒星系统施加引力微扰');
    });
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (stageCanvas) {
      var rect = stageCanvas.getBoundingClientRect();
      if (rect.width >= 10 && rect.height >= 10) {
        var w = Math.round(rect.width * dpr);
        var h = Math.round(rect.height * dpr);
        if (stageCanvas.width !== w || stageCanvas.height !== h) {
          stageCanvas.width = w;
          stageCanvas.height = h;
        }
      }
    }
    if (articleCanvas) {
      var aRect = articleCanvas.getBoundingClientRect();
      if (aRect.width >= 10 && aRect.height >= 10) {
        var aw = Math.round(aRect.width * dpr);
        var ah = Math.round(aRect.height * dpr);
        if (articleCanvas.width !== aw || articleCanvas.height !== ah) {
          articleCanvas.width = aw;
          articleCanvas.height = ah;
        }
      }
    }
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 30);

  // 确定性伪随机生成器
  var rngSeed = 1337;
  function nextRand() {
    rngSeed = (rngSeed * 16807) % 2147483647;
    return (rngSeed - 1) / 2147483646;
  }

  var PURE_INFINITY_PALETTE = [
    '217, 119, 87',   // 主赤陶色 #d97757
    '232, 146, 110',  // 暖珊瑚色 #e8926e
    '242, 179, 126',  // 琥珀流金 #f2b37e
    '202, 112, 82',   // 深赤陶暖调 #ca7052
    '238, 165, 136'   // 柔光暖杏 #eea588
  ];

  var MAX_PARTICLES = 780;
  var particles = [];
  var clusterCenters = [0.28, 1.15, 2.05, 3.35, 4.22, 5.48];

  for (var i = 0; i < MAX_PARTICLES; i++) {
    var baseU;
    if (nextRand() < 0.72) {
      var cIdx = Math.floor(nextRand() * clusterCenters.length);
      var spread = (nextRand() - 0.5) * 0.68 + (nextRand() - 0.5) * 0.42;
      baseU = (clusterCenters[cIdx] + spread + Math.PI * 2) % (Math.PI * 2);
    } else {
      baseU = nextRand() * Math.PI * 2;
    }

    var radialPow = Math.pow(nextRand(), 1.75);
    var outlier = nextRand() < 0.14 ? (1.3 + nextRand() * 1.0) : 1.0;
    var crossAngle = nextRand() * Math.PI * 2;
    var streamId = i % 7;

    // 黑洞参数：连续无断层分布
    // branch 0 (52%): 主吸积盘 + 北极引力透镜连续主拱桥
    // branch 1 (28%): 主吸积盘 + 南极次级引力透镜连续下拱桥
    // branch 2 (20%): 紧贴事件视界外缘的 360° 连续光子环粒子带（彻底填平赤道与极区过渡）
    var bhR = Math.pow(nextRand(), 1.38);
    var bhPhi = nextRand() * Math.PI * 2;
    var bhRoleRand = nextRand();
    var bhBranch = bhRoleRand < 0.52 ? 0 : (bhRoleRand < 0.80 ? 1 : 2);

    particles.push({
      idx: i,
      u: baseU,
      uSpeed: 0.28 + nextRand() * 0.46,
      streamId: streamId,
      cx: Math.cos(crossAngle) * radialPow * outlier,
      cy: Math.sin(crossAngle) * radialPow * outlier,
      cz: (nextRand() - 0.5) * 2.0 * radialPow * outlier,
      phaseOffset: nextRand() * Math.PI * 2,
      size: 1.2 + Math.pow(nextRand(), 1.55) * 1.75,
      colorRGB: PURE_INFINITY_PALETTE[i % PURE_INFINITY_PALETTE.length],
      rNorm: bhR,
      phi: bhPhi,
      branch: bhBranch,
      bhJitter: (nextRand() - 0.5) * 2.0,
      dx: 0,
      dy: 0,
      dvx: 0,
      dvy: 0,
      glow: 0
    });
  }

  function project3D(x, y, z, rotX, rotY, rotZ, cx, cy, fov) {
    var cz = Math.cos(rotZ), sz = Math.sin(rotZ);
    var x1 = x * cz - y * sz;
    var y1 = x * sz + y * cz;
    var z1 = z;

    var cxr = Math.cos(rotX), sxr = Math.sin(rotX);
    var y2 = y1 * cxr - z1 * sxr;
    var z2 = y1 * sxr + z1 * cxr;
    var x2 = x1;

    var cyr = Math.cos(rotY), syr = Math.sin(rotY);
    var x3 = x2 * cyr + z2 * syr;
    var z3 = -x2 * syr + z2 * cyr;
    var y3 = y2;

    var scale = fov / (fov + z3 + 520);
    return {
      sx: cx + x3 * scale,
      sy: cy + y3 * scale,
      z: z3,
      scale: scale
    };
  }

  function computeMouseWaveOffset(sx, sy) {
    if (!mouse.active || state.mouseStrength <= 0.01) return { ox: 0, oy: 0, boost: 0 };
    var dx = sx - mouse.x;
    var dy = sy - mouse.y;
    var distSq = dx * dx + dy * dy;
    var radius = 155;
    if (distSq > radius * radius) return { ox: 0, oy: 0, boost: 0 };
    var dist = Math.sqrt(distSq) + 0.001;
    var falloff = Math.exp(-distSq / (2 * 62 * 62)) * state.mouseStrength;
    var push = falloff * 19;
    var swirl = falloff * 12;
    return {
      ox: (dx / dist) * push - (dy / dist) * swirl,
      oy: (dy / dist) * push + (dx / dist) * swirl,
      boost: falloff
    };
  }

  function updateParticleSpring(pt, sx, sy, dt) {
    var mw = computeMouseWaveOffset(sx, sy);
    var springK = 18.0;
    var damping = 5.5;
    var ax = (mw.ox * 1.35 - pt.dx) * springK - pt.dvx * damping;
    var ay = (mw.oy * 1.35 - pt.dy) * springK - pt.dvy * damping;
    pt.dvx += ax * dt;
    pt.dvy += ay * dt;
    pt.dx += pt.dvx * dt;
    pt.dy += pt.dvy * dt;
    pt.glow = mw.boost;
  }

  /* 外围几何参考环与极坐标虚线轴 */
  function drawDetachedReferenceFrame(ctx, cx, cy, W, H, faintRGB, accentRGB) {
    var rOuter = Math.min(W, H) * 0.468;
    ctx.save();
    ctx.strokeStyle = 'rgba(' + faintRGB + ', 0.20)';
    ctx.lineWidth = 0.75;
    for (var q = 0; q < 4; q++) {
      var startA = q * (Math.PI * 0.5) + 0.14;
      var endA = (q + 1) * (Math.PI * 0.5) - 0.14;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, startA, endA);
      ctx.stroke();
    }

    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(' + accentRGB + ', 0.11)';
    ctx.beginPath();
    ctx.moveTo(cx - rOuter * 1.08, cy);
    ctx.lineTo(cx + rOuter * 1.08, cy);
    ctx.moveTo(cx, cy - rOuter * 0.88);
    ctx.lineTo(cx, cy + rOuter * 0.88);
    ctx.stroke();
    ctx.restore();
  }

  /* ----------------------------------------------------------------------
     需求 1（白天模型）：立体纯粒子无限环
     删去所有粒子间连线、删去尾部线段、删去背景丝带线，粒子本体纯粹是发光粒子
     ---------------------------------------------------------------------- */
  function drawInfinity3DModel(ctx, cx, cy, W, H, dt) {
    var minDim = Math.min(W, H);
    var a = Math.min(W * 0.44, minDim * 0.52);
    var b = a * 0.88;
    var c = a * 0.34;
    var tubeRadius = a * 0.105;
    var fov = 680;

    var rotX = 0.22 * Math.sin(state.time * 0.36) + mouse.sny * 0.15;
    var rotY = 0.24 * Math.cos(state.time * 0.28) + mouse.snx * 0.17;
    var rotZ = -0.06 + 0.075 * Math.sin(state.time * 0.22);

    var count = Math.min(state.particleCount, MAX_PARTICLES);
    var renderList = [];

    for (var i = 0; i < count; i++) {
      var pt = particles[i];
      var speedMod = 0.78 + 0.42 * Math.sin(pt.u * 2.0 + pt.phaseOffset);
      pt.u = (pt.u + pt.uSpeed * speedMod * 0.68 * dt * state.speed) % (Math.PI * 2);

      var t = pt.u;
      var sinT = Math.sin(t);
      var cosT = Math.cos(t);
      var denom = 1 + sinT * sinT;

      var bx = (a * cosT) / denom;
      var by = (b * sinT * cosT) / denom;
      var bz = c * sinT;

      var streamAngle = (pt.streamId / 7) * Math.PI * 2 + t * 1.5 + state.time * 0.55;
      var cosTw = Math.cos(streamAngle), sinTw = Math.sin(streamAngle);
      var rx = pt.cx * cosTw - pt.cy * sinTw;
      var ry = pt.cx * sinTw + pt.cy * cosTw;

      var localSpread = tubeRadius * (0.72 + 0.38 * Math.sin(t * 2 + pt.phaseOffset));
      var ox = rx * localSpread;
      var oy = ry * localSpread * 0.92;
      var oz = pt.cz * localSpread * 1.08;

      var proj = project3D(bx + ox, by + oy, bz + oz, rotX, rotY, rotZ, cx, cy, fov);
      updateParticleSpring(pt, proj.sx, proj.sy, dt);

      renderList.push({
        x: proj.sx + pt.dx,
        y: proj.sy + pt.dy,
        z: proj.z,
        size: pt.size,
        colorRGB: pt.colorRGB,
        glow: pt.glow
      });
    }

    renderList.sort(function (p1, p2) { return p2.z - p1.z; });

    // 纯粒子渲染（无任何尾部线段、无粒子间连线）
    for (var j = 0; j < renderList.length; j++) {
      var r = renderList[j];
      var depthNorm = Math.max(0.32, Math.min(1.0, 0.74 - r.z / (a * 1.85)));
      var alpha = Math.min(0.98, 0.44 + 0.50 * depthNorm + r.glow * 0.28);
      var radius = r.size * (0.88 + 0.26 * depthNorm) + r.glow * 0.5;

      if (r.size > 1.95 || r.glow > 0.12) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius * 2.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + r.colorRGB + ', ' + (alpha * 0.18).toFixed(3) + ')';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + r.colorRGB + ', ' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  /* ----------------------------------------------------------------------
     需求 1（夜间模型）：卡冈图雅黑洞纯粒子模型（消除视觉断层 + 移除尾部线段）
     ---------------------------------------------------------------------- */
  function drawGargantuaParticleModel(ctx, cx, cy, W, H, dt) {
    var minDim = Math.min(W, H);
    var Rs = minDim * 0.136; // 事件视界半径
    var tiltRad = 1.385 + Math.sin(state.time * 0.22) * 0.018 + mouse.sny * 0.045;
    var rollRad = -0.21 + Math.cos(state.time * 0.16) * 0.016 + mouse.snx * 0.045;
    var cr = Math.cos(rollRad), sr = Math.sin(rollRad);

    var rInner = Rs * 1.08;
    var rOuter = Math.min(W * 0.46, minDim * 0.50);

    function toScreen(lx, ly) {
      return {
        x: cx + (lx * cr - ly * sr),
        y: cy + (lx * sr + ly * cr)
      };
    }

    // 1. 背景深空引力场柔和光晕
    ctx.save();
    var ambientHalo = ctx.createRadialGradient(cx, cy, Rs * 0.88, cx, cy, rOuter * 0.95);
    ambientHalo.addColorStop(0, 'rgba(217, 119, 87, 0.22)');
    ambientHalo.addColorStop(0.32, 'rgba(235, 148, 110, 0.09)');
    ambientHalo.addColorStop(0.68, 'rgba(180, 95, 65, 0.025)');
    ambientHalo.addColorStop(1, 'rgba(20, 20, 19, 0)');
    ctx.fillStyle = ambientHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. 计算全部黑洞纯粒子的连续三维投影位置（彻底消除左右翼赤道交界处的跳跃断层）
    var count = Math.min(state.particleCount, MAX_PARTICLES);
    var backParticles = [];
    var frontParticles = [];

    for (var i = 0; i < count; i++) {
      var pt = particles[i];
      var keplerOmega = 1.25 / Math.pow(0.22 + pt.rNorm, 1.32);
      pt.phi = (pt.phi + keplerOmega * dt * state.speed) % (Math.PI * 2);

      var cosP = Math.cos(pt.phi);
      var sinP = Math.sin(pt.phi);
      var lx, ly;
      var isFrontDisk = false;

      if (pt.branch === 2) {
        // branch 2: 360° 连续环绕事件视界外缘的高能光子环与内晕粒子流（无死角衔接上下透镜弧与赤道盘）
        var rHalo = Rs * (1.035 + 0.52 * Math.pow(pt.rNorm, 1.45));
        lx = rHalo * cosP * (1.12 + 0.22 * pt.rNorm);
        ly = rHalo * sinP * (1.02 + 0.10 * pt.rNorm) + pt.cz * 2.0;
        isFrontDisk = false;
      } else {
        // branch 0 & 1: 连续吸积盘 + 上下爱因斯坦引力透镜拱桥
        var r = rInner + pt.rNorm * (rOuter - rInner) + pt.bhJitter * Rs * 0.04;
        lx = r * cosP;
        var flatY = r * sinP * Math.cos(tiltRad) + pt.cz * 2.5;

        if (sinP >= 0) {
          // 前半赤道盘（横跨黑球正前方）：在 sinP = 0 处 ly = pt.cz * 2.5，与后半盘在左右两翼 100% 连续衔接
          isFrontDisk = true;
          var frontDip = Math.sin(pt.phi) * Math.exp(-(lx * lx) / (2 * (Rs * 1.25) * (Rs * 1.25)));
          ly = flatY * 0.82 + frontDip * Rs * 0.06;
        } else {
          // 后半盘受克尔引力场平滑弯曲：弯曲幅度严格正比于 s = -sinP（在 sinP = 0 处 s = 0，因此零断层！）
          isFrontDisk = false;
          var s = -sinP; // 0 (左右翼交界) -> 1 (黑球正后方) -> 0
          var sCurve = Math.pow(s, 0.84);
          if (pt.branch === 0) {
            // 北极上方主引力透镜拱桥
            var topArchH = Rs * (1.08 + 0.78 * Math.pow(pt.rNorm, 0.88)) + r * 0.14 * (1 - pt.rNorm);
            ly = flatY * (1 - s * 0.72) - sCurve * topArchH;
          } else {
            // 南极下方次级引力透镜拱桥
            var botArchH = Rs * (1.04 + 0.66 * Math.pow(pt.rNorm, 0.90)) + r * 0.12 * (1 - pt.rNorm);
            ly = flatY * (1 - s * 0.72) + sCurve * botArchH;
          }

          // 平滑视界排斥包络（仅随 s 平滑生效，绝不在赤道翼产生突变）
          var dCenter = Math.hypot(lx, ly);
          var minR = Rs * (1.0 + 0.035 * s);
          if (dCenter < minR && dCenter > 0.001) {
            var pushScale = 1 + ((minR / dCenter) - 1) * s;
            lx *= pushScale;
            ly *= pushScale;
          }
        }
      }

      var sp = toScreen(lx, ly);
      updateParticleSpring(pt, sp.x, sp.y, dt);

      // 相对论多普勒增亮效应（迎面侧更亮偏暖白金，退行侧偏深赤陶）
      var doppler = Math.max(0.32, Math.min(1.42, 0.88 - 0.50 * cosP));
      var innerHeat = pt.branch === 2 ? (0.65 + 0.35 * (1 - pt.rNorm)) : Math.pow(1 - pt.rNorm, 1.55);
      var alpha = Math.min(0.98, (0.40 + 0.46 * doppler + 0.24 * innerHeat) * (1 - pt.rNorm * 0.25) + pt.glow * 0.28);

      var colorRGB;
      if (innerHeat > 0.54 && doppler > 0.92) {
        colorRGB = '255, 238, 210';
      } else if (innerHeat > 0.26 || doppler > 0.88) {
        colorRGB = '244, 178, 120';
      } else {
        colorRGB = '217, 119, 87';
      }

      var item = {
        x: sp.x + pt.dx,
        y: sp.y + pt.dy,
        r: pt.size * (0.82 + 0.28 * innerHeat) + pt.glow * 0.4,
        colorRGB: colorRGB,
        alpha: alpha,
        innerHeat: innerHeat
      };

      if (isFrontDisk) frontParticles.push(item);
      else backParticles.push(item);
    }

    function renderPureParticles(list) {
      for (var k = 0; k < list.length; k++) {
        var p = list[k];
        if (p.r > 1.85 || p.innerHeat > 0.5) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(' + p.colorRGB + ', ' + (p.alpha * 0.18).toFixed(3) + ')';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.colorRGB + ', ' + p.alpha.toFixed(3) + ')';
        ctx.fill();
      }
    }

    // 渲染黑球后方的连续引力透镜纯粒子
    renderPureParticles(backParticles);

    // 3. 中央事件视界黑球本体 + 光子环微光边缘
    ctx.save();
    var photonGlow = ctx.createRadialGradient(cx - Rs * 0.08, cy, Rs * 0.94, cx, cy, Rs * 1.32);
    photonGlow.addColorStop(0, 'rgba(255, 225, 185, 0.48)');
    photonGlow.addColorStop(0.32, 'rgba(217, 119, 87, 0.22)');
    photonGlow.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = photonGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.32, 0, Math.PI * 2);
    ctx.fill();

    var abyssGrad = ctx.createRadialGradient(cx - Rs * 0.22, cy - Rs * 0.20, Rs * 0.05, cx, cy, Rs);
    abyssGrad.addColorStop(0, '#100f0e');
    abyssGrad.addColorStop(0.55, '#070706');
    abyssGrad.addColorStop(0.92, '#020202');
    abyssGrad.addColorStop(1, '#000000');
    ctx.beginPath();
    ctx.arc(cx, cy, Rs, 0, Math.PI * 2);
    ctx.fillStyle = abyssGrad;
    ctx.fill();
    ctx.restore();

    // 4. 渲染横跨黑球正前方的赤道吸积盘纯粒子流
    renderPureParticles(frontParticles);
  }

  /* ----------------------------------------------------------------------
     需求 2：文章详细页右侧模型 —— 《三体》三个天体的混沌引力运动模型
     模拟三颗恒星 (S1, S2, S3) 与三体行星 (Trisolaris) 在三维引力场中的混沌运动
     ---------------------------------------------------------------------- */
  var threeBodyState = {
    suns: [],
    planet: null,
    dust: [],
    era: 'CHAOTIC',
    flux: 1.42
  };

  function initThreeBodySystem() {
    threeBodyState.suns = [
      {
        name: 'ALPHA // 恒星 α',
        mass: 1.18,
        x: -78, y: -32, z: 18,
        vx: 16, vy: -42, vz: 14,
        radius: 6.8,
        colorRGB: '242, 179, 126', // 琥珀流金巨星
        coreHex: '#fff4df',
        trail: []
      },
      {
        name: 'BETA // 恒星 β',
        mass: 1.04,
        x: 82, y: -18, z: -22,
        vx: 18, vy: 46, vz: -12,
        radius: 6.0,
        colorRGB: '217, 119, 87',  // 赤陶主序星
        coreHex: '#ffe3d1',
        trail: []
      },
      {
        name: 'GAMMA // 恒星 γ',
        mass: 0.90,
        x: -4, y: 64, z: 6,
        vx: -42, vy: -4, vz: -4,
        radius: 5.0,
        colorRGB: '238, 165, 136', // 暖白高密伴星
        coreHex: '#ffffff',
        trail: []
      }
    ];

    threeBodyState.planet = {
      name: 'TRISOLARIS // 三体星',
      x: 24, y: 12, z: -8,
      vx: -28, vy: 34, vz: 18,
      radius: 2.5,
      colorRGB: '120, 140, 93',
      trail: []
    };

    threeBodyState.dust = [];
    for (var d = 0; d < 76; d++) {
      var ang = (d / 76) * Math.PI * 2;
      var rad = 28 + (d % 9) * 14;
      threeBodyState.dust.push({
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad * 0.72,
        z: ((d % 7) - 3) * 16,
        vx: -Math.sin(ang) * 22,
        vy: Math.cos(ang) * 18,
        vz: ((d % 5) - 2) * 5,
        size: 1.0 + (d % 3) * 0.45,
        colorRGB: PURE_INFINITY_PALETTE[d % PURE_INFINITY_PALETTE.length]
      });
    }
  }

  initThreeBodySystem();

  function perturbThreeBodySystem() {
    var suns = threeBodyState.suns;
    for (var i = 0; i < suns.length; i++) {
      suns[i].vx += (Math.random() - 0.5) * 38;
      suns[i].vy += (Math.random() - 0.5) * 38;
      suns[i].vz += (Math.random() - 0.5) * 26;
    }
    // 质心动量归零
    var px = 0, py = 0, pz = 0, totalM = 0;
    for (var j = 0; j < suns.length; j++) {
      px += suns[j].vx * suns[j].mass;
      py += suns[j].vy * suns[j].mass;
      pz += suns[j].vz * suns[j].mass;
      totalM += suns[j].mass;
    }
    for (var k = 0; k < suns.length; k++) {
      suns[k].vx -= px / totalM;
      suns[k].vy -= py / totalM;
      suns[k].vz -= pz / totalM;
    }
  }

  function stepThreeBodyPhysics(dt) {
    var suns = threeBodyState.suns;
    var planet = threeBodyState.planet;
    if (!suns.length || !planet) return;

    var subSteps = 4;
    var h = (dt * state.speed * 1.15) / subSteps;
    var G = 165000;
    var softSq = 34 * 34;

    for (var step = 0; step < subSteps; step++) {
      var ax = [0, 0, 0], ay = [0, 0, 0], az = [0, 0, 0];

      // 三颗恒星之间的相互万有引力 + 边界柔和中心约束势（防止三体系统逃逸出视口）
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (i === j) continue;
          var dx = suns[j].x - suns[i].x;
          var dy = suns[j].y - suns[i].y;
          var dz = suns[j].z - suns[i].z;
          var rSq = dx * dx + dy * dy + dz * dz + softSq;
          var invR3 = 1 / (rSq * Math.sqrt(rSq));
          var f = G * suns[j].mass * invR3;
          ax[i] += dx * f;
          ay[i] += dy * f;
          az[i] += dz * f;
        }
        // 柔性边界谐振约束
        var distOrigin = Math.hypot(suns[i].x, suns[i].y, suns[i].z);
        var pull = 0.22 + (distOrigin > 95 ? (distOrigin - 95) * 0.012 : 0);
        ax[i] -= suns[i].x * pull;
        ay[i] -= suns[i].y * pull;
        az[i] -= suns[i].z * pull * 1.25;
      }

      var bx = 0, by = 0, bz = 0, bvx = 0, bvy = 0, bvz = 0, tm = 0;
      for (var m = 0; m < 3; m++) {
        suns[m].vx += ax[m] * h;
        suns[m].vy += ay[m] * h;
        suns[m].vz += az[m] * h;

        // 速度维里包络调节，保持三体混沌轨道长期充满活力且不发散
        var vMag = Math.hypot(suns[m].vx, suns[m].vy, suns[m].vz);
        if (vMag > 92) {
          var sDown = 92 / vMag;
          suns[m].vx *= sDown;
          suns[m].vy *= sDown;
          suns[m].vz *= sDown;
        } else if (vMag < 22) {
          var sUp = 22 / (vMag + 0.1);
          suns[m].vx *= sUp;
          suns[m].vy *= sUp;
          suns[m].vz *= sUp;
        }

        suns[m].x += suns[m].vx * h;
        suns[m].y += suns[m].vy * h;
        suns[m].z += suns[m].vz * h;

        bx += suns[m].x * suns[m].mass;
        by += suns[m].y * suns[m].mass;
        bz += suns[m].z * suns[m].mass;
        bvx += suns[m].vx * suns[m].mass;
        bvy += suns[m].vy * suns[m].mass;
        bvz += suns[m].vz * suns[m].mass;
        tm += suns[m].mass;
      }

      // 保持三体系统质心稳定在画布中心
      bx /= tm; by /= tm; bz /= tm;
      bvx /= tm; bvy /= tm; bvz /= tm;
      for (var n = 0; n < 3; n++) {
        suns[n].x -= bx * 0.25;
        suns[n].y -= by * 0.25;
        suns[n].z -= bz * 0.25;
        suns[n].vx -= bvx * 0.15;
        suns[n].vy -= bvy * 0.15;
        suns[n].vz -= bvz * 0.15;
      }

      // 三体行星在三颗太阳引力场中的混沌穿梭
      var pax = -planet.x * 0.32;
      var pay = -planet.y * 0.32;
      var paz = -planet.z * 0.42;
      for (var sIdx = 0; sIdx < 3; sIdx++) {
        var pdx = suns[sIdx].x - planet.x;
        var pdy = suns[sIdx].y - planet.y;
        var pdz = suns[sIdx].z - planet.z;
        var prSq = pdx * pdx + pdy * pdy + pdz * pdz + 26 * 26;
        var pf = (G * 0.62 * suns[sIdx].mass) / (prSq * Math.sqrt(prSq));
        pax += pdx * pf;
        pay += pdy * pf;
        paz += pdz * pf;
      }
      planet.vx += pax * h;
      planet.vy += pay * h;
      planet.vz += paz * h;
      var pvMag = Math.hypot(planet.vx, planet.vy, planet.vz);
      if (pvMag > 115) {
        planet.vx *= 115 / pvMag;
        planet.vy *= 115 / pvMag;
        planet.vz *= 115 / pvMag;
      }
      planet.x += planet.vx * h;
      planet.y += planet.vy * h;
      planet.z += planet.vz * h;
    }

    // 记录轨迹点并计算三体星当前所处纪元（恒纪元 vs 乱纪元）
    var totalFlux = 0;
    for (var tIdx = 0; tIdx < 3; tIdx++) {
      var sun = suns[tIdx];
      sun.trail.push({ x: sun.x, y: sun.y, z: sun.z });
      if (sun.trail.length > 68) sun.trail.shift();

      var distP = Math.hypot(sun.x - planet.x, sun.y - planet.y, sun.z - planet.z);
      totalFlux += (sun.mass * 2400) / (distP * distP + 400);
    }
    planet.trail.push({ x: planet.x, y: planet.y, z: planet.z });
    if (planet.trail.length > 82) planet.trail.shift();

    threeBodyState.flux = totalFlux;
    if (totalFlux > 2.15) {
      threeBodyState.era = 'CHAOTIC ERA // 乱纪元 · 烈日凌空';
    } else if (totalFlux < 0.78) {
      threeBodyState.era = 'CHAOTIC ERA // 乱纪元 · 飞星严寒';
    } else {
      threeBodyState.era = 'STABLE ERA // 恒纪元 · 引力平衡';
    }

    // 更新周围纯星尘微粒（仅绘制纯粒子，无尾迹线段）
    var dust = threeBodyState.dust;
    for (var dIdx = 0; dIdx < dust.length; dIdx++) {
      var dp = dust[dIdx];
      var dax = -dp.x * 0.25, day = -dp.y * 0.25, daz = -dp.z * 0.35;
      for (var si = 0; si < 3; si++) {
        var ddx = suns[si].x - dp.x;
        var ddy = suns[si].y - dp.y;
        var ddz = suns[si].z - dp.z;
        var drSq = ddx * ddx + ddy * ddy + ddz * ddz + 42 * 42;
        var df = (G * 0.24 * suns[si].mass) / (drSq * Math.sqrt(drSq));
        dax += ddx * df;
        day += ddy * df;
        daz += ddz * df;
      }
      dp.vx = (dp.vx + dax * dt) * 0.992;
      dp.vy = (dp.vy + day * dt) * 0.992;
      dp.vz = (dp.vz + daz * dt) * 0.992;
      dp.x += dp.vx * dt;
      dp.y += dp.vy * dt;
      dp.z += dp.vz * dt;
    }
  }

  function drawArticleThreeBodyCanvas(ctx, W, H, dt) {
    stepThreeBodyPhysics(dt);

    var cx = W * 0.5;
    var cy = H * 0.52;
    var minDim = Math.min(W, H);
    var viewScale = minDim / 185;
    var fov = 520;

    var targetAx = artMouse.active ? artMouse.nx : 0;
    var targetAy = artMouse.active ? artMouse.ny : 0;
    artMouse.snx += (targetAx - artMouse.snx) * 0.08;
    artMouse.sny += (targetAy - artMouse.sny) * 0.08;

    var rotX = 0.28 + 0.14 * Math.sin(state.time * 0.32) + artMouse.sny * 0.28;
    var rotY = 0.22 * Math.cos(state.time * 0.25) + artMouse.snx * 0.32;
    var rotZ = 0.08 * Math.sin(state.time * 0.19);

    var dark = isDark();
    var faintRGB = dark ? '120, 115, 106' : '170, 166, 156';

    // 1. 蓝图背景坐标网与质心准星
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = 'rgba(217, 119, 87, 0.15)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(12, cy);
    ctx.lineTo(W - 12, cy);
    ctx.moveTo(cx, 12);
    ctx.lineTo(cx, H - 12);
    ctx.stroke();

    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(' + faintRGB + ', 0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.41, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    var suns = threeBodyState.suns;
    var planet = threeBodyState.planet;

    // 2. 绘制周围引力场星尘纯粒子（纯圆点，无尾迹线）
    var dust = threeBodyState.dust;
    for (var d = 0; d < dust.length; d++) {
      var dp = dust[d];
      var dProj = project3D(dp.x * viewScale, dp.y * viewScale, dp.z * viewScale, rotX, rotY, rotZ, cx, cy, fov);
      var dAlpha = Math.max(0.22, Math.min(0.75, 0.55 - dProj.z / 260));
      ctx.beginPath();
      ctx.arc(dProj.sx, dProj.sy, dp.size * dProj.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + dp.colorRGB + ', ' + dAlpha.toFixed(3) + ')';
      ctx.fill();
    }

    // 3. 绘制三颗恒星的混沌引力轨道尾迹曲线与三体星轨道
    for (var i = 0; i < 3; i++) {
      var sun = suns[i];
      if (sun.trail.length > 2) {
        ctx.save();
        for (var t = 1; t < sun.trail.length; t++) {
          var p0 = project3D(sun.trail[t - 1].x * viewScale, sun.trail[t - 1].y * viewScale, sun.trail[t - 1].z * viewScale, rotX, rotY, rotZ, cx, cy, fov);
          var p1 = project3D(sun.trail[t].x * viewScale, sun.trail[t].y * viewScale, sun.trail[t].z * viewScale, rotX, rotY, rotZ, cx, cy, fov);
          var frac = t / sun.trail.length;
          ctx.beginPath();
          ctx.moveTo(p0.sx, p0.sy);
          ctx.lineTo(p1.sx, p1.sy);
          ctx.strokeStyle = 'rgba(' + sun.colorRGB + ', ' + (frac * 0.52).toFixed(3) + ')';
          ctx.lineWidth = 0.6 + frac * 1.35;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    if (planet && planet.trail.length > 2) {
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      for (var ptIdx = 0; ptIdx < planet.trail.length; ptIdx++) {
        var pp = project3D(planet.trail[ptIdx].x * viewScale, planet.trail[ptIdx].y * viewScale, planet.trail[ptIdx].z * viewScale, rotX, rotY, rotZ, cx, cy, fov);
        if (ptIdx === 0) ctx.moveTo(pp.sx, pp.sy);
        else ctx.lineTo(pp.sx, pp.sy);
      }
      ctx.strokeStyle = dark ? 'rgba(147, 168, 120, 0.55)' : 'rgba(120, 140, 93, 0.55)';
      ctx.lineWidth = 1.05;
      ctx.stroke();
      ctx.restore();
    }

    // 4. 计算三颗恒星与行星的当前屏幕坐标，绘制三体引力张力三角形 Δ(S1,S2,S3)
    var projSuns = suns.map(function (s, idx) {
      var pr = project3D(s.x * viewScale, s.y * viewScale, s.z * viewScale, rotX, rotY, rotZ, cx, cy, fov);
      return {
        idx: idx,
        sun: s,
        sx: pr.sx,
        sy: pr.sy,
        z: pr.z,
        scale: pr.scale
      };
    });

    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(217, 119, 87, 0.28)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(projSuns[0].sx, projSuns[0].sy);
    ctx.lineTo(projSuns[1].sx, projSuns[1].sy);
    ctx.lineTo(projSuns[2].sx, projSuns[2].sy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 5. 按景深排序绘制三颗太阳（日冕光晕 + 核心）与三体行星
    var renderBodies = projSuns.slice();
    if (planet) {
      var prPlanet = project3D(planet.x * viewScale, planet.y * viewScale, planet.z * viewScale, rotX, rotY, rotZ, cx, cy, fov);
      renderBodies.push({
        isPlanet: true,
        planet: planet,
        sx: prPlanet.sx,
        sy: prPlanet.sy,
        z: prPlanet.z,
        scale: prPlanet.scale
      });
    }

    renderBodies.sort(function (a, b) { return b.z - a.z; });

    for (var bIdx = 0; bIdx < renderBodies.length; bIdx++) {
      var item = renderBodies[bIdx];
      if (item.isPlanet) {
        var prR = Math.max(2.2, item.planet.radius * item.scale);
        ctx.save();
        ctx.beginPath();
        ctx.arc(item.sx, item.sy, prR + 4.2, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(147, 168, 120, 0.78)' : 'rgba(120, 140, 93, 0.78)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(item.sx, item.sy, prR, 0, Math.PI * 2);
        ctx.fillStyle = dark ? '#93a878' : '#788c5d';
        ctx.fill();
        ctx.restore();
      } else {
        var sObj = item.sun;
        var sR = Math.max(3.8, sObj.radius * item.scale);
        var coronaGrad = ctx.createRadialGradient(item.sx, item.sy, sR * 0.2, item.sx, item.sy, sR * 3.4);
        coronaGrad.addColorStop(0, 'rgba(' + sObj.colorRGB + ', 0.75)');
        coronaGrad.addColorStop(0.45, 'rgba(' + sObj.colorRGB + ', 0.22)');
        coronaGrad.addColorStop(1, 'rgba(' + sObj.colorRGB + ', 0)');

        ctx.beginPath();
        ctx.arc(item.sx, item.sy, sR * 3.4, 0, Math.PI * 2);
        ctx.fillStyle = coronaGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(item.sx, item.sy, sR, 0, Math.PI * 2);
        ctx.fillStyle = sObj.coreHex;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = 'rgba(' + sObj.colorRGB + ', 0.95)';
        ctx.stroke();
      }
    }

    // 同步更新画布上方三体纪元 HUD 遥测读数
    var eraBadge = document.getElementById('threebody-era-badge');
    var fluxReadout = document.getElementById('threebody-flux-readout');
    if (eraBadge) eraBadge.textContent = threeBodyState.era;
    if (fluxReadout) {
      fluxReadout.textContent = 'SOLAR FLUX Φ=' + threeBodyState.flux.toFixed(2) + ' · CLICK TO PERTURB';
    }
  }

  /* ----------------------------------------------------------------------
     主渲染循环
     ---------------------------------------------------------------------- */
  var lastTs = performance.now();

  function renderFrame(now) {
    var dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    state.time += dt * state.speed;

    var targetNx = mouse.active ? mouse.nx : 0;
    var targetNy = mouse.active ? mouse.ny : 0;
    mouse.snx += (targetNx - mouse.snx) * 0.07;
    mouse.sny += (targetNy - mouse.sny) * 0.07;
    mouse.energy *= 0.92;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (state.view === 'home' && stageCanvas && stageCanvas.width >= 10) {
      var ctx = stageCanvas.getContext('2d');
      var W = stageCanvas.width / dpr;
      var H = stageCanvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      var dark = isDark();
      var accentRGB = '217, 119, 87';
      var faintRGB = dark ? '110, 105, 97' : '176, 174, 165';

      var cx = W * 0.5;
      var cy = H * 0.5;

      drawDetachedReferenceFrame(ctx, cx, cy, W, H, faintRGB, accentRGB);

      if (state.mode === 'infinity') {
        drawInfinity3DModel(ctx, cx, cy, W, H, dt);
      } else {
        drawGargantuaParticleModel(ctx, cx, cy, W, H, dt);
      }

      if (mouse.active) {
        var mr = 18 + mouse.energy * 12;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, mr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(' + accentRGB + ', 0.26)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      ctx.restore();

      if (telemetryPhase && telemetryCursor && telemetryPcount) {
        var phaseVal = ((state.time * 0.5) % (Math.PI * 2)).toFixed(2);
        telemetryPhase.textContent = (state.mode === 'infinity' ? '∞ PURE PARTICLE MANIFOLD · t=' : 'KERR CONTINUOUS HALO · t=') + phaseVal + ' rad';
        telemetryPcount.textContent = 'N = ' + state.particleCount + ' · PURE PARTICLES ONLY';
        if (mouse.active) {
          var pot = (Math.hypot(mouse.nx, mouse.ny) * 0.42).toFixed(3);
          telemetryCursor.textContent = 'ΔΦ = ' + pot + ' (' + mouse.nx.toFixed(2) + ', ' + mouse.ny.toFixed(2) + ')';
        } else {
          telemetryCursor.textContent = 'ΔΦ = 0.000 (AUTONOMOUS)';
        }
      }
    } else if (state.view === 'article' && articleCanvas && articleCanvas.width >= 10) {
      var aCtx = articleCanvas.getContext('2d');
      var aW = articleCanvas.width / dpr;
      var aH = articleCanvas.height / dpr;
      aCtx.save();
      aCtx.scale(dpr, dpr);
      aCtx.clearRect(0, 0, aW, aH);
      drawArticleThreeBodyCanvas(aCtx, aW, aH, dt);
      aCtx.restore();
    }

    resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);
  }

  /* ========================================================================
     实验室面板事件与主题初始化
     ======================================================================== */
  var sliderDensity = document.getElementById('slider-density');
  var valDensity = document.getElementById('val-density');
  if (sliderDensity) {
    sliderDensity.addEventListener('input', function () {
      state.particleCount = parseInt(sliderDensity.value, 10);
      if (valDensity) valDensity.textContent = state.particleCount + ' 粒子';
    });
  }

  var sliderSpeed = document.getElementById('slider-speed');
  var valSpeed = document.getElementById('val-speed');
  if (sliderSpeed) {
    sliderSpeed.addEventListener('input', function () {
      state.speed = parseFloat(sliderSpeed.value);
      if (valSpeed) valSpeed.textContent = state.speed.toFixed(1) + 'x';
    });
  }

  var mathLab = document.getElementById('math-lab');
  var mathLabHead = document.getElementById('math-lab-head');
  var mathLabToggle = document.getElementById('math-lab-toggle');

  if (mathLabHead) {
    mathLabHead.addEventListener('click', function () {
      var collapsed = mathLab.dataset.collapsed === 'true';
      mathLab.dataset.collapsed = String(!collapsed);
      if (mathLabToggle) mathLabToggle.textContent = !collapsed ? '展开 +' : '收起 −';
    });
  }

  document.body.dataset.scale = 'ultrawide';

  // 主题已由 <head> 里的 THEME_BOOT 定调（localStorage + prefers-color-scheme）。
  applyTheme(isDark() ? 'dark' : 'light', false);

  resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);
})();