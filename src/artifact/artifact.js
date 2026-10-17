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
    particleCount: 400,
    speed: 1.0,
    mouseStrength: 1.0,
    time: 0
  };

  var MODE_META = {
    infinity: {
      pillText: 'DAY // 立体无限环',
      topbarTag: 'DAYLIGHT INFINITY // 纯净暖色流形与丝线粒子场',
      coordText: 'SPATIAL LEMNISCATE · 多轨流形丝线与自然聚落星团交织的立体无限环',
      originBadge: 'ORIGIN (0, 0, L3)',
      themeChip: 'DAY // 纯净无限环',
      equation: 'L3 : x = a·cos(t)/(1+sin²t), y = b·sin(t)cos(t)/(1+sin²t), z = c·sin(t)',
      labInd: 'DAY // INFINITY',
      fabLabel: 'NIGHT // 黑洞场'
    },
    gargantua: {
      pillText: 'NIGHT // 卡冈图雅黑洞',
      topbarTag: 'NIGHT SINGULARITY // 卡冈图雅黑洞与引力测地线场',
      coordText: 'GARGANTUA SINGULARITY · 视界黑球、多普勒光子环、引力透镜光线与开普勒流线',
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

  function applyTheme(nextTheme) {
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
      applyTheme(isDark() ? 'light' : 'dark');
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
      applyTheme(next);
      showToast(next === 'dark' ? '已切换至夜间模式：卡冈图雅黑洞场已启动' : '已切换至白天模式：纯净线粒无限环已启动');
    });
  }

  document.querySelectorAll('[data-theme-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.dataset.themeMode;
      applyTheme(next);
      showToast(next === 'dark' ? '已切换至夜间模式：卡冈图雅黑洞' : '已切换至白天模式：纯净线粒无限环');
    });
  });

  var detailToggleTheme = document.getElementById('detail-toggle-theme');
  if (detailToggleTheme) {
    detailToggleTheme.addEventListener('click', function () {
      applyTheme(isDark() ? 'light' : 'dark');
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

  function activateDarkAndScrollFoot(e) {
    if (e) e.preventDefault();
    applyTheme('dark');
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
      showToast('已进入象限网格文章详细页');
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
      showToast('已在右侧预览《' + postLink.dataset.postTitle + '》，点击「阅读全文」可进入详细页');
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
     7. 核心需求 1 & 4：三维数学粒子与流线引擎（v4 全新重构）
        A) 无限环模型 (drawInfinity3DModel — 白天模式)：
           - 彻底移除黑色粒子 (inkRGB)，100% 采用纯净暖赤陶 (#d97757)、暖珊瑚 (#e89271)、琥珀流金 (#f0b27a) 与暖砂金 (#c87a5b) 多层次纯净色板
           - 打破机械均匀排版：采用多股有机纤维束聚落 (Organic Filament Clustering) + 非均匀幂律散射 + 疏密呼吸团簇
           - 增加丰富「线的元素」：
             1. 7 条连续 3D 伯努利双纽线流线丝带 (3D Parametric Lemniscate Streamlines)
             2. 粒子间动态拓扑连线网络 (Constellation Filament Links)
             3. 粒子沿流形切线方向的流光尾迹线 (Velocity Tangent Trails)
        B) 卡冈图雅黑洞模型 (drawGargantuaParticleModel — 夜间模式完全重做)：
           - 恢复并升华《星际穿越》卡冈图雅黑洞的极致深邃引力质感
           - 增加丰富「线的元素」：
             1. 多层开普勒相对论吸积盘测地线流线环 (Relativistic Accretion Geodesic Streamlines)
             2. 黑球上下方受克尔强引力场弯曲的爱因斯坦引力透镜光线弧 (Upper & Lower Gravitational Lensing Light-Ray Arcs)
             3. 高速掠过事件视界粒子的切向相对论光弧长尾迹 (Relativistic Doppler Streak Lines)
           - 真实三维前后遮挡：后方流线与透镜光桥 -> 深渊视界黑球本体与非对称光子环 -> 前方赤道吸积盘流线与高能粒子束横跨黑球正前方
        C) 文章详细页右上方无限环动效画布 (drawArticleHeaderInfinityCanvas)：
           - 替代原右侧静态封面图，提供与详细页高度协调的动态无限环流线+粒子谐振场
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

  // 确定性伪随机生成器，用于生成自然有机的非均匀聚落分布
  var rngSeed = 1337;
  function nextRand() {
    rngSeed = (rngSeed * 16807) % 2147483647;
    return (rngSeed - 1) / 2147483646;
  }

  // 纯净无限环调色板（零黑色粒子，全部采用纯净暖调赤陶、琥珀、珊瑚与香槟色系）
  var PURE_INFINITY_PALETTE = [
    '217, 119, 87',   // 主赤陶色 #d97757
    '232, 146, 110',  // 暖珊瑚色 #e8926e
    '242, 179, 126',  // 琥珀流金 #f2b37e
    '202, 112, 82',   // 深赤陶暖调 #ca7052
    '238, 165, 136'   // 柔光暖杏 #eea588
  ];

  var MAX_PARTICLES = 540;
  var particles = [];

  // 构建 6 个随机聚落中心，打破均匀分布，形成自然的星云疏密节律
  var clusterCenters = [0.28, 1.15, 2.05, 3.35, 4.22, 5.48];

  for (var i = 0; i < MAX_PARTICLES; i++) {
    // 72% 的粒子围绕有机聚落中心非均匀聚集，28% 自由流散在流形内外
    var baseU;
    if (nextRand() < 0.72) {
      var cIdx = Math.floor(nextRand() * clusterCenters.length);
      var spread = (nextRand() - 0.5) * 0.68 + (nextRand() - 0.5) * 0.42;
      baseU = (clusterCenters[cIdx] + spread + Math.PI * 2) % (Math.PI * 2);
    } else {
      baseU = nextRand() * Math.PI * 2;
    }

    // 幂律径向偏移：中心丝带密集，外围有自然的星尘散逸（告别呆板等距管道）
    var radialPow = Math.pow(nextRand(), 1.85);
    var outlier = nextRand() < 0.14 ? (1.35 + nextRand() * 1.15) : 1.0;
    var crossAngle = nextRand() * Math.PI * 2;
    var streamId = i % 5; // 5 股交织的三维流线丝带

    // 黑洞参数：向内缘幂律加密，带有旋臂角度扰动
    var bhR = Math.pow(nextRand(), 1.55);
    var bhPhi = nextRand() * Math.PI * 2;
    var bhRoleRand = nextRand();
    var bhBranch = bhRoleRand < 0.64 ? 0 : (bhRoleRand < 0.84 ? 1 : 2);

    particles.push({
      idx: i,
      u: baseU,
      uSpeed: 0.28 + nextRand() * 0.46,
      streamId: streamId,
      cx: Math.cos(crossAngle) * radialPow * outlier,
      cy: Math.sin(crossAngle) * radialPow * outlier,
      cz: (nextRand() - 0.5) * 2.0 * radialPow * outlier,
      phaseOffset: nextRand() * Math.PI * 2,
      // 自然的有机粒径变化（核心亮点 + 星尘微粒）
      size: 1.15 + Math.pow(nextRand(), 1.6) * 1.65,
      colorRGB: PURE_INFINITY_PALETTE[i % PURE_INFINITY_PALETTE.length],
      trailFactor: 0.6 + nextRand() * 0.9,
      // 黑洞专属属性
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
    ctx.strokeStyle = 'rgba(' + faintRGB + ', 0.22)';
    ctx.lineWidth = 0.75;
    for (var q = 0; q < 4; q++) {
      var startA = q * (Math.PI * 0.5) + 0.14;
      var endA = (q + 1) * (Math.PI * 0.5) - 0.14;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, startA, endA);
      ctx.stroke();
    }

    // 水平与垂直微弱蓝图基准线
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(' + accentRGB + ', 0.12)';
    ctx.beginPath();
    ctx.moveTo(cx - rOuter * 1.08, cy);
    ctx.lineTo(cx + rOuter * 1.08, cy);
    ctx.moveTo(cx, cy - rOuter * 0.88);
    ctx.lineTo(cx, cy + rOuter * 0.88);
    ctx.stroke();
    ctx.restore();
  }

  /* ----------------------------------------------------------------------
     白天模型：立体无限环（纯净暖色无黑点 + 有机疏密聚落 + 三维丝带流线 + 粒子拓扑连线）
     ---------------------------------------------------------------------- */
  function evalInfinityPoint3D(t, streamOffset, radSpread, a, b, c, time) {
    var sinT = Math.sin(t);
    var cosT = Math.cos(t);
    var denom = 1 + sinT * sinT;

    var bx = (a * cosT) / denom;
    var by = (b * sinT * cosT) / denom;
    var bz = c * sinT;

    // 多股谐波丝带偏移，形成富有张力的线网结构
    var ribbonWave = t * 2.0 + streamOffset + time * 0.55;
    var ox = Math.cos(ribbonWave) * radSpread;
    var oy = Math.sin(ribbonWave) * radSpread * 0.88;
    var oz = Math.sin(t * 3.0 + streamOffset) * radSpread * 1.12;

    return { x: bx + ox, y: by + oy, z: bz + oz };
  }

  function drawInfinity3DModel(ctx, cx, cy, W, H, dt) {
    var minDim = Math.min(W, H);
    var a = Math.min(W * 0.44, minDim * 0.52);
    var b = a * 0.88;
    var c = a * 0.34;
    var tubeRadius = a * 0.095;
    var fov = 680;

    // 有界三维章动微倾，恒定保持立体「∞」拓扑
    var rotX = 0.22 * Math.sin(state.time * 0.36) + mouse.sny * 0.15;
    var rotY = 0.24 * Math.cos(state.time * 0.28) + mouse.snx * 0.17;
    var rotZ = -0.06 + 0.075 * Math.sin(state.time * 0.22);

    // 1. 左右双叶焦点几何靶标与椭圆轨道辅助线
    var focusX = a * 0.62;
    [-focusX, focusX].forEach(function (fx3) {
      var fp = project3D(fx3, 0, 0, rotX, rotY, rotZ, cx, cy, fov);
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 87, 0.34)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.arc(fp.sx, fp.sy, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fp.sx - 5, fp.sy);
      ctx.lineTo(fp.sx + 5, fp.sy);
      ctx.moveTo(fp.sx, fp.sy - 5);
      ctx.lineTo(fp.sx, fp.sy + 5);
      ctx.stroke();
      ctx.restore();
    });

    // 2. 绘制「线的元素 ①」：7 条交织的三维连续参数双纽线流线丝带 (3D Harmonic Ribbon Streamlines)
    var numRibbons = 7;
    var ribbonSteps = 110;
    ctx.save();
    for (var rIdx = 0; rIdx < numRibbons; rIdx++) {
      var sOff = (rIdx / numRibbons) * Math.PI * 2;
      var rSpread = (rIdx === 0) ? 0 : tubeRadius * (0.28 + (rIdx % 3) * 0.26);
      var isCoreRibbon = (rIdx === 0 || rIdx === 3);
      ctx.beginPath();
      for (var s = 0; s <= ribbonSteps; s++) {
        var tVal = (s / ribbonSteps) * Math.PI * 2;
        var p3 = evalInfinityPoint3D(tVal, sOff, rSpread, a, b, c, state.time);
        var pr = project3D(p3.x, p3.y, p3.z, rotX, rotY, rotZ, cx, cy, fov);
        var mw = computeMouseWaveOffset(pr.sx, pr.sy);
        var sx = pr.sx + mw.ox * 0.55;
        var sy = pr.sy + mw.oy * 0.55;
        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.strokeStyle = isCoreRibbon
        ? 'rgba(217, 119, 87, 0.32)'
        : 'rgba(232, 146, 110, ' + (0.12 + (rIdx % 3) * 0.05).toFixed(3) + ')';
      ctx.lineWidth = isCoreRibbon ? 1.25 : 0.75;
      ctx.stroke();
    }
    ctx.restore();

    // 3. 计算全部有机非均匀粒子的三维坐标与切向速度向量（用于绘制流光尾迹线）
    var count = Math.min(state.particleCount, MAX_PARTICLES);
    var renderList = [];

    for (var i = 0; i < count; i++) {
      var pt = particles[i];
      // 速度随曲线曲率产生自然涨落（双叶两端略缓，中心交叉鞍点加速）
      var speedMod = 0.78 + 0.42 * Math.sin(pt.u * 2.0 + pt.phaseOffset);
      pt.u = (pt.u + pt.uSpeed * speedMod * 0.68 * dt * state.speed) % (Math.PI * 2);

      var t = pt.u;
      var sinT = Math.sin(t);
      var cosT = Math.cos(t);
      var denom = 1 + sinT * sinT;

      var bx = (a * cosT) / denom;
      var by = (b * sinT * cosT) / denom;
      var bz = c * sinT;

      // 多股有机丝带截面位置 + 呼吸脉动
      var streamAngle = (pt.streamId / 5) * Math.PI * 2 + t * 1.5 + state.time * 0.55;
      var cosTw = Math.cos(streamAngle), sinTw = Math.sin(streamAngle);
      var rx = pt.cx * cosTw - pt.cy * sinTw;
      var ry = pt.cx * sinTw + pt.cy * cosTw;

      var localSpread = tubeRadius * (0.72 + 0.38 * Math.sin(t * 2 + pt.phaseOffset));
      var ox = rx * localSpread;
      var oy = ry * localSpread * 0.92;
      var oz = pt.cz * localSpread * 1.08;

      var proj = project3D(bx + ox, by + oy, bz + oz, rotX, rotY, rotZ, cx, cy, fov);

      // 计算微小前瞻点以获取精确切线方向（用于绘制粒子尾迹线）
      var tPrev = t - 0.045 * pt.trailFactor;
      var sinP = Math.sin(tPrev), cosP = Math.cos(tPrev), denP = 1 + sinP * sinP;
      var prevProj = project3D(
        (a * cosP) / denP + ox,
        (b * sinP * cosP) / denP + oy,
        c * sinP + oz,
        rotX, rotY, rotZ, cx, cy, fov
      );

      updateParticleSpring(pt, proj.sx, proj.sy, dt);

      renderList.push({
        x: proj.sx + pt.dx,
        y: proj.sy + pt.dy,
        tx: prevProj.sx + pt.dx * 0.85,
        ty: prevProj.sy + pt.dy * 0.85,
        z: proj.z,
        size: pt.size,
        colorRGB: pt.colorRGB,
        glow: pt.glow,
        streamId: pt.streamId
      });
    }

    renderList.sort(function (p1, p2) { return p2.z - p1.z; });

    // 4. 绘制「线的元素 ②」：邻近粒子动态拓扑连线网 (Constellation Filament Lines)
    ctx.save();
    ctx.lineWidth = 0.68;
    var maxLinkDistSq = Math.pow(minDim * 0.082, 2);
    for (var m = 0; m < renderList.length; m += 2) {
      var pA = renderList[m];
      var linksDrawn = 0;
      for (var n = m + 1; n < renderList.length; n += 2) {
        var pB = renderList[n];
        if (Math.abs(pA.z - pB.z) > a * 0.32) continue;
        var dx = pA.x - pB.x;
        var dy = pA.y - pB.y;
        var dSq = dx * dx + dy * dy;
        if (dSq < maxLinkDistSq && dSq > 9) {
          var distAlpha = (1 - dSq / maxLinkDistSq) * 0.26;
          ctx.strokeStyle = 'rgba(217, 119, 87, ' + distAlpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();
          linksDrawn++;
          if (linksDrawn >= 2) break;
        }
      }
    }
    ctx.restore();

    // 5. 绘制「线的元素 ③」：粒子切向流光尾迹线 + 纯净暖色系发光粒子本体（无任何黑色粒子）
    for (var j = 0; j < renderList.length; j++) {
      var r = renderList[j];
      var depthNorm = Math.max(0.35, Math.min(1.0, 0.74 - r.z / (a * 1.85)));
      var alpha = Math.min(0.96, 0.42 + 0.50 * depthNorm + r.glow * 0.28);
      var radius = r.size * (0.88 + 0.22 * depthNorm) + r.glow * 0.45;

      // 切向流光尾迹线
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.tx, r.ty);
      ctx.strokeStyle = 'rgba(' + r.colorRGB + ', ' + (alpha * 0.42).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.65, radius * 0.62);
      ctx.stroke();

      // 柔光外晕（针对较亮的主粒子）
      if (r.size > 2.1 || r.glow > 0.15) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + r.colorRGB + ', ' + (alpha * 0.16).toFixed(3) + ')';
        ctx.fill();
      }

      // 纯净暖色粒子核心
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + r.colorRGB + ', ' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  /* ----------------------------------------------------------------------
     夜间模型：卡冈图雅黑洞（完全重做 v4 — 恢复星际穿越级质感 + 丰富引力透镜流线与吸积盘轨线）
     ---------------------------------------------------------------------- */
  function drawGargantuaParticleModel(ctx, cx, cy, W, H, dt) {
    var minDim = Math.min(W, H);
    var Rs = minDim * 0.136; // 事件视界半径
    var tiltRad = 1.405 + Math.sin(state.time * 0.22) * 0.02 + mouse.sny * 0.05;
    var rollRad = -0.22 + Math.cos(state.time * 0.16) * 0.018 + mouse.snx * 0.05;
    var cr = Math.cos(rollRad), sr = Math.sin(rollRad);

    var rInner = Rs * 1.15;
    var rOuter = Math.min(W * 0.46, minDim * 0.50);

    // 辅助函数：将黑洞局部坐标旋转映射到屏幕
    function toScreen(lx, ly) {
      return {
        x: cx + (lx * cr - ly * sr),
        y: cy + (lx * sr + ly * cr)
      };
    }

    // --------------------------------------------------------------------
    // 第一层：背景深空引力场氛围辉光 + 后方爱因斯坦引力透镜光线弧（线的元素 A）
    // --------------------------------------------------------------------
    ctx.save();
    var ambientHalo = ctx.createRadialGradient(cx, cy, Rs * 0.85, cx, cy, rOuter * 0.95);
    ambientHalo.addColorStop(0, 'rgba(217, 119, 87, 0.22)');
    ambientHalo.addColorStop(0.28, 'rgba(235, 148, 110, 0.10)');
    ambientHalo.addColorStop(0.65, 'rgba(180, 95, 65, 0.03)');
    ambientHalo.addColorStop(1, 'rgba(20, 20, 19, 0)');
    ctx.fillStyle = ambientHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter * 0.95, 0, Math.PI * 2);
    ctx.fill();

    // 绘制上方与下方多条连续引力透镜弯曲光线弧 (Einstein Lensing Geodesic Lines)
    var numLensArcs = 9;
    for (var la = 0; la < numLensArcs; la++) {
      var lFrac = la / (numLensArcs - 1);
      var arcR = Rs * (1.06 + lFrac * 0.88);
      var archHeight = Rs * (1.05 + lFrac * 0.72);

      // 上方引力透镜光桥线
      ctx.beginPath();
      for (var step = 0; step <= 64; step++) {
        var ang = Math.PI * (step / 64); // 0 -> PI
        var lx = Math.cos(ang) * (arcR * 1.38);
        var ly = -Math.sin(ang) * archHeight;
        var sp = toScreen(lx, ly);
        if (step === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      var topAlpha = (1 - lFrac * 0.75) * 0.34;
      ctx.strokeStyle = la < 3 ? 'rgba(255, 215, 175, ' + topAlpha.toFixed(3) + ')' : 'rgba(217, 119, 87, ' + (topAlpha * 0.8).toFixed(3) + ')';
      ctx.lineWidth = la === 0 ? 1.5 : 0.85;
      ctx.stroke();

      // 下方次级相对论引力透镜光桥线
      ctx.beginPath();
      for (var stepB = 0; stepB <= 64; stepB++) {
        var angB = Math.PI * (stepB / 64);
        var lxB = Math.cos(angB) * (arcR * 1.28);
        var lyB = Math.sin(angB) * (archHeight * 0.90);
        var spB = toScreen(lxB, lyB);
        if (stepB === 0) ctx.moveTo(spB.x, spB.y);
        else ctx.lineTo(spB.x, spB.y);
      }
      var botAlpha = (1 - lFrac * 0.78) * 0.26;
      ctx.strokeStyle = la < 2 ? 'rgba(255, 205, 165, ' + botAlpha.toFixed(3) + ')' : 'rgba(217, 119, 87, ' + (botAlpha * 0.75).toFixed(3) + ')';
      ctx.lineWidth = la === 0 ? 1.25 : 0.75;
      ctx.stroke();
    }

    // 绘制后半部分吸积盘开普勒椭圆流线（线的元素 B — 位于黑球后方）
    var numDiskLines = 11;
    for (var dl = 0; dl < numDiskLines; dl++) {
      var dFrac = dl / (numDiskLines - 1);
      var diskR = rInner + Math.pow(dFrac, 1.25) * (rOuter - rInner);
      ctx.beginPath();
      for (var ds = 0; ds <= 60; ds++) {
        var phiBack = Math.PI + (ds / 60) * Math.PI; // PI -> 2*PI (后半盘)
        var bx = diskR * Math.cos(phiBack);
        // 后半盘受引力向上抬升弯折
        var rawY = diskR * Math.sin(phiBack) * Math.cos(tiltRad);
        var lensLift = -Math.sin(phiBack - Math.PI) * Rs * 0.62 * (1 - dFrac * 0.55);
        var spD = toScreen(bx, rawY + lensLift);
        if (ds === 0) ctx.moveTo(spD.x, spD.y);
        else ctx.lineTo(spD.x, spD.y);
      }
      ctx.strokeStyle = 'rgba(217, 119, 87, ' + ((1 - dFrac * 0.7) * 0.24).toFixed(3) + ')';
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
    ctx.restore();

    // --------------------------------------------------------------------
    // 第二层：计算所有黑洞吸积盘与透镜弧粒子的运动与切向相对论光迹线
    // --------------------------------------------------------------------
    var count = Math.min(state.particleCount, MAX_PARTICLES);
    var backParticles = [];
    var frontParticles = [];

    for (var i = 0; i < count; i++) {
      var pt = particles[i];
      // 开普勒相对论角速度：越靠近视界旋转越快
      var keplerOmega = 1.28 / Math.pow(0.24 + pt.rNorm, 1.38);
      pt.phi = (pt.phi + keplerOmega * dt * state.speed) % (Math.PI * 2);

      var r = rInner + pt.rNorm * (rOuter - rInner) + pt.bhJitter * Rs * 0.05;
      var cosP = Math.cos(pt.phi);
      var sinP = Math.sin(pt.phi);

      var isFrontDisk = (pt.branch === 0 && sinP >= -0.04);

      var lx = r * cosP;
      var ly = r * sinP * Math.cos(tiltRad) + pt.cz * 2.8;

      // 计算切向速度方向（用于绘制相对论光迹长线）
      var txDir = -sinP;
      var tyDir = cosP * Math.cos(tiltRad);

      if (!isFrontDisk) {
        var behind = Math.max(0, -sinP);
        if (pt.branch === 0) {
          var arch = Math.sqrt(Math.max(0, (r * 0.90) * (r * 0.90) - (lx * 0.70) * (lx * 0.70)));
          ly = -arch * (0.76 + 0.26 * behind) * (1 - pt.rNorm * 0.35) + ly * 0.22;
          txDir = -cosP * 0.45;
          tyDir = -sinP * 0.82;
        } else if (pt.branch === 1) {
          var topR = Rs * (1.08 + 0.75 * pt.rNorm);
          var topY = -Math.sqrt(Math.max(0, topR * topR - (lx * 0.65) * (lx * 0.65)));
          ly = topY * (0.86 + 0.24 * behind) + pt.bhJitter * 3.0;
          txDir = -1.0;
          tyDir = (lx / Math.max(Rs * 0.4, topR)) * 0.48;
        } else {
          var botR = Rs * (1.07 + 0.62 * pt.rNorm);
          var botY = Math.sqrt(Math.max(0, botR * botR - (lx * 0.68) * (lx * 0.68)));
          ly = botY * (0.82 + 0.22 * behind) + pt.bhJitter * 2.8;
          txDir = -1.0;
          tyDir = -(lx / Math.max(Rs * 0.4, botR)) * 0.45;
        }

        // 视界排斥边界：确保后方引力透镜粒子沿着黑球外侧光子环绕射，不穿入黑球内部
        var dCenter = Math.hypot(lx, ly);
        var minAllowedR = Rs * 1.035;
        if (dCenter < minAllowedR && dCenter > 0.001) {
          lx *= (minAllowedR / dCenter);
          ly *= (minAllowedR / dCenter);
        }
      } else {
        // 前方赤道吸积盘：极其锐利扁平地横切黑球赤道前方，略带引力微沉
        var frontDip = Math.exp(-(lx * lx) / (2 * (Rs * 1.15) * (Rs * 1.15)));
        ly = r * sinP * Math.cos(tiltRad) * 0.72 + frontDip * Rs * 0.06;
      }

      var sp = toScreen(lx, ly);
      updateParticleSpring(pt, sp.x, sp.y, dt);

      // 相对论多普勒聚束效应（左侧迎面而来极亮偏白金/琥珀，右侧退行偏深赤陶）
      var doppler = Math.max(0.28, Math.min(1.45, 0.88 - 0.54 * cosP));
      var innerHeat = Math.pow(1 - pt.rNorm, 1.6);
      var alpha = Math.min(0.98, (0.38 + 0.48 * doppler + 0.25 * innerHeat) * (1 - pt.rNorm * 0.28) + pt.glow * 0.28);

      // 颜色随温度与多普勒频移自然过渡：内圈左侧炽白金 -> 中圈暖琥珀 -> 外圈赤陶色
      var colorRGB;
      if (innerHeat > 0.55 && doppler > 0.95) {
        colorRGB = '255, 238, 210'; // 炽热光子白金
      } else if (innerHeat > 0.28 || doppler > 0.90) {
        colorRGB = '244, 178, 120'; // 琥珀亮金
      } else {
        colorRGB = '217, 119, 87';  // 经典赤陶
      }

      // 切线方向投射到屏幕，用于绘制流光长弧线（线的元素 C）
      var scrTx = txDir * cr - tyDir * sr;
      var scrTy = txDir * sr + tyDir * cr;
      var tLen = Math.hypot(scrTx, scrTy) + 0.001;
      var streakLen = (6.5 + innerHeat * 16.0 + doppler * 6.0) * pt.trailFactor;

      var item = {
        x: sp.x + pt.dx,
        y: sp.y + pt.dy,
        vx: (scrTx / tLen) * streakLen,
        vy: (scrTy / tLen) * streakLen,
        r: pt.size * (0.78 + 0.24 * innerHeat) + pt.glow * 0.35,
        colorRGB: colorRGB,
        alpha: alpha,
        innerHeat: innerHeat
      };

      if (isFrontDisk) frontParticles.push(item);
      else backParticles.push(item);
    }

    function renderGargantuaBatch(list) {
      for (var k = 0; k < list.length; k++) {
        var p = list[k];
        // 绘制粒子切向相对论光迹线
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 0.45, p.y - p.vy * 0.45);
        ctx.lineTo(p.x + p.vx * 0.55, p.y + p.vy * 0.55);
        ctx.strokeStyle = 'rgba(' + p.colorRGB + ', ' + (p.alpha * 0.52).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.65, p.r * 0.68);
        ctx.stroke();

        // 粒子核心亮点
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.colorRGB + ', ' + p.alpha.toFixed(3) + ')';
        ctx.fill();
      }
    }

    // 渲染黑球后方的引力透镜粒子与尾迹
    renderGargantuaBatch(backParticles);

    // --------------------------------------------------------------------
    // 第三层：中央事件视界黑球本体 + 锐利非对称光子环 (Event Horizon & Photon Ring)
    // --------------------------------------------------------------------
    ctx.save();
    // 视界外缘炽热光子层光晕
    var photonGlow = ctx.createRadialGradient(cx - Rs * 0.08, cy, Rs * 0.94, cx, cy, Rs * 1.38);
    photonGlow.addColorStop(0, 'rgba(255, 225, 185, 0.55)');
    photonGlow.addColorStop(0.28, 'rgba(217, 119, 87, 0.28)');
    photonGlow.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = photonGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.38, 0, Math.PI * 2);
    ctx.fill();

    // 纯粹深渊黑球本体（真实遮挡后方一切光线）
    var abyssGrad = ctx.createRadialGradient(cx - Rs * 0.22, cy - Rs * 0.20, Rs * 0.05, cx, cy, Rs);
    abyssGrad.addColorStop(0, '#100f0e');
    abyssGrad.addColorStop(0.55, '#070706');
    abyssGrad.addColorStop(0.92, '#020202');
    abyssGrad.addColorStop(1, '#000000');
    ctx.beginPath();
    ctx.arc(cx, cy, Rs, 0, Math.PI * 2);
    ctx.fillStyle = abyssGrad;
    ctx.fill();

    // 紧贴事件视界边缘的锐利光子环（左侧多普勒增亮白金弧，右侧暖赤陶细弧）
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.015, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(235, 150, 108, 0.72)';
    ctx.lineWidth = 1.35;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.012, Math.PI * 0.55, Math.PI * 1.45);
    ctx.strokeStyle = 'rgba(255, 240, 215, 0.92)';
    ctx.lineWidth = 1.95;
    ctx.stroke();
    ctx.restore();

    // --------------------------------------------------------------------
    // 第四层：横跨黑球正前方的前景赤道吸积盘连续流线（线的元素 D）+ 前景高能粒子流
    // --------------------------------------------------------------------
    ctx.save();
    var numFrontLines = 14;
    for (var fl = 0; fl < numFrontLines; fl++) {
      var fFrac = fl / (numFrontLines - 1);
      var fRadius = rInner + Math.pow(fFrac, 1.3) * (rOuter - rInner);
      ctx.beginPath();
      for (var fs = 0; fs <= 64; fs++) {
        var phiFront = (fs / 64) * Math.PI; // 0 -> PI (前半赤道盘)
        var fx = fRadius * Math.cos(phiFront);
        var fy = fRadius * Math.sin(phiFront) * Math.cos(tiltRad) * 0.72;
        var frontDipLine = Math.exp(-(fx * fx) / (2 * (Rs * 1.15) * (Rs * 1.15)));
        fy += frontDipLine * Rs * 0.06;
        var spF = toScreen(fx, fy);
        var mwF = computeMouseWaveOffset(spF.x, spF.y);
        var sxF = spF.x + mwF.ox * 0.45;
        var syF = spF.y + mwF.oy * 0.45;
        if (fs === 0) ctx.moveTo(sxF, syF);
        else ctx.lineTo(sxF, syF);
      }
      var isInnerBridge = fl < 4;
      var lineAlpha = (1 - fFrac * 0.68) * (isInnerBridge ? 0.52 : 0.28);
      ctx.strokeStyle = isInnerBridge
        ? 'rgba(255, 222, 185, ' + lineAlpha.toFixed(3) + ')'
        : 'rgba(217, 119, 87, ' + lineAlpha.toFixed(3) + ')';
      ctx.lineWidth = isInnerBridge ? 1.25 : 0.75;
      ctx.stroke();
    }
    ctx.restore();

    // 渲染横跨黑球正前方的高速前景粒子与切向光迹
    renderGargantuaBatch(frontParticles);
  }

  /* ----------------------------------------------------------------------
     文章详细页右上象限：动态无限环谐振场画布 (drawArticleHeaderInfinityCanvas)
     ---------------------------------------------------------------------- */
  function drawArticleHeaderInfinityCanvas(ctx, W, H, time) {
    var cx = W * 0.5;
    var cy = H * 0.5;
    var minDim = Math.min(W, H);
    var a = Math.min(W * 0.39, minDim * 0.68);
    var b = a * 0.84;
    var c = a * 0.30;
    var fov = 520;

    var targetAx = artMouse.active ? artMouse.nx : 0;
    var targetAy = artMouse.active ? artMouse.ny : 0;
    artMouse.snx += (targetAx - artMouse.snx) * 0.08;
    artMouse.sny += (targetAy - artMouse.sny) * 0.08;

    var rotX = 0.24 * Math.sin(time * 0.45) + artMouse.sny * 0.22;
    var rotY = 0.26 * Math.cos(time * 0.34) + artMouse.snx * 0.25;
    var rotZ = -0.05 + 0.06 * Math.sin(time * 0.28);

    // 蓝图背景十字准星与双焦点圆环
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = 'rgba(217, 119, 87, 0.16)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(12, cy);
    ctx.lineTo(W - 12, cy);
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx, H - 10);
    ctx.stroke();
    ctx.restore();

    // 绘制 5 条连续谐波无限环丝带线
    var ribbonCount = 5;
    var steps = 90;
    for (var r = 0; r < ribbonCount; r++) {
      var off = (r / ribbonCount) * Math.PI * 2;
      var spread = r === 0 ? 0 : a * (0.05 + (r % 3) * 0.032);
      ctx.beginPath();
      for (var s = 0; s <= steps; s++) {
        var t = (s / steps) * Math.PI * 2;
        var p3 = evalInfinityPoint3D(t, off, spread, a, b, c, time * 1.15);
        var pr = project3D(p3.x, p3.y, p3.z, rotX, rotY, rotZ, cx, cy, fov);
        if (s === 0) ctx.moveTo(pr.sx, pr.sy);
        else ctx.lineTo(pr.sx, pr.sy);
      }
      ctx.closePath();
      ctx.strokeStyle = r === 0 ? 'rgba(217, 119, 87, 0.45)' : 'rgba(232, 146, 110, 0.20)';
      ctx.lineWidth = r === 0 ? 1.35 : 0.8;
      ctx.stroke();
    }

    // 绘制沿无限环轨道巡航的 48 颗纯净暖色发光节点与尾迹线
    var nodeCount = 48;
    for (var k = 0; k < nodeCount; k++) {
      var pt = particles[k * 3];
      var uNow = (pt.u + time * 0.45 * (0.8 + (k % 4) * 0.15)) % (Math.PI * 2);
      var spreadNow = a * 0.065 * ((k % 5) / 4);
      var pos3 = evalInfinityPoint3D(uNow, k * 1.1, spreadNow, a, b, c, time * 1.15);
      var prev3 = evalInfinityPoint3D(uNow - 0.08, k * 1.1, spreadNow, a, b, c, time * 1.15);
      var prNow = project3D(pos3.x, pos3.y, pos3.z, rotX, rotY, rotZ, cx, cy, fov);
      var prPrev = project3D(prev3.x, prev3.y, prev3.z, rotX, rotY, rotZ, cx, cy, fov);

      var depthA = Math.max(0.4, Math.min(0.95, 0.72 - prNow.z / (a * 1.8)));
      var col = PURE_INFINITY_PALETTE[k % PURE_INFINITY_PALETTE.length];

      ctx.beginPath();
      ctx.moveTo(prNow.sx, prNow.sy);
      ctx.lineTo(prPrev.sx, prPrev.sy);
      ctx.strokeStyle = 'rgba(' + col + ', ' + (depthA * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(prNow.sx, prNow.sy, 1.5 + (k % 3) * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + col + ', ' + depthA.toFixed(3) + ')';
      ctx.fill();
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
        telemetryPhase.textContent = (state.mode === 'infinity' ? '∞ HARMONIC RIBBON · t=' : 'KERR GEODESIC · t=') + phaseVal + ' rad';
        telemetryPcount.textContent = 'N = ' + state.particleCount + ' · ORGANIC + LINES';
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
      drawArticleHeaderInfinityCanvas(aCtx, aW, aH, state.time);
      aCtx.restore();
    }

    resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);
  }

  /* ========================================================================
     8. 实验室面板事件与主题初始化
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

  // 全站固定使用超宽布局 (96rem Ultrawide)
  document.body.dataset.scale = 'ultrawide';

  // 主题已由 <head> 里的 THEME_BOOT 定调（localStorage + prefers-color-scheme）。
  // 这里只把结果同步到画布状态与图标，绝不再重新决定主题。
  applyTheme(isDark() ? 'dark' : 'light');

  resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);
})();