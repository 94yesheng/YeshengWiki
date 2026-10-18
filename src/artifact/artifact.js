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

  var initialPage = document.body.dataset.page || 'home';
  var state = {
    mode: 'infinity',
    view: initialPage === 'posts' ? 'posts' : (initialPage === 'article' ? 'article' : (initialPage === 'photos' ? 'photos' : 'home')),
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
      topbarTag: 'NIGHT SINGULARITY // 卡冈图雅黑洞流形线与连续引力透镜粒子场',
      coordText: 'GARGANTUA SINGULARITY · 视界黑球、连续光子环流线与开普勒吸积盘',
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
     圆润双纽线（Round-Lobed Lemniscate）数学辅助函数（需求 3：两侧的圆更偏圆）
     ======================================================================== */
  function evalRoundLemniscate2D(u, a, b) {
    var sinU = Math.sin(u);
    var cosU = Math.cos(u);
    var den = 1 + sinU * sinU;
    // 通过 (1 + 0.24 * cos²u) 提升两侧环瓣的纵向饱满度，使左右两个环明显更偏圆润
    var lobeRoundness = 1 + 0.30 * cosU * cosU;
    return {
      x: (a * cosU) / den,
      y: (b * sinU * cosU * lobeRoundness) / den,
      sinU: sinU,
      cosU: cosU,
      den: den
    };
  }

  /* ========================================================================
     需求 6：全新重构全屏沉浸式粒子立体无限流形加载动画
     ======================================================================== */
  var loaderEl = document.getElementById('infinity-loader');
  var loaderCanvas = document.getElementById('loader-infinity-canvas');
  var loaderFill = document.getElementById('loader-bar-fill');
  var loaderStatus = document.getElementById('loader-status-text');
  var loaderPct = document.getElementById('loader-pct-readout');
  var loaderAnimId = 0;
  var loaderStartTs = 0;
  var loaderActive = false;

  function runInfinityLoader(durationMs) {
    if (!loaderEl) return;
    cancelAnimationFrame(loaderAnimId);
    loaderEl.dataset.loaded = 'false';
    loaderActive = true;
    loaderStartTs = performance.now();
    var dur = durationMs || 1050;

    // 预生成 80 颗初始粒子：从中心奇点向外旋转绽放后收束至无限流形
    var loaderParticles = [];
    for (var k = 0; k < 80; k++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = 30 + Math.random() * 260;
      loaderParticles.push({
        burstAngle: angle,
        burstDist: dist,
        burstSpeed: 0.8 + Math.random() * 1.4,
        loopU: Math.random() * Math.PI * 2,
        loopSpeed: 0.8 + Math.random() * 0.6,
        size: 1.2 + Math.random() * 2.2,
        color: k % 3 === 0 ? '217, 119, 87' : (k % 3 === 1 ? '232, 146, 110' : '245, 185, 135'),
        spread: (Math.random() - 0.5) * 16
      });
    }

    function stepLoader(now) {
      if (!loaderActive) return;
      var elapsed = now - loaderStartTs;
      var p = Math.min(1, elapsed / dur);
      var easeP = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      var pctVal = Math.round(p * 100);
      if (loaderFill) loaderFill.style.width = pctVal + '%';
      if (loaderPct) loaderPct.textContent = pctVal + '%';
      if (loaderStatus) {
        if (p < 0.3) {
          loaderStatus.textContent = 'QUANTUM GENESIS // 量子奇点初始化 (' + pctVal + '%)';
        } else if (p < 0.75) {
          loaderStatus.textContent = 'INFINITY MANIFOLD // 正在聚合立体纯粒子流形 (' + pctVal + '%)';
        } else if (p < 0.95) {
          loaderStatus.textContent = 'TOPOLOGY HARMONIC // 流形谐振对齐 (' + pctVal + '%)';
        } else {
          loaderStatus.textContent = 'MANIFOLD READY // 流形就绪 · 欢迎探索';
        }
      }

      if (loaderCanvas) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.round(window.innerWidth * dpr);
        var h = Math.round(window.innerHeight * dpr);
        if (loaderCanvas.width !== w || loaderCanvas.height !== h) {
          loaderCanvas.width = w;
          loaderCanvas.height = h;
        }
        var lctx = loaderCanvas.getContext('2d');
        var W = w / dpr;
        var H = h / dpr;
        var cx = W * 0.5;
        var cy = H * 0.44;
        var minDim = Math.min(W, H);

        lctx.save();
        lctx.scale(dpr, dpr);
        lctx.clearRect(0, 0, W, H);

        // 1. 中心柔和光晕
        var glowR = minDim * (0.12 + 0.38 * easeP);
        var glowGrad = lctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glowGrad.addColorStop(0, 'rgba(217, 119, 87, ' + (0.32 * (1 - easeP * 0.4)).toFixed(3) + ')');
        glowGrad.addColorStop(0.5, 'rgba(232, 146, 110, ' + (0.12 * (1 - easeP * 0.4)).toFixed(3) + ')');
        glowGrad.addColorStop(1, 'rgba(217, 119, 87, 0)');
        lctx.fillStyle = glowGrad;
        lctx.fillRect(0, 0, W, H);

        // 2. 无限流形参数尺寸
        var a = Math.min(W * 0.36, minDim * 0.48);
        var b = a * 0.86;

        // 3. 当 p > 0.25 时，立体无限环轮廓主体线条平滑显现
        if (p > 0.25) {
          var lineAlpha = Math.min(1, (p - 0.25) / 0.45);
          lctx.save();
          lctx.beginPath();
          for (var s = 0; s <= 100; s++) {
            var tVal = (s / 100) * Math.PI * 2;
            var sinT = Math.sin(tVal), cosT = Math.cos(tVal);
            var den = 1 + sinT * sinT;
            var px = cx + (a * cosT) / den;
            var py = cy + (b * sinT * cosT) / den;
            if (s === 0) lctx.moveTo(px, py);
            else lctx.lineTo(px, py);
          }
          lctx.closePath();
          lctx.strokeStyle = 'rgba(217, 119, 87, ' + (0.38 * lineAlpha).toFixed(3) + ')';
          lctx.lineWidth = 1.4;
          lctx.stroke();

          // 左右双叶焦点光点
          var fx = a * 0.62;
          [-fx, fx].forEach(function (fxVal) {
            lctx.beginPath();
            lctx.arc(cx + fxVal, cy, 3.5, 0, Math.PI * 2);
            lctx.fillStyle = 'rgba(217, 119, 87, ' + (0.65 * lineAlpha).toFixed(3) + ')';
            lctx.fill();
          });
          lctx.restore();
        }

        // 4. 80 颗粒子绽放与收束过渡
        var convergeWeight = Math.max(0, Math.min(1, (p - 0.2) / 0.55));
        for (var i = 0; i < loaderParticles.length; i++) {
          var lp = loaderParticles[i];
          // 绽放形态下的坐标
          var burstR = lp.burstDist * easeP * lp.burstSpeed;
          var bx = cx + Math.cos(lp.burstAngle + elapsed * 0.001) * burstR;
          var by = cy + Math.sin(lp.burstAngle + elapsed * 0.001) * burstR * 0.75;

          // 无限流形形态下的坐标
          lp.loopU = (lp.loopU + lp.loopSpeed * 0.025) % (Math.PI * 2);
          var sinLu = Math.sin(lp.loopU), cosLu = Math.cos(lp.loopU);
          var denL = 1 + sinLu * sinLu;
          var ix = cx + (a * cosLu) / denL + Math.cos(lp.loopU * 2) * lp.spread;
          var iy = cy + (b * sinLu * cosLu) / denL + Math.sin(lp.loopU * 2) * lp.spread;

          // 平滑线性插值
          var curX = bx * (1 - convergeWeight) + ix * convergeWeight;
          var curY = by * (1 - convergeWeight) + iy * convergeWeight;
          var pAlpha = Math.min(0.95, 0.4 + 0.55 * Math.sin(p * Math.PI));

          if (lp.size > 2.0) {
            lctx.beginPath();
            lctx.arc(curX, curY, lp.size * 2.2, 0, Math.PI * 2);
            lctx.fillStyle = 'rgba(' + lp.color + ', ' + (pAlpha * 0.18).toFixed(3) + ')';
            lctx.fill();
          }

          lctx.beginPath();
          lctx.arc(curX, curY, lp.size, 0, Math.PI * 2);
          lctx.fillStyle = 'rgba(' + lp.color + ', ' + pAlpha.toFixed(3) + ')';
          lctx.fill();
        }

        // 5. 在 p > 0.82 时，中心向外扩散一道流形就绪完成光环
        if (p > 0.82) {
          var pulseP = (p - 0.82) / 0.18;
          var pulseR = minDim * 0.08 + pulseP * minDim * 0.45;
          lctx.save();
          lctx.beginPath();
          lctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
          lctx.strokeStyle = 'rgba(232, 146, 110, ' + (0.5 * (1 - pulseP)).toFixed(3) + ')';
          lctx.lineWidth = 1.6;
          lctx.stroke();
          lctx.restore();
        }

        lctx.restore();
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

  // 页面首次载入启动全屏粒子无限加载动画
  runInfinityLoader(1050);

  var btnReplayLoader = document.getElementById('btn-replay-loader');
  if (btnReplayLoader) {
    btnReplayLoader.addEventListener('click', function () {
      runInfinityLoader(1100);
    });
  }

  /* ========================================================================
     需求 6：昼夜切换全屏平滑遮盖与奇点/无限流形转换层
     ======================================================================== */
  var transStage = document.getElementById('theme-transition-stage');
  var transVeil = document.getElementById('theme-transition-veil');
  var transCanvas = document.getElementById('theme-transition-canvas');
  var transBadge = document.getElementById('theme-transition-badge');
  var transAnimId = 0;

  function playThemeTransition(targetTheme, onPeakCoverage) {
    if (!transStage || !transCanvas) {
      if (typeof onPeakCoverage === 'function') onPeakCoverage();
      return;
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (typeof onPeakCoverage === 'function') onPeakCoverage();
      return;
    }

    cancelAnimationFrame(transAnimId);
    var toDark = targetTheme === 'dark';
    transStage.dataset.active = 'true';
    if (transBadge) {
      transBadge.textContent = toDark
        ? 'SINGULARITY COLLAPSE // 无限流形 ∞ 坍缩至卡冈图雅黑洞'
        : 'MANIFOLD UNFOLD // 黑洞奇点展开至立体无限环 ∞';
    }

    var startTs = performance.now();
    var duration = 860;
    var themeSwapped = false;

    function stepTransition(now) {
      var elapsed = now - startTs;
      var p = Math.min(1, elapsed / duration);
      var ease = 1 - Math.pow(1 - p, 3);

      // 计算全屏遮盖层的柔和透明度曲线：在 p ~ 0.42 达到峰值 0.94，然后平滑褪去
      var veilAlpha = 0;
      if (p < 0.42) {
        veilAlpha = Math.sin((p / 0.42) * (Math.PI / 2)) * 0.94;
      } else {
        veilAlpha = Math.cos(((p - 0.42) / 0.58) * (Math.PI / 2)) * 0.94;
      }
      veilAlpha = Math.max(0, Math.min(0.96, veilAlpha));

      if (transVeil) {
        transVeil.style.opacity = veilAlpha.toFixed(3);
      }

      // 当全屏遮盖达到最高点时，无缝切换 DOM 主题，用户完全察觉不到生硬的闪烁
      if (p >= 0.42 && !themeSwapped) {
        themeSwapped = true;
        if (typeof onPeakCoverage === 'function') {
          onPeakCoverage();
        }
      }

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

      // 全屏平滑遮盖底色渐变，衬托过渡氛围
      var coverGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.65);
      if (toDark) {
        coverGrad.addColorStop(0, 'rgba(18, 18, 17, ' + (veilAlpha * 0.92).toFixed(3) + ')');
        coverGrad.addColorStop(0.7, 'rgba(217, 119, 87, ' + (veilAlpha * 0.22).toFixed(3) + ')');
        coverGrad.addColorStop(1, 'rgba(18, 18, 17, ' + (veilAlpha * 0.88).toFixed(3) + ')');
      } else {
        coverGrad.addColorStop(0, 'rgba(250, 249, 245, ' + (veilAlpha * 0.92).toFixed(3) + ')');
        coverGrad.addColorStop(0.7, 'rgba(242, 179, 126, ' + (veilAlpha * 0.24).toFixed(3) + ')');
        coverGrad.addColorStop(1, 'rgba(250, 249, 245, ' + (veilAlpha * 0.88).toFixed(3) + ')');
      }
      ctx.fillStyle = coverGrad;
      ctx.fillRect(0, 0, W, H);

      var morph = toDark ? ease : (1 - ease);
      var fadeAlpha = Math.sin(p * Math.PI);
      var infScale = 1 - morph * 0.72;
      var a = minDim * 0.18 * infScale;
      var b = a * 0.85;
      var bhR = minDim * 0.058 * (0.25 + 0.75 * morph);

      // 绘制形变中的平面无限环 ∞
      if (morph < 0.92) {
        var infAlpha = (1 - morph) * fadeAlpha * 0.95;
        ctx.beginPath();
        for (var s = 0; s <= 96; s++) {
          var t = (s / 96) * Math.PI * 2;
          var st = Math.sin(t), ct = Math.cos(t);
          var den = 1 + st * st;
          var ix = (a * ct) / den;
          var iy = (b * st * ct) / den;
          var rot = morph * 1.15;
          var rx = ix * Math.cos(rot) - iy * Math.sin(rot);
          var ry = ix * Math.sin(rot) + iy * Math.cos(rot);
          if (s === 0) ctx.moveTo(cx + rx, cy + ry);
          else ctx.lineTo(cx + rx, cy + ry);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(217, 119, 87, ' + infAlpha.toFixed(3) + ')';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }

      // 绘制形变中的平面黑洞视界与吸积环
      if (morph > 0.08) {
        var bhAlpha = morph * fadeAlpha * 0.98;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.19);
        ctx.beginPath();
        ctx.ellipse(0, 0, bhR * 2.65, bhR * 0.55, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(242, 179, 126, ' + bhAlpha.toFixed(3) + ')';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, bhR * 1.3, Math.PI * 1.08, Math.PI * 1.92);
        ctx.strokeStyle = 'rgba(217, 119, 87, ' + (bhAlpha * 0.88).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, bhR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(18, 18, 17, ' + bhAlpha.toFixed(3) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 228, 190, ' + bhAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // 40 颗纯粒子随形变在双焦点与黑洞奇点之间收束/展开
      for (var k = 0; k < 40; k++) {
        var ang = (k / 40) * Math.PI * 2 + p * 2.5;
        var stK = Math.sin(ang), ctK = Math.cos(ang);
        var denK = 1 + stK * stK;
        var infPx = (a * 1.15 * ctK) / denK;
        var infPy = (b * 1.15 * stK * ctK) / denK;
        var diskR = bhR * (1.25 + (k % 5) * 0.35);
        var bhPx = diskR * Math.cos(ang * 1.5);
        var bhPy = diskR * Math.sin(ang * 1.5) * 0.28;

        var px = cx + infPx * (1 - morph) + bhPx * morph;
        var py = cy + infPy * (1 - morph) + bhPy * morph;
        ctx.beginPath();
        ctx.arc(px, py, 1.6 + (k % 3) * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(217, 119, 87, ' + (fadeAlpha * 0.9).toFixed(3) + ')';
        ctx.fill();
      }

      ctx.restore();

      if (p < 1) {
        transAnimId = requestAnimationFrame(stepTransition);
      } else {
        transStage.dataset.active = 'false';
        if (transVeil) transVeil.style.opacity = '0';
        if (!themeSwapped && typeof onPeakCoverage === 'function') {
          onPeakCoverage();
        }
      }
    }

    transAnimId = requestAnimationFrame(stepTransition);
  }

  function commitThemeDOM(nextTheme) {
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

  function applyTheme(nextTheme, withTransition) {
    if (withTransition) {
      playThemeTransition(nextTheme, function () {
        commitThemeDOM(nextTheme);
      });
    } else {
      commitThemeDOM(nextTheme);
    }
  }

  /* ========================================================================
     需求 4：主页照片一栏边界检测逻辑
     这个照片墙显示最新的一组照片，如果一张图片的宽度已经超过了该栏的边界，就不用显示
     ======================================================================== */
  var homePhotosStage = document.getElementById('home-photos-stage');
  var homePhotosStrip = document.getElementById('demo-wall-photos');
  var homePhotoFitStatus = document.getElementById('home-photo-fit-status');
  var photoBoundaryBadge = document.getElementById('photo-boundary-badge');

  function fitHomePhotoWallBounds() {
    if (!homePhotosStage || !homePhotosStrip) return;
    if (state.view !== 'home') return;

    var items = Array.from(homePhotosStrip.querySelectorAll('.wf-item'));
    if (!items.length) return;

    // 1. 先全部恢复显示以测量真实宽度
    items.forEach(function (item) {
      item.style.display = '';
      delete item.dataset.boundaryHidden;
    });

    var stageStyle = window.getComputedStyle(homePhotosStage);
    var padLeft = parseFloat(stageStyle.paddingLeft) || 0;
    var padRight = parseFloat(stageStyle.paddingRight) || 0;
    var maxStageWidth = homePhotosStage.clientWidth - padLeft - padRight;
    if (maxStageWidth <= 40) return;

    var stripStyle = window.getComputedStyle(homePhotosStrip);
    var gap = parseFloat(stripStyle.columnGap || stripStyle.gap) || 16.8;

    var usedWidth = 0;
    var shownCount = 0;

    items.forEach(function (item, idx) {
      var rect = item.getBoundingClientRect();
      var itemW = rect.width;
      // 若还没有加载完图片则根据高宽比估算宽度
      if (itemW < 20) {
        var ar = parseFloat(item.dataset.ar) || 1.5;
        itemW = 240 * ar + 14;
      }
      var nextWidth = shownCount === 0 ? itemW : (usedWidth + gap + itemW);

      // 若单张图片宽度已超过该栏边界，或加上该张图片后超出该栏右边界，则不显示
      if (itemW > maxStageWidth || nextWidth > maxStageWidth) {
        // 若第一张图因极端窄屏略超，仅在 idx > 0 时隐藏，保证至少不会空屏；若正常视口则严格按边界裁剪
        if (idx === 0 && maxStageWidth < 260) {
          usedWidth = itemW;
          shownCount = 1;
        } else {
          item.style.display = 'none';
          item.dataset.boundaryHidden = 'true';
        }
      } else {
        usedWidth = nextWidth;
        shownCount++;
      }
    });

    if (homePhotoFitStatus) {
      homePhotoFitStatus.innerHTML =
        '最新一组共 ' + items.length + ' 张照片 · 当前栏宽内完整展示 <strong class="telemetry-accent">' +
        shownCount + ' 张</strong>（超出该栏边界的 ' + (items.length - shownCount) + ' 张已自动隐藏）';
    }
    if (photoBoundaryBadge) {
      photoBoundaryBadge.textContent = 'SHOWING ' + shownCount + ' / ' + items.length + ' IN BOUNDS';
    }
  }

  // 监听图片加载完成以精确重算宽度边界
  if (homePhotosStrip) {
    homePhotosStrip.querySelectorAll('img').forEach(function (img) {
      if (img.complete) return;
      img.addEventListener('load', fitHomePhotoWallBounds);
    });
  }

  /* ========================================================================
     需求 1 & 需求 8：视图切换与详细页管理
     点击顶部导航栏跳转到对应的详细页（主页 #home-view / 文章详细页 #article-view / 照片信息页 #photos-view）
     ======================================================================== */
  var homeView = document.getElementById('home-view');
  var postsView = document.getElementById('posts-view');
  var articleView = document.getElementById('article-view');
  var photosView = document.getElementById('photos-view');
  var screenRuler = document.getElementById('screen-ruler');
  var viewSwitchBtns = document.querySelectorAll('[data-switch-view]');
  var navLinks = Array.from(document.querySelectorAll('.site-nav-link'));

  var ARTICLE_DB = {
    mc: {
      entryNo: '01',
      slug: '/posts/mc-server/',
      path: '/posts/mc-server/',
      title: '如何快速零成本搭建一个 Mc 小型服务器',
      date: '二〇二六年三月十三日',
      tags: '技术 · 服务器',
      words: '约 2,400 字',
      reading: '约 6 分钟',
      lead: '用尽量简单且低成本的方法让 Minecraft 服务器迅速跑起来。针对无公网 IP 场景，通过 frp 内网穿透结合本地闲置算力，三步完成多人联机部署。',
      toc: [
        { id: 'sec-01', num: '01', text: '一、Java 21 运行环境配置' },
        { id: 'sec-02', num: '02', text: '二、PaperMC 服务端内核初始化' },
        { id: 'sec-03', num: '03', text: '三、FRP 内网穿透映射实操' },
        { id: 'sec-04', num: '04', text: '四、联机排障与性能调优参数' }
      ],
      specs: [
        ['JDK RUNTIME', 'Temurin 21 LTS'],
        ['SERVER CORE', 'Paper 1.21.x'],
        ['HEAP MEMORY', '-Xms4G -Xmx4G'],
        ['GC POLICY', 'G1GC (Aikars)'],
        ['DEFAULT PORT', 'TCP 25565']
      ],
      prose: null // 初始化时从 DOM 保存默认 Mc 正文
    },
    jibao: {
      entryNo: '02',
      slug: '/posts/ji-bao/',
      path: '/posts/ji-bao/',
      title: '3月9号，想吃鸡煲',
      date: '二〇二六年三月九日',
      tags: '随笔 · 日常',
      words: '约 1,350 字',
      reading: '约 4 分钟',
      lead: '校外那间普通的重庆鸡公煲贴上了旺铺出租。记下这些微不足道却真实存在的生活切片，大概也是探索世界广度的一种方式。',
      toc: [
        { id: 'jb-01', num: '01', text: '一、不辞而别的校外小店' },
        { id: 'jb-02', num: '02', text: '二、进门右手边第一张桌子' },
        { id: 'jb-03', num: '03', text: '三、彼此经历中的小小注脚' }
      ],
      specs: [
        ['CATEGORY', '日常随笔 · 记事'],
        ['LOCATION', '校门外 · 重庆鸡公煲'],
        ['DATE', '二〇二六年三月九日'],
        ['MOOD', '微辣 · 怀念'],
        ['BGM', '网易云外链单曲']
      ],
      prose:
        '<h2 id="jb-01"><span class="sec-index">01 // MEMORY</span><span>一、不辞而别的校外小店</span></h2>' +
        '<p>鸡煲，全名重庆鸡公煲，校外的一间普通小店。3月9号，一个稀松平常的下午，鸡煲的门头贴上了一张鲜红的旺铺出租，里面空无一物。鸡煲倒闭了。</p>' +
        '<p>鸡煲是什么时候走的呢？我不得而知，像青春里略带缺憾的感情，没有华丽的开头，没有正式的告别，在不经意间不辞而别了。</p>' +
        '<h2 id="jb-02"><span class="sec-index">02 // HABIT</span><span>二、进门右手边第一张桌子</span></h2>' +
        '<p>我向来不喜欢出校门，太远，太麻烦。某天几个朋友说外面有家餐馆还不错，一向不爱出门的我稀里糊涂地坐在了鸡煲的廉价木凳子上。那是我们第一次见面。</p>' +
        '<p>那次之后，我开始习惯去鸡煲吃饭，习惯在进门右手边第一张桌子的第一个凳子坐下，点上一份微辣鸡公煲，配一份萝卜牛腩或冒烤鸭，渐渐成为了店里定期刷新的 NPC。世界上大多数遇见都是如此：你恰巧需要一些东西调剂寡淡的生活时，它恰好出现。</p>' +
        '<div class="q-callout"><div class="q-callout-head">LIFE SLICE // 随笔摘录</div><p>当它触手可及时，我们总是选择性忽略；直到门头贴上旺铺出租的那天夜里，才突然格外想念那口咸辣滚烫的炭火香气。</p></div>' +
        '<h2 id="jb-03"><span class="sec-index">03 // FOOTNOTE</span><span>三、彼此经历中的小小注脚</span></h2>' +
        '<p>不久后，鸡煲的位置或许会重新开一家餐馆，而我和鸡煲都将开启一段新的旅程，最终变成彼此生命里的一个小小注脚。或许在很久以后的将来，踏进一家陌生的餐馆点上一份鸡公煲，熟悉咸辣的味道在口腔炸开，我大概会发愣几秒，然后笑笑。</p>'
    },
    maptoposter: {
      entryNo: '03',
      slug: '/posts/maptoposter/',
      path: '/posts/maptoposter/',
      title: '一键生成城市地图壁纸 —— MapToPoster',
      date: '二〇二六年三月九日',
      tags: '技术 · 工具',
      words: '约 1,680 字',
      reading: '约 5 分钟',
      lead: '利用 OpenStreetMap 的道路拓扑矢量与经纬度网格数据，通过 Python 脚本将任意城市的街道肌理渲染成极简理性的几何海报壁纸。',
      toc: [
        { id: 'mp-01', num: '01', text: '一、前期准备：Git 与 Python 环境' },
        { id: 'mp-02', num: '02', text: '二、克隆仓库与虚拟环境依赖安装' },
        { id: 'mp-03', num: '03', text: '三、自定义城市经纬度与风格渲染' }
      ],
      specs: [
        ['LANGUAGE', 'Python 3.10+'],
        ['DATA SOURCE', 'OpenStreetMap (OSM)'],
        ['OUTPUT', '300 DPI PNG / SVG'],
        ['REPO', 'originalankur/maptoposter'],
        ['LICENSE', 'MIT Open Source']
      ],
      prose:
        '<h2 id="mp-01"><span class="sec-index">01 // ENVIRONMENT</span><span>一、前期准备：Git 与 Python 环境</span></h2>' +
        '<p>MapToPoster 可以根据自定义的城市名称、经纬度边界与配色主题，拉取 OpenStreetMap 开放地理矢量数据，一键生成极具几何秩序感的城市街巷海报壁纸。</p>' +
        '<p>在开始前只需准备好 Git 版本控制工具与 Python 3 运行环境（Windows 用户可直接通过 Microsoft Store 搜索 Python 一键安装）。</p>' +
        '<h2 id="mp-02"><span class="sec-index">02 // INSTALLATION</span><span>二、克隆仓库与虚拟环境依赖安装</span></h2>' +
        '<div class="q-codeblock"><div class="q-codebar"><span>SHELL // 克隆与安装依赖</span><button type="button" class="q-copy-code-btn" data-copy-code="git clone https://github.com/originalankur/maptoposter.git">COPY</button></div>' +
        '<pre><code>$ git clone https://github.com/originalankur/maptoposter.git\n$ cd maptoposter\n$ python -m venv venv\n$ venv\\Scripts\\activate\n$ pip install -r requirements.txt</code></pre></div>' +
        '<h2 id="mp-03"><span class="sec-index">03 // RENDERING</span><span>三、自定义城市经纬度与风格渲染</span></h2>' +
        '<p>配置好虚拟环境后，即可指定目标城市名称、半径范围与纸墨或暗黑配色方案，脚本会自动抓取主干道、支路与水系多边形并排版输出高分辨率海报。</p>'
    },
    blender: {
      entryNo: '04',
      slug: '/posts/blender/',
      path: '/posts/blender/',
      title: '七天了解一件事 —— Blender',
      date: '二〇二六年二月二十四日',
      tags: '技术 · 建模',
      words: '约 1,920 字',
      reading: '约 5 分钟',
      lead: '给自己设定七天的时间边界，从零开始接触三维网格拓扑、修改器堆栈、着色器节点与 Cycles 光线追踪渲染。',
      toc: [
        { id: 'bl-01', num: '01', text: '一、Day 1–2：视图导航与基础网格雕刻' },
        { id: 'bl-02', num: '02', text: '二、Day 3–5：修改器堆栈与硬表面建模' },
        { id: 'bl-03', num: '03', text: '三、Day 6–7：节点材质、布光与 Cycles 渲染' }
      ],
      specs: [
        ['SOFTWARE', 'Blender 4.x LTS'],
        ['RENDER ENGINE', 'Cycles / EEVEE'],
        ['DURATION', '7 Days Intensive'],
        ['KEY SKILLS', 'Mesh / Nodes / Lighting'],
        ['GOAL', '新房空间布局与三维入门']
      ],
      prose:
        '<h2 id="bl-01"><span class="sec-index">01 // MESH BASICS</span><span>一、Day 1–2：视图导航与基础网格雕刻</span></h2>' +
        '<p>年后在家里闲着没事，家里刚好买了一套新房，年底才开始装修，便想着提前用三维软件规划一下新家布局，顺带给自己定个「七天了解一件事」的小目标——从零开始学 Blender。</p>' +
        '<p>第一天跟着 Kurt 的零基础教程熟悉了视图旋转、G/R/S 变换快捷键，以及建模、布光、材质、渲染的完整工作流，花了五个小时做出了第一个练习模型；第二天进入编辑模式，学习挤出（Extrude）、内插面（Inset）与倒角（Bevel），从「搭积木」进阶到「雕石膏」。</p>' +
        '<h2 id="bl-02"><span class="sec-index">02 // MODIFIERS</span><span>二、Day 3–5：修改器堆栈与硬表面建模</span></h2>' +
        '<p>掌握表面细分（Subdivision Surface）、镜像（Mirror）与布尔（Boolean）修改器后，建模效率成倍提升。通过控制卡线与拓扑流向，能够干净地塑造出家具弧度与器物倒角。</p>' +
        '<h2 id="bl-03"><span class="sec-index">03 // CYCLES RENDER</span><span>三、Day 6–7：节点材质、布光与 Cycles 渲染</span></h2>' +
        '<p>最后两天接触 Shader Editor 着色器节点与三点布光法，开启 Cycles 光线追踪与 OIDN 降噪器，看着冰冷的灰模在全局光照下呈现出温润的陶瓷与木纹质感，成就感满满。</p>'
    },
    deepseek: {
      entryNo: '05',
      slug: '/posts/deepseek-wechat/',
      path: '/posts/deepseek-wechat/',
      title: '关于将 Deepseek 接入微信',
      date: '二〇二五年三月七日',
      tags: '技术 · AI',
      words: '约 2,150 字',
      reading: '约 6 分钟',
      lead: '记录如何通过轻量级服务容器将 DeepSeek API 接入日常即时通讯工作流，配置上下文记忆窗口与异常重试机制。',
      toc: [
        { id: 'ds-01', num: '01', text: '一、前期准备：微信号、Python 与 API 密钥' },
        { id: 'ds-02', num: '02', text: '二、WeChatBot 客户端配置与模型绑定' },
        { id: 'ds-03', num: '03', text: '三、提示词设定与上下文窗口调优' }
      ],
      specs: [
        ['LLM API', 'DeepSeek-V3 / R1'],
        ['PROVIDER', 'Official / SiliconCloud'],
        ['RUNTIME', 'Python 3.8+ (Windows)'],
        ['FRAMEWORK', 'WeChatBot_WXAUTO_SE v3.8'],
        ['LATENCY', '~1.2s First Token']
      ],
      prose:
        '<h2 id="ds-01"><span class="sec-index">01 // PREPARATION</span><span>一、前期准备：微信号、Python 与 API 密钥</span></h2>' +
        '<p>最近使用 DeepSeek 的频率越来越高，便尝试将其接入微信日常对话流中。整个方案需要准备：两个微信号（小号作为 Bot 载体）、Python 3.8+ 环境、DeepSeek 官方开放平台或硅基流动（SiliconCloud）的 API Key，以及开源的 WeChatBot_WXAUTO_SE 客户端。</p>' +
        '<h2 id="ds-02"><span class="sec-index">02 // CONFIGURATION</span><span>二、WeChatBot 客户端配置与模型绑定</span></h2>' +
        '<div class="q-codeblock"><div class="q-codebar"><span>CONFIG.JSON // API 接入核心参数</span><button type="button" class="q-copy-code-btn" data-copy-code="base_url = https://api.siliconflow.cn/v1">COPY</button></div>' +
        '<pre><code>{\n  "api_base": "https://api.siliconflow.cn/v1",\n  "model": "deepseek-ai/DeepSeek-V3",\n  "temperature": 0.65,\n  "max_context_turns": 12\n}</code></pre></div>' +
        '<h2 id="ds-03"><span class="sec-index">03 // WORKFLOW</span><span>三、提示词设定与上下文窗口调优</span></h2>' +
        '<p>填入 API 密钥并绑定监听对象后，即可在微信聊天窗口直接唤醒 DeepSeek 协助检索技术资料、润色文稿或推导代码逻辑。</p>'
    }
  };

  var proseBodyEl = document.getElementById('article-prose-body');
  if (proseBodyEl && !ARTICLE_DB.mc.prose) {
    ARTICLE_DB.mc.prose = proseBodyEl.innerHTML;
  }

  /* 照片信息详细页数据库（需求 8） */
  var PHOTO_DB = (window.__PHOTO_DB && window.__PHOTO_DB.length) ? window.__PHOTO_DB : [
    {
      idx: 0,
      coord: 'FRAME #01 // GROUP 01 · LATEST',
      groupBadge: 'LATEST GROUP #01',
      title: '暮色天际线 · 山城日落切片',
      story: '二〇二四年秋日傍晚摄于重庆南滨路。夕阳沉入远山棱线之后，天空在二十分钟内由暖琥珀过渡至深邃群青，江面与城市天际线形成天然的 16:9 宽银幕电影画幅。',
      src: '/artifact/home/images/photo-01-large.jpg',
      ratioPill: '16:9 HORIZONTAL',
      fileCode: 'FILE: 2024-10-07-SUNSET.JPG',
      date: '二〇二四年十月七日',
      location: '重庆 · 南滨路江畔',
      aspect: '16:9 横幅 (2560×1440)',
      camera: 'Canon EOS R6',
      lens: 'RF 35mm F1.8 · 定焦',
      exposure: 'f/4.0 · 1/250s · ISO 160',
      color: 'WARM AMBER // 暖调直出',
      gps: '29°33\'18"N · 106°34\'42"E',
      ev: 'EV -0.3 · HIGH DYNAMIC',
      hist: [28, 42, 64, 82, 90, 74, 58, 46, 62, 78, 88, 70, 52, 36, 24, 16]
    },
    {
      idx: 1,
      coord: 'FRAME #06 // GROUP 02 · ARCHIVE',
      groupBadge: 'ARCHIVE GROUP #02',
      title: '初夏傍晚街景 · 旧时光切片',
      story: '二〇二二年六月一日傍晚随手记录的街头时刻。4:3 原生传感器比例保留了恰到好处的天空留白与街巷烟火气。',
      src: '/artifact/home/images/photo-02-large.jpg',
      ratioPill: '4:3 HORIZONTAL',
      fileCode: 'FILE: 2022-06-01-STREET.JPG',
      date: '二〇二二年六月一日',
      location: '街头漫游 · 黄昏',
      aspect: '4:3 横幅 (2560×1920)',
      camera: 'RICOH GR III',
      lens: '18.3mm (等效 28mm) F2.8',
      exposure: 'f/2.8 · 1/160s · ISO 200',
      color: 'POSITIVE FILM // 正片模拟',
      gps: '30°16\'04"N · 120°09\'12"E',
      ev: 'EV 0.0 · BALANCED TONE',
      hist: [18, 32, 48, 66, 78, 85, 80, 72, 64, 58, 50, 42, 34, 26, 18, 12]
    },
    {
      idx: 2,
      coord: 'FRAME #02 // GROUP 01 · LATEST',
      groupBadge: 'LATEST GROUP #01',
      title: '山城立体纵深 · 阶梯与吊脚楼',
      story: '重庆特有的三维立体城市地形，采用 3:4 纵向构图收纳自下而上层叠生长的步道、吊脚楼群与江岸微光。',
      src: '/artifact/home/images/photo-03-large.jpg',
      ratioPill: '3:4 VERTICAL',
      fileCode: 'FILE: 2024-07-17-MOUNTAIN-CITY.JPG',
      date: '二〇二四年七月十七日',
      location: '重庆 · 洪崖洞至戴家巷步道',
      aspect: '3:4 竖幅 (630×840)',
      camera: 'Canon EOS R6',
      lens: 'RF 50mm F1.8 · 标准定焦',
      exposure: 'f/2.8 · 1/125s · ISO 400',
      color: 'CLASSIC NEG // 暖金夜色',
      gps: '29°33\'49"N · 106°34\'28"E',
      ev: 'EV -0.7 · LOWKEY SHADOWS',
      hist: [54, 76, 88, 72, 58, 45, 38, 42, 55, 68, 60, 44, 30, 22, 15, 10]
    },
    {
      idx: 3,
      coord: 'FRAME #05 // GROUP 02 · ARCHIVE',
      groupBadge: 'ARCHIVE GROUP #02',
      title: '城市经纬海报 · MapToPoster 生成切片',
      story: '通过 Python 脚本拉取 OpenStreetMap 城市路网与水系矢量数据，以纸墨蓝图配色渲染出的 4:3 极简几何海报。',
      src: '/artifact/home/images/photo-04-large.jpg',
      ratioPill: '4:3 HORIZONTAL',
      fileCode: 'FILE: 2026-03-09-MAPTOPOSTER.PNG',
      date: '二〇二六年三月九日',
      location: '数字工坊 · OSM 矢量渲染',
      aspect: '4:3 横幅 (1024×750)',
      camera: 'MapToPoster Engine v1.4',
      lens: 'WGS84 Mercator Projection',
      exposure: '300 DPI · Vector Anti-Alias',
      color: 'PAPER & INK // 纸墨蓝图',
      gps: '29°33\'00"N · 106°33\'00"E',
      ev: 'HIGH KEY // 纸底高调',
      hist: [10, 12, 15, 18, 22, 26, 30, 35, 42, 52, 68, 82, 92, 96, 88, 74]
    },
    {
      idx: 4,
      coord: 'FRAME #03 // GROUP 01 · LATEST',
      groupBadge: 'LATEST GROUP #01',
      title: '嘉陵江畔夜色 · 桥影与晚风',
      story: '盛夏夜晚吹着嘉陵江的晚风，跨江大桥的暖色灯光倒映在流动的江水中，16:9 画幅将两岸灯火尽收眼底。',
      src: '/artifact/home/images/photo-05-large.jpg',
      ratioPill: '16:9 HORIZONTAL',
      fileCode: 'FILE: 2024-07-17-CHONGQING-RIVER.JPG',
      date: '二〇二四年七月十七日',
      location: '重庆 · 嘉陵江北岸',
      aspect: '16:9 横幅 (2560×1436)',
      camera: 'Canon EOS R6',
      lens: 'RF 24-105mm F4L @ 24mm',
      exposure: 'f/5.6 · 1/60s · ISO 640',
      color: 'TUNGSTEN GOLD // 夜景暖调',
      gps: '29°34\'12"N · 106°34\'15"E',
      ev: 'EV -0.5 · NIGHT GLOW',
      hist: [62, 84, 92, 78, 60, 48, 42, 46, 58, 70, 64, 48, 32, 24, 18, 12]
    },
    {
      idx: 5,
      coord: 'FRAME #04 // GROUP 01 · LATEST',
      groupBadge: 'LATEST GROUP #01',
      title: '远山层云天光 · 盛夏午后',
      story: '七月初夏雨后初晴，远山棱线之上层云叠嶂，清澈的高空光线让远近山脊呈现出如同水墨画般的空气透视感。',
      src: '/artifact/home/images/photo-06-large.jpg',
      ratioPill: '16:9 HORIZONTAL',
      fileCode: 'FILE: 2024-07-08-CLOUDS.JPG',
      date: '二〇二四年七月八日',
      location: '川渝远山 · 观景台',
      aspect: '16:9 横幅 (2560×1436)',
      camera: 'Canon EOS R6',
      lens: 'RF 85mm F2 · 中长焦',
      exposure: 'f/8.0 · 1/800s · ISO 100',
      color: 'DAYLIGHT CLEAR // 日光通透',
      gps: '29°38\'20"N · 106°28\'05"E',
      ev: 'EV +0.3 · SKY HIGHLIGHT',
      hist: [14, 22, 34, 48, 62, 74, 82, 86, 80, 72, 64, 54, 42, 30, 20, 14]
    }
  ];

  // 为每张照片补充精确宽高比 ar 与横竖方向标识（#02 idx=2 为 3:4 竖向，其余为 16:9 或 4:3 横向）
  var PHOTO_AR_MAP = { 0: 1.7797, 1: 1.3333, 2: 0.7500, 3: 1.3659, 4: 1.7834, 5: 1.7834 };
  PHOTO_DB.forEach(function (item) {
    item.ar = item.ar || PHOTO_AR_MAP[item.idx] || 1.7778;
    item.orient = item.ar < 1.0 ? 'portrait' : 'landscape';
  });

  // 按视觉卡片顺序排列的索引序列；有服务端数据时按数据库顺序
  var PHOTO_VISUAL_ORDER = (window.__PHOTO_DB && window.__PHOTO_DB.length)
    ? PHOTO_DB.map(function (item) { return item.idx; })
    : [0, 2, 4, 5, 3, 1];
  var currentPhotoIdx = 0;

  /* 根据当前选中照片的宽高比 (ar) 与一屏视口边界，动态计算最大化无越界画框尺寸并驱动横/竖平滑伸缩动画 */
  function updateInspectorFrameGeometry() {
    var target = PHOTO_DB[currentPhotoIdx] || PHOTO_DB[0];
    var gridEl = document.getElementById('photos-inspector-grid');
    var vpEl = document.getElementById('insp-viewport');
    var frameBox = document.getElementById('insp-frame-box');
    if (!gridEl || !vpEl || !frameBox) return;

    var ar = target.ar || 1.7778;
    var isPortrait = ar < 1.0;
    var stageShare = isPortrait ? 0.44 : (ar > 1.5 ? 0.67 : 0.63);

    gridEl.dataset.orientMode = isPortrait ? 'portrait' : 'landscape';
    gridEl.style.setProperty('--insp-stage-w', (stageShare * 100).toFixed(1) + '%');
    frameBox.dataset.frameOrient = isPortrait ? 'portrait' : 'landscape';

    var gridW = gridEl.clientWidth;
    var vpH = vpEl.clientHeight;
    if (gridW < 40 || vpH < 40) return;

    var isMobileSingleCol = window.innerWidth <= 1152;
    var targetStageW = isMobileSingleCol ? gridW : (gridW * stageShare);
    // 预留舞台内边距与安全呼吸边距，确保画框绝不超出边界且整体画面美观
    var availW = Math.max(180, targetStageW - 62);
    var availH = Math.max(180, vpH - 22);
    var matPad = 14;
    var maxImgW = Math.max(140, availW - matPad);
    var maxImgH = Math.max(140, availH - matPad);

    var fitW = maxImgW;
    var fitH = fitW / ar;
    if (fitH > maxImgH) {
      fitH = maxImgH;
      fitW = fitH * ar;
    }

    var finalBoxW = Math.round(fitW + matPad);
    var finalBoxH = Math.round(fitH + matPad);
    frameBox.style.width = finalBoxW + 'px';
    frameBox.style.height = finalBoxH + 'px';

    var fitTelemetry = document.getElementById('insp-fit-telemetry');
    if (fitTelemetry) {
      fitTelemetry.textContent =
        (isPortrait ? 'PORTRAIT FRAME // 竖向画框最大化适配 (' : 'LANDSCAPE FRAME // 横向画框最大化适配 (') +
        finalBoxW + '×' + finalBoxH + 'px · 右侧信息栏 ' + Math.round((1 - stageShare) * 100) + '% 宽度)';
    }
  }

  function selectPhotoInInspector(idx) {
    var target = PHOTO_DB[idx] || PHOTO_DB[0];
    currentPhotoIdx = target.idx;
    var isPortrait = target.ar < 1.0;

    var elCoord = document.getElementById('insp-frame-coord');
    var elGroup = document.getElementById('insp-group-badge');
    var elTitle = document.getElementById('insp-title');
    var elStory = document.getElementById('insp-story');
    var elImg = document.getElementById('insp-main-img');
    var elLink = document.getElementById('insp-lightbox-link');
    var elRatio = document.getElementById('insp-ratio-pill');
    var elFile = document.getElementById('insp-file-code');
    var elDate = document.getElementById('insp-date');
    var elLoc = document.getElementById('insp-location');
    var elAspect = document.getElementById('insp-aspect');
    var elCam = document.getElementById('insp-camera');
    var elLens = document.getElementById('insp-lens');
    var elExp = document.getElementById('insp-exposure');
    var elCol = document.getElementById('insp-color');
    var elGps = document.getElementById('insp-gps');
    var elEv = document.getElementById('insp-ev-text');
    var elHist = document.getElementById('insp-histogram-bars');
    var elOrientChip = document.getElementById('insp-orient-chip');
    var elOrientBadge = document.getElementById('insp-orient-mode-badge');
    var elPanelScaleTag = document.getElementById('insp-panel-scale-tag');
    var elArNum = document.getElementById('insp-ar-num');

    if (elCoord) elCoord.textContent = target.coord;
    if (elGroup) elGroup.textContent = target.groupBadge;
    if (elTitle) elTitle.textContent = target.title;
    if (elStory) elStory.textContent = target.story;

    if (elOrientChip) {
      elOrientChip.textContent = isPortrait ? '竖向画框 · 3:4 适配' : (target.ar > 1.5 ? '横向画框 · 16:9 适配' : '横向画框 · 4:3 适配');
    }
    if (elOrientBadge) {
      elOrientBadge.textContent = isPortrait ? 'PORTRAIT // 竖向画框 (信息栏伸展 56%)' : 'LANDSCAPE // 横向画框 (舞台伸展 67%)';
    }
    if (elPanelScaleTag) {
      elPanelScaleTag.textContent = isPortrait
        ? 'INFO PANEL // 竖向模式 · 信息栏已自动伸展拓宽 (56% WIDTH)'
        : 'INFO PANEL // 横向模式 · 信息栏紧凑伴读 (33% WIDTH)';
    }
    if (elArNum) {
      elArNum.textContent = 'AR = ' + target.ar.toFixed(2) + ' : 1';
    }

    if (elImg) {
      elImg.classList.add('is-switching');
      setTimeout(function () {
        elImg.src = target.src;
        elImg.alt = target.title;
        requestAnimationFrame(function () {
          elImg.classList.remove('is-switching');
        });
      }, 90);
    }
    if (elLink) {
      elLink.href = target.src;
      elLink.dataset.caption = target.date + ' · ' + target.title + '（' + target.aspect + '）';
    }
    if (elRatio) elRatio.textContent = target.ratioPill;
    if (elFile) elFile.textContent = target.fileCode;
    function setExifOrCipher(el, fieldKey, val, seedIdx) {
      if (!el) return;
      var s = String(val == null ? '' : val).trim();
      if (s && s !== 'undefined' && s !== 'null') {
        el.className = 'exif-val-normal';
        el.textContent = s;
        return;
      }
      var glyphs = '█▓▒░▀▄▌▐┼╬╫╪※∷∆∇0123456789ABCDEF';
      var h = (seedIdx + 1) * 2654435761;
      for (var c = 0; c < fieldKey.length; c++) h = ((h ^ fieldKey.charCodeAt(c)) * 16777619) >>> 0;
      var hex = (h & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
      var g2 = glyphs[h % glyphs.length] + glyphs[(h >> 3) % glyphs.length];
      var g3 = g2 + glyphs[(h >> 6) % glyphs.length];
      var map = {
        date: ['二〇' + g2 + '年' + glyphs[(h >> 2) % glyphs.length] + '月' + g2 + '日', 'TIME::0x' + hex],
        location: ['SECTOR // ' + g3 + ' · 坐标未收录', 'LOC::NULL_' + hex.slice(0, 2)],
        aspect: [g2 + ':' + glyphs[(h >> 4) % glyphs.length] + ' // 画幅未知', 'FRAME::0x' + hex],
        camera: ['▒▒ OPTIC-' + g3 + ' // 0x' + hex, 'BODY::UNREAD'],
        lens: [g2 + 'mm F/█.█ · 焦段未知', 'LENS::ΔΦ_' + hex.slice(0, 2)],
        exposure: ['f/█.█ · 1/' + g3 + 's · ISO ░░░', 'EXP::SIGNAL_LOST'],
        color: ['SPECTRUM // 0x' + hex + ' · 未知色域', 'LUT::REDACTED'],
        gps: ['██°' + g2 + '\'██"N · ███°' + g2 + '\'██"E', 'GPS::ENCRYPTED'],
        ev: ['EV ±█.█ · FLUX_' + hex, 'LUM::BLURRED']
      };
      var pair = map[fieldKey] || ['▒▒░ ' + hex + ' // UNREAD', 'CIPHER::0x' + hex];
      el.className = 'exif-val-cipher';
      el.title = '摄影参数未读取且未手动填写 · 已启用模糊化乱码艺术处理';
      el.innerHTML = '<span class="exif-cipher-blur" aria-hidden="true">' + pair[0] + '</span><span class="exif-cipher-mask">' + pair[1] + '</span>';
    }
    setExifOrCipher(elDate, 'date', target.date, target.idx);
    setExifOrCipher(elLoc, 'location', target.location, target.idx);
    setExifOrCipher(elAspect, 'aspect', target.aspect, target.idx);
    setExifOrCipher(elCam, 'camera', target.camera, target.idx);
    setExifOrCipher(elLens, 'lens', target.lens, target.idx);
    setExifOrCipher(elExp, 'exposure', target.exposure, target.idx);
    setExifOrCipher(elCol, 'color', target.color, target.idx);
    setExifOrCipher(elGps, 'gps', target.gps, target.idx);
    setExifOrCipher(elEv, 'ev', target.ev, target.idx);

    if (elHist && target.hist) {
      var spans = elHist.querySelectorAll('span');
      spans.forEach(function (sp, i) {
        if (target.hist[i] !== undefined) {
          sp.style.height = target.hist[i] + '%';
        }
      });
    }

    document.querySelectorAll('.photo-detail-card').forEach(function (card) {
      if (parseInt(card.dataset.photoCard, 10) === currentPhotoIdx) {
        card.dataset.active = 'true';
      } else {
        delete card.dataset.active;
      }
    });

    document.querySelectorAll('[data-insp-select]').forEach(function (btn) {
      if (parseInt(btn.dataset.inspSelect, 10) === currentPhotoIdx) {
        btn.dataset.active = 'true';
      } else {
        delete btn.dataset.active;
      }
    });

    updateInspectorFrameGeometry();
  }

  var inspPrevBtn = document.getElementById('insp-prev-btn');
  var inspNextBtn = document.getElementById('insp-next-btn');
  var inspToggleOrientBtn = document.getElementById('insp-toggle-orient-btn');
  var inspZoomBtn = document.getElementById('insp-zoom-btn');
  var photosScrollArchiveBtn = document.getElementById('photos-scroll-archive-btn');

  if (inspPrevBtn) {
    inspPrevBtn.addEventListener('click', function () {
      var pos = PHOTO_VISUAL_ORDER.indexOf(currentPhotoIdx);
      if (pos === -1) pos = 0;
      var nextPos = (pos - 1 + PHOTO_VISUAL_ORDER.length) % PHOTO_VISUAL_ORDER.length;
      selectPhotoInInspector(PHOTO_VISUAL_ORDER[nextPos]);
    });
  }
  if (inspNextBtn) {
    inspNextBtn.addEventListener('click', function () {
      var pos = PHOTO_VISUAL_ORDER.indexOf(currentPhotoIdx);
      if (pos === -1) pos = 0;
      var nextPos = (pos + 1) % PHOTO_VISUAL_ORDER.length;
      selectPhotoInInspector(PHOTO_VISUAL_ORDER[nextPos]);
    });
  }
  if (inspToggleOrientBtn) {
    inspToggleOrientBtn.addEventListener('click', function () {
      var curr = PHOTO_DB[currentPhotoIdx] || PHOTO_DB[0];
      // 若当前为横向则切换到 #02 竖向照片 (idx=2)，若当前为竖向则切换到 #01 横向照片 (idx=0)
      var nextTargetIdx = curr.ar < 1.0 ? 0 : 2;
      selectPhotoInInspector(nextTargetIdx);
      showToast(nextTargetIdx === 2
        ? '已切换至「竖向画框 (3:4)」：画框平滑收窄拔高，右侧信息栏同步伸展拓宽'
        : '已切换至「横向画框 (16:9)」：画框平滑横向舒展，右侧信息栏同步紧凑收拢');
    });
  }
  if (inspZoomBtn) {
    inspZoomBtn.addEventListener('click', function () {
      var link = document.getElementById('insp-lightbox-link');
      if (link) link.click();
    });
  }
  if (photosScrollArchiveBtn) {
    photosScrollArchiveBtn.addEventListener('click', function () {
      var sec = document.getElementById('photos-archive-section');
      if (sec) sec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  document.querySelectorAll('[data-insp-select]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetIdx = parseInt(btn.dataset.inspSelect, 10) || 0;
      selectPhotoInInspector(targetIdx);
    });
  });

  // 照片信息页筛选按钮交互
  document.querySelectorAll('[data-photo-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var filter = btn.dataset.photoFilter || 'all';
      document.querySelectorAll('[data-photo-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll('.photo-detail-card').forEach(function (card) {
        var match =
          filter === 'all' ||
          card.dataset.group === filter ||
          card.dataset.ratio === filter;
        card.hidden = !match;
      });
    });
  });

  // 文章详细页标签筛选交互
  document.querySelectorAll('[data-art-tag]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tag = btn.dataset.artTag || 'all';
      document.querySelectorAll('[data-art-tag]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll('.archive-entry-pill').forEach(function (pill) {
        var tags = (pill.dataset.tags || '').split(',');
        var match = tag === 'all' || tags.indexOf(tag) !== -1;
        pill.hidden = !match;
      });
    });
  });

  function renderArticleByKey(articleKey) {
    if (!articleKey || !ARTICLE_DB[articleKey]) return;
    var item = ARTICLE_DB[articleKey];
    var topTitle = document.getElementById('detail-topbar-title');
    var mainTitle = document.getElementById('detail-main-title');
    var leadSummary = document.getElementById('detail-lead-summary');
    var metaDate = document.getElementById('detail-meta-date');
    var metaTags = document.getElementById('detail-meta-tags');
    var metaWords = document.getElementById('detail-meta-words');
    var metaReading = document.getElementById('detail-meta-reading');
    var kickerBadge = document.getElementById('detail-kicker-badge');
    var tocList = document.getElementById('article-toc-list');
    var specList = document.getElementById('rail-spec-list');

    if (topTitle) topTitle.textContent = item.slug + ' · ' + item.title;
    if (mainTitle) mainTitle.textContent = item.title;
    if (leadSummary) leadSummary.textContent = item.lead;
    if (metaDate) metaDate.textContent = item.date;
    if (metaTags) metaTags.textContent = item.tags;
    if (metaWords && item.words) metaWords.textContent = item.words;
    if (metaReading && item.reading) metaReading.textContent = item.reading;
    if (kickerBadge && item.entryNo) {
      kickerBadge.textContent = 'ARCHIVE COORDINATE // ENTRY #' + item.entryNo;
    }
    if (proseBodyEl && item.prose) {
      proseBodyEl.innerHTML = item.prose;
    }
    if (tocList && item.toc) {
      tocList.innerHTML = item.toc
        .map(function (t, i) {
          return (
            '<li><a href="#' +
            t.id +
            '"' +
            (i === 0 ? ' data-active="true"' : '') +
            '><span class="toc-num">' +
            t.num +
            '</span><span>' +
            t.text +
            '</span></a></li>'
          );
        })
        .join('');
    }
    if (specList && item.specs) {
      specList.innerHTML = item.specs
        .map(function (kv) {
          return '<li><span>' + kv[0] + '</span><strong>' + kv[1] + '</strong></li>';
        })
        .join('');
    }
    document.querySelectorAll('.archive-entry-pill').forEach(function (pill) {
      if (pill.dataset.switchArticle === articleKey) {
        pill.setAttribute('aria-current', 'true');
      } else {
        pill.removeAttribute('aria-current');
      }
    });
  }

  function syncTopNavHighlight(activeView) {
    // 当处于 'posts'（文章子页面）或 'article'（文章详细页）时，顶栏「01 文章」均保持高亮
    var navTarget = activeView === 'article' ? 'posts' : activeView;
    navLinks.forEach(function (link) {
      var navView = link.dataset.navView;
      if (navView) {
        if (navView === navTarget) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    });
  }

  function setViewMode(nextView, param) {
    if (nextView === 'home' && !homeView) {
      window.location.href = '/';
      return;
    }
    if (nextView === 'posts' && !postsView) {
      window.location.href = '/posts/';
      return;
    }
    if (nextView === 'article' && !articleView) {
      var articleDest =
        (ARTICLE_DB[param] && ARTICLE_DB[param].path) || '/posts/';
      window.location.href = articleDest;
      return;
    }
    if (nextView === 'photos' && !photosView) {
      window.location.href = '/photos/#frame-' + (param === undefined ? 0 : param);
      return;
    }
    if (nextView === 'programs' || nextView === 'links') {
      var secId = nextView === 'programs' ? 'screen-programs' : 'screen-links';
      state.view = 'home';
      if (homeView) homeView.hidden = false;
      if (postsView) postsView.hidden = true;
      if (articleView) articleView.hidden = true;
      if (photosView) photosView.hidden = true;
      if (screenRuler) screenRuler.style.display = '';
      syncTopNavHighlight('home');
      viewSwitchBtns.forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.dataset.switchView === 'home' ? 'true' : 'false');
      });
      setTimeout(function () {
        resizeCanvas();
        fitHomePhotoWallBounds();
        var targetSec = document.getElementById(secId);
        if (targetSec) targetSec.scrollIntoView({ behavior: 'smooth' });
      }, 30);
      return;
    }

    state.view = nextView;

    if (nextView === 'article' && param) {
      renderArticleByKey(param);
    }

    var fabViewLabel = document.getElementById('fab-view-label');
    if (fabViewLabel) {
      fabViewLabel.textContent =
        nextView === 'home' ? 'VIEW // 切换文章子页' : 'VIEW // 返回主页';
    }

    if (homeView) homeView.hidden = nextView !== 'home';
    if (postsView) postsView.hidden = nextView !== 'posts';
    if (articleView) articleView.hidden = nextView !== 'article';
    if (photosView) photosView.hidden = nextView !== 'photos';
    if (screenRuler) screenRuler.style.display = nextView === 'home' ? '' : 'none';

    syncTopNavHighlight(nextView);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(function () {
      resizeCanvas();
      if (nextView === 'home') fitHomePhotoWallBounds();
      if (nextView === 'photos') {
        if (param !== undefined && param !== null) {
          selectPhotoInInspector(parseInt(param, 10) || 0);
        } else {
          updateInspectorFrameGeometry();
        }
      }
    }, 35);

    viewSwitchBtns.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.switchView === nextView ? 'true' : 'false');
    });
  }

  viewSwitchBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setViewMode(btn.dataset.switchView);
    });
  });

  // 需求 1：点击顶部导航栏「01 文章」进入文章子页面（#posts-view 时间轴归档），而非直接进入详细文章
  document.querySelectorAll('[data-nav-view]').forEach(function (navEl) {
    navEl.addEventListener('click', function (e) {
      var targetView = navEl.dataset.navView;
      if (!targetView) return;
      if (
        (targetView === 'home' && homeView) ||
        (targetView === 'posts' && postsView) ||
        (targetView === 'article' && articleView) ||
        (targetView === 'photos' && photosView) ||
        targetView === 'programs' ||
        targetView === 'links'
      ) {
        var href = navEl.getAttribute('href') || '';
        if (href.indexOf('#') === 0) {
          e.preventDefault();
          setViewMode(targetView);
        }
      }
    });
  });

  var postsBackHomeBtn = document.getElementById('posts-back-home');
  if (postsBackHomeBtn) {
    postsBackHomeBtn.addEventListener('click', function () {
      setViewMode('home');
    });
  }

  var backPostsBtn = document.getElementById('article-back-posts');
  if (backPostsBtn) {
    backPostsBtn.addEventListener('click', function () {
      if (postsView) {
        setViewMode('posts');
        showToast('已返回文章归档子页（时间轴视图）');
      } else {
        window.location.href = '/posts/';
      }
    });
  }

  var backHomeBtn = document.getElementById('article-back-home');
  if (backHomeBtn) {
    backHomeBtn.addEventListener('click', function () {
      setViewMode('home');
    });
  }

  var photosBackHomeBtn = document.getElementById('photos-back-home');
  if (photosBackHomeBtn) {
    photosBackHomeBtn.addEventListener('click', function () {
      setViewMode('home');
    });
  }

  /* ========================================================================
     需求 1：文章子页面（#posts-view）时间轴折叠、标签筛选、关键词检索与随机漫游交互
     ======================================================================== */
  var chronicleTl = document.getElementById('posts-chronicle-tl');
  var tlTagBtns = Array.from(document.querySelectorAll('[data-tl-tag]'));
  var tlSearchInput = document.getElementById('tl-search-input');
  var tlExpandAllBtn = document.getElementById('tl-expand-all-btn');
  var tlCollapseMonthsBtn = document.getElementById('tl-collapse-months-btn');
  var tlEmptyState = document.getElementById('tl-empty-state');
  var tlResetFilterBtn = document.getElementById('tl-reset-filter-btn');
  var tlActiveCountEl = document.getElementById('tl-active-count');
  var tlActiveTagLabel = document.getElementById('tl-active-tag-label');
  var currentTlTag = 'all';

  function setTlSectionOpen(sectionEl, open) {
    if (!sectionEl) return;
    var head = sectionEl.querySelector(':scope > .tl-year-head, :scope > .tl-month-head');
    var panel = head ? head.nextElementSibling : null;
    if (!head || !panel) return;
    head.setAttribute('aria-expanded', String(open));
    if (open) panel.setAttribute('data-open', '');
    else panel.removeAttribute('data-open');
  }

  if (chronicleTl) {
    chronicleTl.addEventListener('click', function (e) {
      var head = e.target.closest('.tl-year-head, .tl-month-head');
      if (!head) return;
      var panel = head.nextElementSibling;
      if (!panel) return;
      var isOpen = head.getAttribute('aria-expanded') !== 'false';
      head.setAttribute('aria-expanded', String(!isOpen));
      if (isOpen) panel.removeAttribute('data-open');
      else panel.setAttribute('data-open', '');
    });
  }

  function applyTimelineFilter() {
    if (!chronicleTl) return;
    var entries = Array.from(chronicleTl.querySelectorAll('[data-tl-entry]'));
    var months = Array.from(chronicleTl.querySelectorAll('[data-month-section]'));
    var years = Array.from(chronicleTl.querySelectorAll('[data-year-section]'));
    var query = tlSearchInput ? tlSearchInput.value.trim().toLowerCase() : '';
    var shownCount = 0;

    entries.forEach(function (entry) {
      var tags = (entry.dataset.tags || '').split(',');
      var tagMatch = currentTlTag === 'all' || tags.indexOf(currentTlTag) !== -1;
      var searchCorpus = (entry.dataset.search || entry.textContent || '').toLowerCase();
      var queryMatch = !query || searchCorpus.indexOf(query) !== -1;
      var visible = tagMatch && queryMatch;
      entry.hidden = !visible;
      if (visible) shownCount++;
    });

    months.forEach(function (mSec) {
      var visibleInMonth = mSec.querySelectorAll('[data-tl-entry]:not([hidden])').length;
      mSec.hidden = visibleInMonth === 0;
      var countEl = mSec.querySelector('[data-month-count]');
      if (countEl) countEl.textContent = visibleInMonth + ' 篇';
      if (visibleInMonth > 0 && (currentTlTag !== 'all' || query)) {
        setTlSectionOpen(mSec, true);
      }
    });

    years.forEach(function (ySec) {
      var visibleInYear = ySec.querySelectorAll('[data-tl-entry]:not([hidden])').length;
      ySec.hidden = visibleInYear === 0;
      var countEl = ySec.querySelector('[data-year-count]');
      if (countEl) countEl.textContent = visibleInYear + ' 篇';
      if (visibleInYear > 0 && (currentTlTag !== 'all' || query)) {
        setTlSectionOpen(ySec, true);
      }
    });

    if (tlEmptyState) tlEmptyState.hidden = shownCount > 0;
    if (tlActiveCountEl) tlActiveCountEl.textContent = shownCount + ' / ' + entries.length + ' 篇可见';
    if (tlActiveTagLabel) {
      tlActiveTagLabel.textContent =
        '当前筛选：' + (currentTlTag === 'all' ? '全部标签 (ALL)' : '#' + currentTlTag) + (query ? ' · 关键词 "' + query + '"' : '');
    }
  }

  tlTagBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentTlTag = btn.dataset.tlTag || 'all';
      tlTagBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      applyTimelineFilter();
    });
  });

  if (tlSearchInput) {
    tlSearchInput.addEventListener('input', applyTimelineFilter);
  }

  if (tlResetFilterBtn) {
    tlResetFilterBtn.addEventListener('click', function () {
      currentTlTag = 'all';
      if (tlSearchInput) tlSearchInput.value = '';
      tlTagBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.tlTag === 'all' ? 'true' : 'false');
      });
      applyTimelineFilter();
    });
  }

  if (tlExpandAllBtn && chronicleTl) {
    tlExpandAllBtn.addEventListener('click', function () {
      chronicleTl.querySelectorAll('[data-year-section], [data-month-section]').forEach(function (sec) {
        setTlSectionOpen(sec, true);
      });
      showToast('已展开全部年份与月份时间轴节点');
    });
  }

  if (tlCollapseMonthsBtn && chronicleTl) {
    tlCollapseMonthsBtn.addEventListener('click', function () {
      chronicleTl.querySelectorAll('[data-year-section]').forEach(function (sec) {
        setTlSectionOpen(sec, true);
      });
      chronicleTl.querySelectorAll('[data-month-section]').forEach(function (sec) {
        setTlSectionOpen(sec, false);
      });
      showToast('已折叠月份详情，保留年份与月份概览');
    });
  }

  document.querySelectorAll('[data-tl-scroll]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.dataset.tlScroll;
      var targetEl = document.getElementById(targetId);
      if (targetEl) {
        var parentYear = targetEl.closest('[data-year-section]');
        if (parentYear) setTlSectionOpen(parentYear, true);
        setTlSectionOpen(targetEl, true);
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  var tlRandomReadBtn = document.getElementById('tl-random-read-btn');
  if (tlRandomReadBtn) {
    tlRandomReadBtn.addEventListener('click', function () {
      var keys = Object.keys(ARTICLE_DB);
      var rk = keys[Math.floor(Math.random() * keys.length)];
      setViewMode('article', rk);
      showToast('随机漫游至文章《' + ARTICLE_DB[rk].title + '》');
    });
  }

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
      setViewMode(state.view === 'home' ? 'posts' : 'home');
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
      showToast(next === 'dark' ? '已切换至夜间模式：卡冈图雅黑洞流形已启动' : '已切换至白天模式：立体无限流形已启动');
    });
  }

  document.querySelectorAll('[data-theme-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.dataset.themeMode;
      applyTheme(next, true);
      showToast(next === 'dark' ? '已切换至夜间模式：卡冈图雅黑洞' : '已切换至白天模式：立体无限流形');
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

  var currentSpotId = 'latest';

  /* 服务端已经渲染了焦点文章；这里从 DOM 读取快照，避免写死 mc-server。 */
  function readSpotlightSnapshot() {
    var titleEl = document.getElementById('spot-title-link');
    var coverEl = document.getElementById('spot-cover-img');
    var leadEl = document.getElementById('spot-lead-text');
    var dateEl = document.getElementById('spot-date');
    var tagsEl = document.getElementById('spot-tags');
    var coordEl = document.getElementById('spot-coord-badge');
    var href = titleEl ? titleEl.getAttribute('href') || '' : '';
    var idMatch = /\/posts\/([^/]+)\//.exec(href);
    return {
      id: idMatch ? idMatch[1] : 'latest',
      url: href || '/posts/',
      title: titleEl ? titleEl.textContent.trim() : '',
      date: dateEl ? dateEl.textContent : '',
      tags: tagsEl ? tagsEl.textContent : '',
      coord: coordEl ? coordEl.textContent : '',
      cover: coverEl ? coverEl.getAttribute('src') || '' : '',
      excerpt: leadEl ? leadEl.textContent.trim() : ''
    };
  }

  var defaultSpot = readSpotlightSnapshot();

  function applyPostSpotlight(data, activeLink) {
    var spotTitle = document.getElementById('spot-title-link');
    var spotDate = document.getElementById('spot-date');
    var spotTags = document.getElementById('spot-tags');
    var spotCoord = document.getElementById('spot-coord-badge');
    var spotLead = document.getElementById('spot-lead-text');
    var spotReadBtn = document.getElementById('spot-read-btn');
    var spotCoverImg = document.getElementById('spot-cover-img');
    var spotCoverLink = document.getElementById('spot-cover-link');
    var spotPath =
      data.url ||
      (activeLink && activeLink.getAttribute('href')) ||
      (ARTICLE_DB[data.id] && ARTICLE_DB[data.id].path) ||
      '/posts/';
    currentSpotId = data.id || 'latest';
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
      // 仅收集当前可见的照片链接
      lbItems = Array.from(document.querySelectorAll('a[data-lightbox]')).filter(function (el) {
        var fig = el.closest('.wf-item, .photo-detail-card');
        if (fig && (fig.style.display === 'none' || fig.hidden)) return false;
        return true;
      });
      if (!lbItems.length) lbItems = [lbLink];
      ensureLightbox();
      document.body.classList.add('lightbox-open');
      var idx = lbItems.indexOf(lbLink);
      showLightboxAt(idx >= 0 ? idx : 0);
      return;
    }

    var openPhotosTrigger = e.target.closest('[data-open-photos]');
    if (openPhotosTrigger && photosView) {
      e.preventDefault();
      var pIdx = parseInt(openPhotosTrigger.dataset.openPhotos, 10) || 0;
      setViewMode('photos', pIdx);
      showToast('已进入照片信息详细页（可检视光学参数与完整影集）');
      return;
    }

    var photoDetailCard = e.target.closest('[data-photo-card]');
    if (photoDetailCard && !e.target.closest('a[data-lightbox]')) {
      var cardIdx = parseInt(photoDetailCard.dataset.photoCard, 10) || 0;
      selectPhotoInInspector(cardIdx);
      var showcaseScreen = document.getElementById('photos-showcase-screen');
      if (showcaseScreen) showcaseScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var openArtTrigger = e.target.closest('[data-open-article]');
    if (openArtTrigger) {
      e.preventDefault();
      var artKey = openArtTrigger.dataset.openArticle || currentSpotId || 'mc';
      setViewMode('article', artKey);
      showToast('已进入文章详细页（右侧运行高立体感《三体》引力轨迹模型）');
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
        id: postLink.dataset.postId || 'latest',
        url: postLink.getAttribute('href') || '',
        title: postLink.dataset.postTitle,
        date: postLink.dataset.postDate || '',
        tags: postLink.dataset.postTags || 'ARCHIVE',
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

  /* 五屏刻度尺与导航高亮同步（需求 1：滚动主页时顶栏保持高亮「主页」，右侧刻度尺同步当前分屏） */
  var screens = Array.from(document.querySelectorAll('.screen'));
  var rulerTicks = Array.from(document.querySelectorAll('.ruler-tick'));

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
    } else if (state.view === 'article') {
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
     核心三维渲染引擎：
     1. 主页白天模型 (drawInfinity3DModel) —— 需求 2 & 3：
        恢复模型主体中的三维流形丝带线条与结构环线，保持去除与粒子粘连的细小尾迹/连线，且两侧环更偏圆润
     2. 主页夜间模型 (drawGargantuaParticleModel) —— 需求 2：
        恢复黑洞主体中的连续吸积流线与光子环线条，同时保持粒子无粘连短线
     3. 文章详细页右侧模型 (drawArticleThreeBodyCanvas) —— 需求 7：
        推倒重做！去除其它杂乱元素，仅保留三个高立体感球体在相互引力作用下的三维空间运动与景深轨迹
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
      showToast('已对三个立体天体施加引力微扰（三维轨道已重构）');
    });
  }

  var perturbBtn = document.getElementById('detail-perturb-threebody');
  if (perturbBtn) {
    perturbBtn.addEventListener('click', function () {
      perturbThreeBodySystem();
      showToast('已对三个立体天体施加引力微扰');
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
    fitHomePhotoWallBounds();
    if (state.view === 'photos') updateInspectorFrameGeometry();
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

  function evalInfinityPoint3D(t, streamOffset, radSpread, a, b, c, time) {
    var sinT = Math.sin(t);
    var cosT = Math.cos(t);
    var denom = 1 + sinT * sinT;

    var bx = (a * cosT) / denom;
    var by = (b * sinT * cosT) / denom;
    var bz = c * sinT;

    var ribbonWave = t * 2.0 + streamOffset + time * 0.55;
    var ox = Math.cos(ribbonWave) * radSpread;
    var oy = Math.sin(ribbonWave) * radSpread * 0.88;
    var oz = Math.sin(t * 3.0 + streamOffset) * radSpread * 1.12;

    return { x: bx + ox, y: by + oy, z: bz + oz };
  }

  /* ----------------------------------------------------------------------
     需求 2（白天模型）：立体无限环主体线条恢复
     保留主体 3D 骨架流线与焦点几何，去除粒子间连线与粘连细碎线段
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

    // 1. 左右双叶焦点几何靶标与椭圆轨道参考准星
    var focusX = a * 0.62;
    [-focusX, focusX].forEach(function (fx3) {
      var fp = project3D(fx3, 0, 0, rotX, rotY, rotZ, cx, cy, fov);
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 87, 0.32)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.arc(fp.sx, fp.sy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fp.sx - 4.5, fp.sy);
      ctx.lineTo(fp.sx + 4.5, fp.sy);
      ctx.moveTo(fp.sx, fp.sy - 4.5);
      ctx.lineTo(fp.sx, fp.sy + 4.5);
      ctx.stroke();
      ctx.restore();
    });

    // 2. 无限流形主体骨架流线（主体三维形态线，不连粒子）
    var numRibbons = 5;
    var ribbonSteps = 100;
    ctx.save();
    for (var rIdx = 0; rIdx < numRibbons; rIdx++) {
      var sOff = (rIdx / numRibbons) * Math.PI * 2;
      var rSpread = (rIdx === 0) ? 0 : tubeRadius * (0.32 + (rIdx % 2) * 0.24);
      var isCore = (rIdx === 0);
      ctx.beginPath();
      for (var s = 0; s <= ribbonSteps; s++) {
        var tVal = (s / ribbonSteps) * Math.PI * 2;
        var p3 = evalInfinityPoint3D(tVal, sOff, rSpread, a, b, c, state.time);
        var pr = project3D(p3.x, p3.y, p3.z, rotX, rotY, rotZ, cx, cy, fov);
        var mw = computeMouseWaveOffset(pr.sx, pr.sy);
        var sx = pr.sx + mw.ox * 0.5;
        var sy = pr.sy + mw.oy * 0.5;
        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.strokeStyle = isCore
        ? 'rgba(217, 119, 87, 0.40)'
        : 'rgba(232, 146, 110, ' + (0.12 + (rIdx % 2) * 0.06).toFixed(3) + ')';
      ctx.lineWidth = isCore ? 1.35 : 0.8;
      ctx.stroke();
    }
    ctx.restore();

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
     需求 2（夜间模型）：卡冈图雅黑洞流形线与纯粒子模型
     恢复主体中的连续吸积盘流线与引力透镜拱桥线条，粒子本体保持无粘连短线
     ---------------------------------------------------------------------- */
  function drawGargantuaParticleModel(ctx, cx, cy, W, H, dt) {
    var minDim = Math.min(W, H);
    var Rs = minDim * 0.136;
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

    // 2. 绘制黑球后方的上下引力透镜连续流线（Restored Back Lensing Streamlines）
    ctx.save();
    var diskRingNorms = [0.06, 0.18, 0.34, 0.52, 0.72, 0.90];
    for (var bArch = 0; bArch < 2; bArch++) {
      for (var rnIdx = 0; rnIdx < diskRingNorms.length; rnIdx++) {
        var rn = diskRingNorms[rnIdx];
        var rVal = rInner + rn * (rOuter - rInner);
        ctx.beginPath();
        for (var st = 0; st <= 64; st++) {
          // 后半盘 phi ∈ [π, 2π] (sinP <= 0)
          var phi = Math.PI + (st / 64) * Math.PI;
          var cosP = Math.cos(phi), sinP = Math.sin(phi);
          var s = -sinP;
          var sCurve = Math.pow(s, 0.84);
          var lx = rVal * cosP;
          var flatY = rVal * sinP * Math.cos(tiltRad);
          var ly;
          if (bArch === 0) {
            var topArchH = Rs * (1.08 + 0.78 * Math.pow(rn, 0.88)) + rVal * 0.14 * (1 - rn);
            ly = flatY * (1 - s * 0.72) - sCurve * topArchH;
          } else {
            var botArchH = Rs * (1.04 + 0.66 * Math.pow(rn, 0.90)) + rVal * 0.12 * (1 - rn);
            ly = flatY * (1 - s * 0.72) + sCurve * botArchH;
          }
          var sp = toScreen(lx, ly);
          if (st === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        }
        var archAlpha = (1 - rn * 0.65) * (bArch === 0 ? 0.28 : 0.20);
        ctx.strokeStyle = 'rgba(242, 179, 126, ' + archAlpha.toFixed(3) + ')';
        ctx.lineWidth = bArch === 0 ? 1.15 : 0.85;
        ctx.stroke();
      }
    }
    ctx.restore();

    // 3. 计算全部黑洞纯粒子的连续三维投影位置
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
        var rHalo = Rs * (1.035 + 0.52 * Math.pow(pt.rNorm, 1.45));
        lx = rHalo * cosP * (1.12 + 0.22 * pt.rNorm);
        ly = rHalo * sinP * (1.02 + 0.10 * pt.rNorm) + pt.cz * 2.0;
        isFrontDisk = false;
      } else {
        var r = rInner + pt.rNorm * (rOuter - rInner) + pt.bhJitter * Rs * 0.04;
        lx = r * cosP;
        var flatY = r * sinP * Math.cos(tiltRad) + pt.cz * 2.5;

        if (sinP >= 0) {
          isFrontDisk = true;
          var frontDip = Math.sin(pt.phi) * Math.exp(-(lx * lx) / (2 * (Rs * 1.25) * (Rs * 1.25)));
          ly = flatY * 0.82 + frontDip * Rs * 0.06;
        } else {
          isFrontDisk = false;
          var s = -sinP;
          var sCurve = Math.pow(s, 0.84);
          if (pt.branch === 0) {
            var topArchH = Rs * (1.08 + 0.78 * Math.pow(pt.rNorm, 0.88)) + r * 0.14 * (1 - pt.rNorm);
            ly = flatY * (1 - s * 0.72) - sCurve * topArchH;
          } else {
            var botArchH = Rs * (1.04 + 0.66 * Math.pow(pt.rNorm, 0.90)) + r * 0.12 * (1 - pt.rNorm);
            ly = flatY * (1 - s * 0.72) + sCurve * botArchH;
          }

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

    renderPureParticles(backParticles);

    // 4. 中央事件视界黑球本体 + 连续光子环线条
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

    // 紧贴视界边缘的连续光子环亮线
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.03, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 232, 198, 0.52)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    // 5. 横跨黑球正前方的赤道吸积盘连续流线 + 前景纯粒子流
    ctx.save();
    for (var fnIdx = 0; fnIdx < diskRingNorms.length; fnIdx++) {
      var fn = diskRingNorms[fnIdx];
      var rFront = rInner + fn * (rOuter - rInner);
      ctx.beginPath();
      for (var fst = 0; fst <= 64; fst++) {
        var fPhi = (fst / 64) * Math.PI;
        var fCos = Math.cos(fPhi), fSin = Math.sin(fPhi);
        var flx = rFront * fCos;
        var fFlatY = rFront * fSin * Math.cos(tiltRad);
        var fDip = fSin * Math.exp(-(flx * flx) / (2 * (Rs * 1.25) * (Rs * 1.25)));
        var fly = fFlatY * 0.82 + fDip * Rs * 0.06;
        var fsp = toScreen(flx, fly);
        if (fst === 0) ctx.moveTo(fsp.x, fsp.y);
        else ctx.lineTo(fsp.x, fsp.y);
      }
      var fAlpha = (1 - fn * 0.6) * 0.34;
      ctx.strokeStyle = 'rgba(244, 182, 124, ' + fAlpha.toFixed(3) + ')';
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }
    ctx.restore();

    renderPureParticles(frontParticles);
  }

  /* ----------------------------------------------------------------------
     需求 7：文章详细页中的三体运动推倒重做！
     - 彻底移除第四颗行星、移除星尘微粒、移除背景十字准星/圆环/三角形连线等一切杂乱元素
     - 只保留三个高立体感球体在相互引力作用下的三维空间运动与立体轨迹
     - 通过强透视（FOV）、球体三维经纬网格自转、立体明暗球面体积光照、以及按 Z 轴深度逐段排序的透视宽窄轨迹带，营造极强立体纵深感
     ---------------------------------------------------------------------- */
  var threeBodyState = {
    bodies: [],
    era: 'CHAOTIC',
    flux: 1.42
  };

  function initThreeBodySystem() {
    // 三个质量相近的立体天体在三维空间 (X, Y, Z) 中相互引力纠缠绕转（适配宽画幅视口，无边缘裁切）
    threeBodyState.bodies = [
      {
        name: 'ALPHA',
        mass: 1.12,
        x: -82, y: -22, z: 66,
        vx: 64, vy: 48, vz: -88,
        radius: 13.0,
        colorRGB: '242, 179, 126', // 暖金巨星
        litHex: '#fffaf0',
        midHex: '#f2b37e',
        darkHex: '#4a2511',
        spinX: 0.4, spinY: 0.2, spinSpeed: 1.5,
        trail: []
      },
      {
        name: 'BETA',
        mass: 1.06,
        x: 84, y: 24, z: -64,
        vx: -58, vy: -52, vz: 84,
        radius: 12.0,
        colorRGB: '217, 119, 87',  // 赤陶恒星
        litHex: '#fff0e5',
        midHex: '#d97757',
        darkHex: '#3d180c',
        spinX: -0.5, spinY: 0.7, spinSpeed: -1.7,
        trail: []
      },
      {
        name: 'GAMMA',
        mass: 1.00,
        x: -2, y: -2, z: -2,
        vx: -8, vy: 42, vz: 12,
        radius: 11.0,
        colorRGB: '120, 140, 93', // 青松伴星
        litHex: '#f4f9ec',
        midHex: '#8ca470',
        darkHex: '#1f2916',
        spinX: 0.8, spinY: -0.4, spinSpeed: 2.0,
        trail: []
      }
    ];
  }

  initThreeBodySystem();
  for (var warm = 0; warm < 180; warm++) { stepThreeBodyPhysics(0.020); }

  function perturbThreeBodySystem() {
    var bodies = threeBodyState.bodies;
    for (var i = 0; i < bodies.length; i++) {
      bodies[i].vx += (Math.random() - 0.5) * 42;
      bodies[i].vy += (Math.random() - 0.5) * 42;
      bodies[i].vz += (Math.random() - 0.5) * 52;
    }
    var px = 0, py = 0, pz = 0, totalM = 0;
    for (var j = 0; j < bodies.length; j++) {
      px += bodies[j].vx * bodies[j].mass;
      py += bodies[j].vy * bodies[j].mass;
      pz += bodies[j].vz * bodies[j].mass;
      totalM += bodies[j].mass;
    }
    for (var k = 0; k < bodies.length; k++) {
      bodies[k].vx -= px / totalM;
      bodies[k].vy -= py / totalM;
      bodies[k].vz -= pz / totalM;
    }
  }

  function stepThreeBodyPhysics(dt) {
    var bodies = threeBodyState.bodies;
    if (!bodies.length) return;

    var subSteps = 6;
    var h = (dt * state.speed * 1.22) / subSteps;
    var G = 320000;
    var softSq = 30 * 30;

    for (var step = 0; step < subSteps; step++) {
      var ax = [0, 0, 0], ay = [0, 0, 0], az = [0, 0, 0];

      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (i === j) continue;
          var dx = bodies[j].x - bodies[i].x;
          var dy = bodies[j].y - bodies[i].y;
          var dz = bodies[j].z - bodies[i].z;
          var rSq = dx * dx + dy * dy + dz * dz + softSq;
          var invR3 = 1 / (rSq * Math.sqrt(rSq));
          var f = G * bodies[j].mass * invR3;
          ax[i] += dx * f;
          ay[i] += dy * f;
          az[i] += dz * f;
        }
        // 各向同性三维球对称温和边界约束（绝不压扁 Z 轴，保证 Z 轴拥有与 X/Y 同等的立体振幅）
        var distOrigin = Math.hypot(bodies[i].x * 0.75, bodies[i].y * 1.45, bodies[i].z * 0.85);
        var pull = 0.34 + (distOrigin > 68 ? (distOrigin - 68) * 0.024 : 0);
        ax[i] -= bodies[i].x * pull * 0.72;
        ay[i] -= bodies[i].y * pull * 1.55;
        az[i] -= bodies[i].z * pull * 0.82;
      }

      var bx = 0, by = 0, bz = 0, bvx = 0, bvy = 0, bvz = 0, tm = 0;
      for (var m = 0; m < 3; m++) {
        bodies[m].vx += ax[m] * h;
        bodies[m].vy += ay[m] * h;
        bodies[m].vz += az[m] * h;

        var vMag = Math.hypot(bodies[m].vx, bodies[m].vy, bodies[m].vz);
        if (vMag > 138) {
          var sDown = 138 / vMag;
          bodies[m].vx *= sDown;
          bodies[m].vy *= sDown;
          bodies[m].vz *= sDown;
        } else if (vMag < 48) {
          var sUp = 48 / (vMag + 0.1);
          bodies[m].vx *= sUp;
          bodies[m].vy *= sUp;
          bodies[m].vz *= sUp;
        }

        bodies[m].x += bodies[m].vx * h;
        bodies[m].y += bodies[m].vy * h;
        bodies[m].z += bodies[m].vz * h;

        bodies[m].spinX += bodies[m].spinSpeed * h;
        bodies[m].spinY += bodies[m].spinSpeed * 0.7 * h;

        bx += bodies[m].x * bodies[m].mass;
        by += bodies[m].y * bodies[m].mass;
        bz += bodies[m].z * bodies[m].mass;
        bvx += bodies[m].vx * bodies[m].mass;
        bvy += bodies[m].vy * bodies[m].mass;
        bvz += bodies[m].vz * bodies[m].mass;
        tm += bodies[m].mass;
      }

      bx /= tm; by /= tm; bz /= tm;
      bvx /= tm; bvy /= tm; bvz /= tm;
      for (var n = 0; n < 3; n++) {
        bodies[n].x -= bx * 0.25;
        bodies[n].y -= by * 0.25;
        bodies[n].z -= bz * 0.25;
        bodies[n].vx -= bvx * 0.15;
        bodies[n].vy -= bvy * 0.15;
        bodies[n].vz -= bvz * 0.15;
      }
    }

    var minPairDist = 999;
    for (var p1 = 0; p1 < 3; p1++) {
      var bObj = bodies[p1];
      bObj.trail.push({ x: bObj.x, y: bObj.y, z: bObj.z });
      if (bObj.trail.length > 175) bObj.trail.shift();

      for (var p2 = p1 + 1; p2 < 3; p2++) {
        var dPair = Math.hypot(
          bodies[p1].x - bodies[p2].x,
          bodies[p1].y - bodies[p2].y,
          bodies[p1].z - bodies[p2].z
        );
        if (dPair < minPairDist) minPairDist = dPair;
      }
    }

    threeBodyState.flux = 120 / Math.max(18, minPairDist);
    if (threeBodyState.flux > 2.2) {
      threeBodyState.era = 'CLOSE ENCOUNTER // 强引力近距交汇';
    } else {
      threeBodyState.era = '3D MUTUAL GRAVITY // 三体立体引力轨道';
    }
  }

  /* 绘制单个具备强烈三维体积感的球体（球面高光阴影 + 三维旋转经纬环） */
  function drawVolumetricSphere(ctx, sx, sy, r, body, rotX, rotY, rotZ) {
    ctx.save();

    // 1. 柔和外层球体日冕体积光晕
    var haloGrad = ctx.createRadialGradient(sx, sy, r * 0.65, sx, sy, r * 2.45);
    haloGrad.addColorStop(0, 'rgba(' + body.colorRGB + ', 0.42)');
    haloGrad.addColorStop(0.5, 'rgba(' + body.colorRGB + ', 0.12)');
    haloGrad.addColorStop(1, 'rgba(' + body.colorRGB + ', 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.45, 0, Math.PI * 2);
    ctx.fill();

    // 2. 球体本体的三维偏心球面光照渐变（左上受光面 + 核心漫反射 + 右下深邃背光暗部）
    var lightX = sx - r * 0.34;
    var lightY = sy - r * 0.34;
    var sphereGrad = ctx.createRadialGradient(lightX, lightY, r * 0.08, sx, sy, r);
    sphereGrad.addColorStop(0, body.litHex);
    sphereGrad.addColorStop(0.36, body.midHex);
    sphereGrad.addColorStop(0.76, 'rgb(' + body.colorRGB + ')');
    sphereGrad.addColorStop(1, body.darkHex);

    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();

    // 3. 球体表面三维旋转经纬线环（2 条正交大圆环，直观展现球体三维朝向与体积旋转）
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.clip();

    var rings = [
      { rx: body.spinX + rotX, ry: body.spinY + rotY },
      { rx: body.spinX + Math.PI * 0.5 + rotX, ry: body.spinY - 0.6 + rotY }
    ];
    for (var rg = 0; rg < rings.length; rg++) {
      var crx = Math.cos(rings[rg].rx), srx = Math.sin(rings[rg].rx);
      var cry = Math.cos(rings[rg].ry), sry = Math.sin(rings[rg].ry);
      ctx.beginPath();
      for (var seg = 0; seg <= 28; seg++) {
        var theta = (seg / 28) * Math.PI * 2;
        var lx = Math.cos(theta) * r;
        var ly = Math.sin(theta) * r;
        var lz = 0;
        var y1 = ly * crx - lz * srx;
        var z1 = ly * srx + lz * crx;
        var x2 = lx * cry + z1 * sry;
        if (seg === 0) ctx.moveTo(sx + x2, sy + y1);
        else ctx.lineTo(sx + x2, sy + y1);
      }
      ctx.strokeStyle = 'rgba(255, 250, 240, 0.34)';
      ctx.lineWidth = Math.max(0.7, r * 0.08);
      ctx.stroke();
    }
    ctx.restore();

    // 4. 菲涅尔边缘反光（Rim Light）与高光点（Specular Highlight）
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 248, 235, 0.62)';
    ctx.lineWidth = Math.max(0.9, r * 0.09);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sx - r * 0.32, sy - r * 0.32, Math.max(1.2, r * 0.18), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fill();

    ctx.restore();
  }

  function drawArticleThreeBodyCanvas(ctx, W, H, dt) {
    stepThreeBodyPhysics(dt);

    var cx = W * 0.5;
    var cy = H * 0.5;
    var minDim = Math.min(W, H);
    var viewScale = Math.min(W / 245, H / 138);
    // 强透视焦距：让靠近镜头的球体与轨迹显著放大、远离镜头的球体与轨迹明显缩小后退
    var fov = 260;
    var camDist = 310;

    var targetAx = artMouse.active ? artMouse.nx : 0;
    var targetAy = artMouse.active ? artMouse.ny : 0;
    artMouse.snx += (targetAx - artMouse.snx) * 0.08;
    artMouse.sny += (targetAy - artMouse.sny) * 0.08;

    // 摄像机持续缓慢三维环绕旋转，使三条轨道的前后纵深交错感一目了然
    var rotX = 0.34 + 0.16 * Math.sin(state.time * 0.38) + artMouse.sny * 0.38;
    var rotY = state.time * 0.34 + artMouse.snx * 0.55;
    var rotZ = 0.14 * Math.cos(state.time * 0.24);

    function proj3Body(x, y, z) {
      var cz = Math.cos(rotZ), sz = Math.sin(rotZ);
      var x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z;
      var cxr = Math.cos(rotX), sxr = Math.sin(rotX);
      var y2 = y1 * cxr - z1 * sxr, z2 = y1 * sxr + z1 * cxr, x2 = x1;
      var cyr = Math.cos(rotY), syr = Math.sin(rotY);
      var x3 = x2 * cyr + z2 * syr, z3 = -x2 * syr + z2 * cyr, y3 = y2;
      var scale = fov / Math.max(80, fov + z3 + camDist - 260);
      return {
        sx: cx + x3 * scale,
        sy: cy + y3 * scale,
        z: z3,
        scale: scale
      };
    }

    // 收集全部三维轨迹段与三个立体球体，统一按相机 Z 深度由远及近排序（画家算法）
    // 确保前景轨迹与前景球体真实遮挡后景轨迹，消除扁平感！
    var renderQueue = [];
    var bodies = threeBodyState.bodies;

    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var tr = b.trail;
      if (tr.length > 2) {
        var projPts = [];
        for (var t = 0; t < tr.length; t++) {
          projPts.push(proj3Body(tr[t].x * viewScale, tr[t].y * viewScale, tr[t].z * viewScale));
        }
        for (var s = 1; s < projPts.length; s++) {
          var p0 = projPts[s - 1];
          var p1 = projPts[s];
          var ageFrac = s / projPts.length;
          renderQueue.push({
            type: 'segment',
            z: (p0.z + p1.z) * 0.5,
            p0: p0,
            p1: p1,
            age: ageFrac,
            colorRGB: b.colorRGB,
            litHex: b.litHex
          });
        }
      }

      var bPr = proj3Body(b.x * viewScale, b.y * viewScale, b.z * viewScale);
      renderQueue.push({
        type: 'sphere',
        z: bPr.z,
        sx: bPr.sx,
        sy: bPr.sy,
        scale: bPr.scale,
        body: b
      });
    }

    // 按 Z 轴从远（z 大）到近（z 小）严格排序
    renderQueue.sort(function (a, b) {
      return b.z - a.z;
    });

    for (var q = 0; q < renderQueue.length; q++) {
      var item = renderQueue[q];
      if (item.type === 'segment') {
        var avgScale = (item.p0.scale + item.p1.scale) * 0.5;
        // 深度透视调制：越靠近镜头（avgScale 越大）轨迹越宽越亮，越远越细越淡
        var depthFactor = Math.max(0.28, Math.min(1.55, avgScale));
        var alpha = Math.pow(item.age, 1.35) * Math.min(0.92, 0.32 + 0.48 * depthFactor);
        var width = (0.55 + Math.pow(item.age, 1.3) * 4.2) * Math.pow(depthFactor, 1.45);

        ctx.beginPath();
        ctx.moveTo(item.p0.sx, item.p0.sy);
        ctx.lineTo(item.p1.sx, item.p1.sy);
        ctx.strokeStyle = 'rgba(' + item.colorRGB + ', ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 轨迹近端高光芯线，增强三维管状轨迹质感
        if (item.age > 0.55 && depthFactor > 0.85) {
          ctx.beginPath();
          ctx.moveTo(item.p0.sx, item.p0.sy);
          ctx.lineTo(item.p1.sx, item.p1.sy);
          ctx.strokeStyle = 'rgba(255, 250, 240, ' + ((item.age - 0.55) * 0.85).toFixed(3) + ')';
          ctx.lineWidth = width * 0.34;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      } else if (item.type === 'sphere') {
        var rSphere = Math.max(4.2, item.body.radius * item.scale);
        drawVolumetricSphere(ctx, item.sx, item.sy, rSphere, item.body, rotX, rotY, rotZ);
      }
    }

    var eraBadge = document.getElementById('threebody-era-badge');
    var fluxReadout = document.getElementById('threebody-flux-readout');
    if (eraBadge) eraBadge.textContent = threeBodyState.era;
    if (fluxReadout) {
      fluxReadout.textContent = 'GRAVITY Φ=' + threeBodyState.flux.toFixed(2) + ' · 3 SPHERES ONLY';
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
  var hashFrame = /^#frame-(\d+)/.exec(window.location.hash);
  selectPhotoInInspector(hashFrame ? parseInt(hashFrame[1], 10) : 0);
  window.addEventListener('hashchange', function () {
    var m = /^#frame-(\d+)/.exec(window.location.hash);
    if (m && photosView) {
      selectPhotoInInspector(parseInt(m[1], 10));
      var showcase = document.getElementById('photos-showcase-screen');
      if (showcase) showcase.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  setTimeout(fitHomePhotoWallBounds, 60);
  syncTopNavHighlight(state.view);

  resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);
})();
