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

  /* 首屏顶栏/坐标/原点由后台「页面 → 主页」配置；切昼夜时沿用配置，不覆盖成写死文案 */
  var HOME_META = window.__HOME_META || null;
  if (HOME_META) {
    ['originBadge', 'topbarTag', 'coordText', 'equation'].forEach(function (key) {
      if (typeof HOME_META[key] === 'string' && HOME_META[key]) MODE_META.infinity[key] = HOME_META[key];
    });
    if (typeof HOME_META.particleCount === 'number' && HOME_META.particleCount >= 100) {
      state.particleCount = HOME_META.particleCount;
    }
    if (typeof HOME_META.speed === 'number' && HOME_META.speed > 0) {
      state.speed = HOME_META.speed;
    }
  }

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
    if (window.__YeshengLoader) {
      if (typeof window.__YeshengLoader.runInfinityLoader === "function") {
        window.__YeshengLoader.runInfinityLoader({ durationMs: durationMs || 1050, replay: true });
        return;
      }
      if (typeof window.__YeshengLoader.run === "function") {
        window.__YeshengLoader.run(durationMs || 1050);
        return;
      }
    }
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
    if (window.__YeshengTheme && typeof window.__YeshengTheme.playThemeTransition === "function") {
      window.__YeshengTheme.playThemeTransition(targetTheme, onPeakCoverage);
      return;
    }
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
    document.documentElement.dataset.themeSwitching = 'true';
    clearTimeout(themeSwitchTimer);
    transStage.dataset.active = 'true';
    if (transVeil) {
      /* 预先锁定遮罩底色为目标主题纯色，避免切换 --paper 时遮罩自身发生颜色跳变 */
      transVeil.style.backgroundColor = toDark ? THEME_COLOR.dark : THEME_COLOR.light;
      transVeil.style.opacity = '0';
    }
    if (transBadge) {
      transBadge.textContent = toDark
        ? 'SINGULARITY COLLAPSE // 无限流形 ∞ 坍缩至卡冈图雅黑洞'
        : 'MANIFOLD UNFOLD // 黑洞奇点展开至立体无限环 ∞';
      transBadge.style.backgroundColor = toDark ? 'rgba(18, 18, 17, 0.92)' : 'rgba(250, 249, 245, 0.92)';
      transBadge.style.borderColor = toDark ? 'rgba(217, 119, 87, 0.58)' : 'rgba(217, 119, 87, 0.52)';
      transBadge.style.opacity = '0';
    }

    var startTs = performance.now();
    var duration = 760;
    var themeSwapped = false;

    function stepTransition(now) {
      var elapsed = now - startTs;
      var p = Math.min(1, elapsed / duration);
      var ease = 1 - Math.pow(1 - p, 3);

      // 全屏大背景与下方文字框共用完全相同的 veilAlpha 曲线，在 p = 0.40 达到 1.0 峰值
      var veilAlpha = 0;
      if (p < 0.40) {
        veilAlpha = Math.sin((p / 0.40) * (Math.PI / 2));
      } else {
        veilAlpha = Math.cos(((p - 0.40) / 0.60) * (Math.PI / 2));
      }
      veilAlpha = Math.max(0, Math.min(1, veilAlpha));

      if (transVeil) {
        transVeil.style.opacity = veilAlpha.toFixed(3);
      }
      if (transBadge) {
        transBadge.style.opacity = veilAlpha.toFixed(3);
      }

      if (p >= 0.40 && !themeSwapped) {
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

      var coverGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.55);
      if (toDark) {
        coverGrad.addColorStop(0, 'rgba(217, 119, 87, ' + (veilAlpha * 0.16).toFixed(3) + ')');
        coverGrad.addColorStop(1, 'rgba(18, 18, 17, 0)');
      } else {
        coverGrad.addColorStop(0, 'rgba(242, 179, 126, ' + (veilAlpha * 0.18).toFixed(3) + ')');
        coverGrad.addColorStop(1, 'rgba(250, 249, 245, 0)');
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
        var bhPx = diskR * Math.cos(ang * 2.0);
        var bhPy = diskR * Math.sin(ang * 2.0) * 0.28;

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
        if (transBadge) {
          transBadge.style.opacity = '0';
          transBadge.style.backgroundColor = '';
          transBadge.style.borderColor = '';
        }
        if (!themeSwapped && typeof onPeakCoverage === 'function') {
          onPeakCoverage();
        }
        clearTimeout(themeSwitchTimer);
        themeSwitchTimer = window.setTimeout(function () {
          delete document.documentElement.dataset.themeSwitching;
        }, 60);
      }
    }

    transAnimId = requestAnimationFrame(stepTransition);
  }

  var themeSwitchTimer = 0;
  function commitThemeDOM(nextTheme) {
    var mode = nextTheme === 'dark' ? 'gargantua' : 'infinity';
    state.mode = mode;
    document.documentElement.dataset.themeSwitching = 'true';
    document.documentElement.dataset.theme = nextTheme;
    clearTimeout(themeSwitchTimer);
    themeSwitchTimer = window.setTimeout(function () {
      delete document.documentElement.dataset.themeSwitching;
    }, 280);
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

    // 1. 先全部恢复显示并清除内联尺寸以测量真实宽高比
    items.forEach(function (item) {
      item.style.display = '';
      item.style.width = '';
      item.style.flex = '';
      delete item.dataset.boundaryHidden;
      var imgEl = item.querySelector('img');
      if (imgEl) {
        imgEl.style.height = '';
        imgEl.style.width = '';
      }
    });

    var stageStyle = window.getComputedStyle(homePhotosStage);
    var padLeft = parseFloat(stageStyle.paddingLeft) || 0;
    var padRight = parseFloat(stageStyle.paddingRight) || 0;
    var padTop = parseFloat(stageStyle.paddingTop) || 0;
    var padBottom = parseFloat(stageStyle.paddingBottom) || 0;
    var maxStageWidth = homePhotosStage.clientWidth - padLeft - padRight;
    var stageInnerH = homePhotosStage.clientHeight - padTop - padBottom;
    if (maxStageWidth <= 40) return;

    var stripStyle = window.getComputedStyle(homePhotosStrip);
    var gap = parseFloat(stripStyle.columnGap || stripStyle.gap) || 9.5;

    // 每个卡片的边框+内边距+底部参数栏开销
    var cardPadX = 10;
    var cardPadY = 34;
    var minImgH = 210;
    var maxImgH = stageInnerH > 160 ? Math.min(480, Math.max(260, stageInnerH - cardPadY - 4)) : 370;

    // 读取每张图片真实宽高比（兼容横向/竖向 16:9 与 4:3）
    var ars = items.map(function (item) {
      var img = item.querySelector('img');
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        var realAr = img.naturalWidth / img.naturalHeight;
        item.dataset.ar = realAr.toFixed(3);
        item.style.setProperty('--ar', realAr.toFixed(3));
        return realAr;
      }
      var dataAr = parseFloat(item.dataset.ar);
      return dataAr && dataAr > 0.2 ? dataAr : 1.333;
    });

    // 2. 搜索最优展示张数 bestCount 与最优行高 bestImgH，使照片占满画幅且空隙最小
    var bestCount = 1;
    var bestImgH = maxImgH;
    var bestScore = -1e9;
    var sumAr = 0;

    for (var k = 1; k <= items.length; k++) {
      sumAr += ars[k - 1];
      var availImgW = maxStageWidth - k * cardPadX - (k - 1) * gap;
      if (availImgW <= 60) break;

      // 若完全铺满宽度所需的理想高度
      var hToFillW = availImgW / sumAr;
      // 限制在合理高度区间 [minImgH, maxImgH]
      var clampedH = Math.max(minImgH, Math.min(maxImgH, hToFillW));
      var usedW = clampedH * sumAr + k * cardPadX + (k - 1) * gap;

      // 若超出右边界且 k > 1，则该张数在 minImgH 下仍放不下，停止继续增加
      if (usedW > maxStageWidth + 2 && k > 1) {
        break;
      }

      var widthFillRatio = Math.min(1, usedW / maxStageWidth);
      var heightFillRatio = Math.min(1, clampedH / maxImgH);
      // 综合面积占空比评分（优先让水平宽度与垂直高度同时最饱满，消除大空隙）
      var areaScore = widthFillRatio * 0.68 + heightFillRatio * 0.32;
      if (areaScore > bestScore) {
        bestScore = areaScore;
        bestCount = k;
        bestImgH = clampedH;
      }
    }

    // 若选中张数在 bestImgH 下仍有少量水平余量（< 14%），允许卡片等比微调宽度铺满整行，彻底消除两侧空隙
    var chosenArSum = 0;
    for (var m = 0; m < bestCount; m++) chosenArSum += ars[m];
    var totalFixedX = bestCount * cardPadX + Math.max(0, bestCount - 1) * gap;
    var naturalRowW = bestImgH * chosenArSum + totalFixedX;
    var stretchFactor = 1;
    if (naturalRowW < maxStageWidth && naturalRowW > maxStageWidth * 0.82) {
      stretchFactor = (maxStageWidth - totalFixedX) / Math.max(1, bestImgH * chosenArSum);
    }

    items.forEach(function (item, idx) {
      if (idx < bestCount) {
        item.style.display = '';
        delete item.dataset.boundaryHidden;
        var imgEl = item.querySelector('img');
        var itemImgW = Math.round(bestImgH * ars[idx] * stretchFactor);
        if (imgEl) {
          imgEl.style.height = Math.round(bestImgH) + 'px';
          imgEl.style.width = itemImgW + 'px';
        }
      } else {
        item.style.display = 'none';
        item.dataset.boundaryHidden = 'true';
      }
    });

    if (homePhotoFitStatus) {
      homePhotoFitStatus.innerHTML =
        '最新一组共 ' + items.length + ' 张照片 · 紧凑自适应排布 <strong class="telemetry-accent">' +
        bestCount + ' 张</strong>（已自动拟合 16:9 / 4:3 画幅以最小化空隙）';
    }
    if (photoBoundaryBadge) {
      photoBoundaryBadge.textContent = 'COMPACT FIT · ' + bestCount + ' / ' + items.length + ' SHOWN';
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

  /* 文章正文由服务端按需渲染；这里只保留客户端切换所需的可选注入（window.__ARTICLE_DB） */
  var ARTICLE_DB = window.__ARTICLE_DB || {};

  var proseBodyEl = document.getElementById('article-prose-body');
  ARTICLE_DB.mc = ARTICLE_DB.mc || {};
  if (proseBodyEl && !ARTICLE_DB.mc.prose) {
    ARTICLE_DB.mc.prose = proseBodyEl.innerHTML;
  }

  /* 照片信息详细页数据库（需求 8） */
  /* 照片数据由服务端渲染进 DOM / window.__PHOTO_DB；不再内置旧照片 */
  var PHOTO_DB = (window.__PHOTO_DB && window.__PHOTO_DB.length) ? window.__PHOTO_DB : [];

  // 为每张照片补充精确宽高比 ar 与横竖方向标识（#02 idx=2 为 3:4 竖向，其余为 16:9 或 4:3 横向）
  var PHOTO_AR_MAP = { 0: 1.7797, 1: 1.3333, 2: 0.7500, 3: 1.3659, 4: 1.7834, 5: 1.7834 };
  PHOTO_DB.forEach(function (item) {
    item.ar = item.ar || PHOTO_AR_MAP[item.idx] || 1.7778;
    item.orient = item.ar < 1.0 ? 'portrait' : 'landscape';
  });

  // 按视觉卡片顺序排列的索引序列；有服务端数据时按数据库顺序
  var PHOTO_VISUAL_ORDER = (window.__PHOTO_DB && window.__PHOTO_DB.length)
    ? PHOTO_DB.map(function (item) { return item.idx; })
    : [];
  var currentPhotoIdx = 0;

  /* 根据当前选中照片的宽高比 (ar) 与一屏视口边界，动态计算最大化无越界画框尺寸并驱动横/竖平滑伸缩动画 */
  function updateInspectorFrameGeometry() {
    var target = PHOTO_DB[currentPhotoIdx] || PHOTO_DB[0];
    if (!target) return;
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
    if (!target) return;
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
        el.removeAttribute('title');
        el.textContent = s;
        return;
      }
      var dmFooterEl = document.getElementById('footer-dm');
      var cipherEnabled = typeof window.__EXIF_CIPHER_EFFECT === 'boolean'
        ? window.__EXIF_CIPHER_EFFECT
        : (!dmFooterEl || dmFooterEl.dataset.exifCipher !== 'false');
      if (!cipherEnabled) {
        el.className = 'exif-val-normal';
        el.removeAttribute('title');
        el.textContent = '—';
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
      if (!curr) return;
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
      if (typeof layoutPhotosArchiveMasonry === 'function') {
        layoutPhotosArchiveMasonry();
      }
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
        (ARTICLE_DB[param] && ARTICLE_DB[param].path) ||
        (param ? '/posts/' + encodeURIComponent(param) + '/' : '/posts/');
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
      var domEntries = Array.from(document.querySelectorAll('[data-tl-entry]:not([hidden])'));
      if (!domEntries.length) {
        domEntries = Array.from(document.querySelectorAll('[data-tl-entry]'));
      }
      var candidates = [];
      domEntries.forEach(function (el) {
        var slug = el.getAttribute('data-article-key') || '';
        var titleLink = el.querySelector('.tl-card-title a');
        var href = (titleLink && titleLink.getAttribute('href')) || (slug ? '/posts/' + slug + '/' : '');
        var title = titleLink ? titleLink.textContent.trim() : slug;
        if (href && href !== '/posts/') {
          candidates.push({ slug: slug, url: href, title: title });
        }
      });
      if (!candidates.length) {
        Object.keys(ARTICLE_DB).forEach(function (k) {
          var item = ARTICLE_DB[k];
          if (item && (item.path || item.slug)) {
            candidates.push({
              slug: k,
              url: item.path || ('/posts/' + k + '/'),
              title: item.title || k
            });
          }
        });
      }
      if (!candidates.length) {
        showToast('暂无文章，先去 /studio/ 写一篇');
        return;
      }
      var chosen = candidates[Math.floor(Math.random() * candidates.length)];
      showToast('随机漫游至文章《' + chosen.title + '》');
      if (articleView && ARTICLE_DB[chosen.slug] && ARTICLE_DB[chosen.slug].prose) {
        setViewMode('article', chosen.slug);
      } else {
        window.location.href = chosen.url;
      }
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
      var cardText =
        btnCopySiteCard.getAttribute('data-site-card') ||
        '站名：夜笙的小世界 | 网址：https://www.yesheng.wiki | 简介：一个普通人的自述 | RSS：https://www.yesheng.wiki/rss.xml';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cardText).catch(function () {});
      }
      showToast('已复制本站友链名片信息到剪贴板');
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

  var footerDmEl = document.getElementById('footer-dm');
  var dmEnabled = !footerDmEl || footerDmEl.dataset.dmEnabled !== 'false';
  var dmConfiguredWl = (footerDmEl && footerDmEl.dataset.worldline) ? footerDmEl.dataset.worldline.trim() : '';
  var dmWlDigits = /^\d\.\d{6}$/.test(dmConfiguredWl)
    ? dmConfiguredWl.replace('.', '').split('').map(function (ch) { return Number(ch); })
    : null;
  if (footerDmEl && !dmEnabled) {
    footerDmEl.hidden = true;
    footerDmEl.style.display = 'none';
  }
  var dmHost = document.getElementById('dm-tubes-host');
  var dmDigitNodes = [];
  if (dmHost && dmEnabled) {
    var initDigits = dmWlDigits || [1, 0, 4, 8, 5, 9, 6];
    var tubeSpecs = [
      { dot: false, init: initDigits[0] },
      { dot: true, init: 0 },
      { dot: false, init: initDigits[1] },
      { dot: false, init: initDigits[2] },
      { dot: false, init: initDigits[3] },
      { dot: false, init: initDigits[4] },
      { dot: false, init: initDigits[5] },
      { dot: false, init: initDigits[6] }
    ];
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
    if (!dmDigitNodes.length || !dmEnabled) return;
    clearInterval(dmSpinTimer);
    var target = dmDigitNodes.map(function (_, idx) {
      if (dmWlDigits && typeof dmWlDigits[idx] === 'number' && !isNaN(dmWlDigits[idx])) {
        return dmWlDigits[idx];
      }
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
    var wordsEl = document.getElementById('spot-meta-words');
    var readingEl = document.getElementById('spot-meta-reading');
    var catEl = document.getElementById('spot-meta-category');
    var capEl = document.getElementById('spot-cover-caption-text');
    var href = titleEl ? titleEl.getAttribute('href') || '' : '';
    var idMatch = /\/posts\/([^/]+)\//.exec(href);
    var coverHidden = !coverEl || coverEl.hidden || coverEl.style.display === 'none';
    return {
      id: idMatch ? idMatch[1] : 'latest',
      url: href || '/posts/',
      title: titleEl ? titleEl.textContent.trim() : '',
      date: dateEl ? dateEl.textContent : '',
      tags: tagsEl ? tagsEl.textContent : '',
      coord: coordEl ? coordEl.textContent : '',
      cover: !coverHidden && coverEl ? coverEl.getAttribute('src') || '' : '',
      caption: capEl ? capEl.textContent.trim() : 'ADAPTIVE COVER',
      words: wordsEl ? wordsEl.textContent.trim() : '—',
      reading: readingEl ? readingEl.textContent.trim() : '—',
      category: catEl ? catEl.textContent.trim() : 'ARCHIVE',
      excerpt: leadEl ? leadEl.textContent.trim() : ''
    };
  }

  var defaultSpot = readSpotlightSnapshot();

  function classifyCoverRatio(ar) {
    if (!ar || !isFinite(ar) || ar <= 0) {
      return { mode: '16:9', pill: '16:9 HORIZONTAL', fig: 'FIG 01.1 · 16:9 HORIZONTAL COVER', tag: '16:9 ADAPTIVE VIEW' };
    }
    if (ar >= 1.52) {
      return { mode: '16:9', pill: '16:9 HORIZONTAL', fig: 'FIG 01.1 · 16:9 HORIZONTAL COVER', tag: '16:9 ADAPTIVE VIEW' };
    }
    if (ar >= 1.0) {
      return { mode: '4:3', pill: '4:3 HORIZONTAL', fig: 'FIG 01.1 · 4:3 HORIZONTAL COVER', tag: '4:3 ADAPTIVE VIEW' };
    }
    if (ar >= 0.65) {
      return { mode: '3:4', pill: '4:3 VERTICAL', fig: 'FIG 01.1 · 4:3 VERTICAL COVER', tag: '4:3 PORTRAIT ADAPTED' };
    }
    return { mode: '9:16', pill: '16:9 VERTICAL', fig: 'FIG 01.1 · 16:9 VERTICAL COVER', tag: '16:9 PORTRAIT ADAPTED' };
  }

  function syncSpotCoverGeometry() {
    var spotMain = document.getElementById('posts-q-spot-main') || document.querySelector('.posts-q-spot-main');
    var spotCoverImg = document.getElementById('spot-cover-img');
    var spotPill = document.getElementById('spot-cover-ratio-pill') || document.querySelector('.posts-spot-cover .cover-ratio-pill');
    var spotFig = document.getElementById('spot-cover-fig-label');
    var spotExTag = document.getElementById('spot-excerpt-ratio-tag');
    var topbarRatio = document.getElementById('posts-topbar-ratio');
    if (!spotMain) return;

    var hasCover = Boolean(
      spotCoverImg &&
      !spotCoverImg.hidden &&
      spotCoverImg.style.display !== 'none' &&
      spotCoverImg.getAttribute('src')
    );

    if (!hasCover) {
      spotMain.dataset.coverMode = 'locked';
      if (spotExTag) spotExTag.textContent = 'LOCKED // 未解锁状态';
      if (topbarRatio) topbarRatio.textContent = 'LOCKED // SIGNAL ENCRYPTED';
      return;
    }

    var applyRatio = function () {
      var nw = spotCoverImg.naturalWidth || 16;
      var nh = spotCoverImg.naturalHeight || 9;
      var info = classifyCoverRatio(nw / nh);
      spotMain.dataset.coverMode = info.mode;
      if (spotPill) spotPill.textContent = info.pill;
      if (spotFig) spotFig.textContent = info.fig;
      if (spotExTag) spotExTag.textContent = info.tag;
      if (topbarRatio) topbarRatio.textContent = info.pill;
    };

    if (spotCoverImg.complete && spotCoverImg.naturalWidth > 0) {
      applyRatio();
    } else {
      spotCoverImg.addEventListener('load', applyRatio, { once: true });
    }
  }

  function applyPostSpotlight(data, activeLink) {
    var spotTitle = document.getElementById('spot-title-link');
    var spotDate = document.getElementById('spot-date');
    var spotTags = document.getElementById('spot-tags');
    var spotCoord = document.getElementById('spot-coord-badge');
    var spotLead = document.getElementById('spot-lead-text');
    var spotReadBtn = document.getElementById('spot-read-btn');
    var spotCoverFrame = document.getElementById('spot-cover-frame');
    var spotCoverCaptionBar = document.getElementById('spot-cover-caption-bar');
    var spotCoverCaptionText = document.getElementById('spot-cover-caption-text');
    var spotCoverImg = document.getElementById('spot-cover-img');
    var spotCoverSvg = document.getElementById('spot-cover-svg');
    var spotCoverLink = document.getElementById('spot-cover-link');
    var spotWords = document.getElementById('spot-meta-words');
    var spotReading = document.getElementById('spot-meta-reading');
    var spotCat = document.getElementById('spot-meta-category');
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
    if (spotCoverSvg && spotCoverSvg.tagName === 'A') spotCoverSvg.href = spotPath;
    if (spotDate) spotDate.textContent = data.date;
    if (spotTags) spotTags.textContent = data.tags;
    if (spotCoord) spotCoord.textContent = data.coord;
    if (spotLead) spotLead.textContent = data.excerpt;
    if (spotWords && data.words) spotWords.textContent = data.words;
    if (spotReading && data.reading) spotReading.textContent = data.reading;
    if (spotCat && data.category) spotCat.textContent = data.category;
    if (spotCoverCaptionText && data.caption) spotCoverCaptionText.textContent = data.caption;

    var hasCover = Boolean(data.cover && String(data.cover).trim());
    if (spotCoverFrame) {
      spotCoverFrame.hidden = !hasCover;
      spotCoverFrame.style.display = hasCover ? '' : 'none';
    }
    if (spotCoverCaptionBar) {
      spotCoverCaptionBar.hidden = !hasCover;
      spotCoverCaptionBar.style.display = hasCover ? '' : 'none';
    }
    if (spotCoverImg) {
      if (hasCover) {
        spotCoverImg.src = data.cover;
        spotCoverImg.hidden = false;
        spotCoverImg.style.display = '';
      } else {
        spotCoverImg.removeAttribute('src');
        spotCoverImg.hidden = true;
        spotCoverImg.style.display = 'none';
      }
    }
    if (spotCoverSvg) {
      spotCoverSvg.hidden = hasCover;
      spotCoverSvg.style.display = hasCover ? 'none' : '';
    }

    syncSpotCoverGeometry();

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
      var artKey = openArtTrigger.dataset.openArticle || currentSpotId || 'mc';
      // 本地没有这篇的正文时，交给真实链接跳转（服务端渲染的文章页）
      if (!ARTICLE_DB[artKey] && openArtTrigger.getAttribute('href')) return;
      e.preventDefault();
      setViewMode('article', artKey);
      showToast('已进入文章详细页（右侧运行高立体感《三体》引力轨迹模型）');
      return;
    }

    var switchArtTrigger = e.target.closest('[data-switch-article]');
    if (switchArtTrigger) {
      var nextKey = switchArtTrigger.dataset.switchArticle;
      setViewMode('article', nextKey);
      showToast(ARTICLE_DB[nextKey] ? '已切换至文章《' + ARTICLE_DB[nextKey].title + '》' : '已切换文章');
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
        cover: postLink.dataset.postCover !== undefined ? postLink.dataset.postCover : defaultSpot.cover,
        caption: postLink.dataset.postCaption || defaultSpot.caption,
        words: postLink.dataset.postWords || defaultSpot.words,
        reading: postLink.dataset.postReading || defaultSpot.reading,
        category: postLink.dataset.postCategory || defaultSpot.category,
        excerpt: postLink.dataset.postExcerpt || defaultSpot.excerpt
      }, postLink);
      showToast('已在右侧预览《' + postLink.dataset.postTitle + '》，点击标题或「阅读全文」进入详细页');
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
      if (typeof syncArticleTocScrollSpy === 'function') {
        syncArticleTocScrollSpy();
      }
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

    // 1. 左右双叶双极焦点靶标（左叶 + 正极坐标十字，右叶 — 视界负轴横杠，呼应全站双极流形无限 Logo）
    var focusX = a * 0.62;
    [-focusX, focusX].forEach(function (fx3, poleIdx) {
      var fp = project3D(fx3, 0, 0, rotX, rotY, rotZ, cx, cy, fov);
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 87, 0.42)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(fp.sx, fp.sy, 11.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fp.sx - 5.2, fp.sy);
      ctx.lineTo(fp.sx + 5.2, fp.sy);
      if (poleIdx === 0) {
        ctx.moveTo(fp.sx, fp.sy - 5.2);
        ctx.lineTo(fp.sx, fp.sy + 5.2);
      }
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
      var speedMod = 0.82 + 0.32 * Math.sin(pt.u * 2.0 + pt.phaseOffset);
      pt.u += pt.uSpeed * speedMod * 0.68 * dt * state.speed;
      if (pt.u > Math.PI * 200) pt.u -= Math.PI * 200;

      var t = pt.u;
      var sinT = Math.sin(t);
      var cosT = Math.cos(t);
      var denom = 1 + sinT * sinT;

      var bx = (a * cosT) / denom;
      var by = (b * sinT * cosT) / denom;
      var bz = c * sinT;

      /* 使用严格的 2π 整数倍谐波 (t * 2.0)，消除 t = 0 ↔ 2π 右侧极点处的半周期相位翻转与粒子闪现断层 */
      var streamAngle = (pt.streamId / 7) * Math.PI * 2 + t * 2.0 + state.time * 0.55;
      var cosTw = Math.cos(streamAngle), sinTw = Math.sin(streamAngle);
      var rx = pt.cx * cosTw - pt.cy * sinTw;
      var ry = pt.cx * sinTw + pt.cy * cosTw;

      var localSpread = tubeRadius * (0.74 + 0.34 * Math.sin(t * 2.0 + pt.phaseOffset));
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
    var Rs = minDim * 0.142;
    var rollRad = -0.19 + Math.cos(state.time * 0.16) * 0.015 + mouse.snx * 0.04;
    var cr = Math.cos(rollRad), sr = Math.sin(rollRad);

    var rInner = Rs * 1.10;
    var rOuter = Math.min(W * 0.45, minDim * 0.49);

    function toScreen(lx, ly) {
      return {
        x: cx + (lx * cr - ly * sr),
        y: cy + (lx * sr + ly * cr)
      };
    }

    // 1. 背景深空引力场柔和光晕
    ctx.save();
    var ambientHalo = ctx.createRadialGradient(cx, cy, Rs * 0.85, cx, cy, rOuter * 0.96);
    ambientHalo.addColorStop(0, 'rgba(217, 119, 87, 0.24)');
    ambientHalo.addColorStop(0.35, 'rgba(235, 148, 110, 0.10)');
    ambientHalo.addColorStop(0.70, 'rgba(180, 95, 65, 0.028)');
    ambientHalo.addColorStop(1, 'rgba(20, 20, 19, 0)');
    ctx.fillStyle = ambientHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter * 0.96, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var diskRingNorms = [0.06, 0.18, 0.34, 0.52, 0.72, 0.90];

    // 2. 第一层（位于黑洞事件视界后方，将被中央黑洞遮挡）：
    //    2a) 吸积盘主圆环的后半部分（phi ∈ [π, 2π]，即 sinP <= 0），横穿黑洞后侧并被黑球自然遮挡
    //    2b) 上下引力透镜椭圆拱桥流线（饱满弧度，消除两侧扁平感）
    ctx.save();
    for (var rnIdx = 0; rnIdx < diskRingNorms.length; rnIdx++) {
      var rn = diskRingNorms[rnIdx];
      var rVal = rInner + rn * (rOuter - rInner);
      // 增大短半轴比例 (0.34 ~ 0.42)，让左右两侧回旋曲线饱满圆润、不再扁平
      var ellipRy = rVal * (0.34 + 0.08 * (1 - rn));

      // 2a: 中央圆环的后半弧（位于黑洞后方，穿过黑洞中心区将被步骤 4 的黑球本体完整遮挡）
      ctx.beginPath();
      for (var bst = 0; bst <= 72; bst++) {
        var bPhi = Math.PI + (bst / 72) * Math.PI; // sin(bPhi) <= 0
        var bCos = Math.cos(bPhi), bSin = Math.sin(bPhi);
        var blx = rVal * bCos;
        var bly = ellipRy * bSin;
        var bsp = toScreen(blx, bly);
        if (bst === 0) ctx.moveTo(bsp.x, bsp.y);
        else ctx.lineTo(bsp.x, bsp.y);
      }
      var backDiskAlpha = (1 - rn * 0.58) * 0.25;
      ctx.strokeStyle = 'rgba(236, 165, 112, ' + backDiskAlpha.toFixed(3) + ')';
      ctx.lineWidth = 1.05;
      ctx.stroke();

      // 2b: 上下引力透镜拱桥（使用更圆润的幂指数 0.46 与更饱满的侧翼曲率）
      var topArchH = Rs * (1.20 + 0.84 * Math.pow(rn, 0.82)) + rVal * 0.22 * (1 - rn);
      var botArchH = Rs * (1.14 + 0.72 * Math.pow(rn, 0.85)) + rVal * 0.19 * (1 - rn);
      for (var bArch = 0; bArch < 2; bArch++) {
        ctx.beginPath();
        for (var st = 0; st <= 72; st++) {
          var phi = Math.PI + (st / 72) * Math.PI;
          var cosP = Math.cos(phi), sinP = Math.sin(phi);
          var s = Math.max(0, -sinP);
          var sRound = Math.pow(s, 0.52);
          var lx = rVal * cosP;
          var ly;
          if (bArch === 0) {
            var archH0 = ellipRy + (topArchH - ellipRy) * Math.pow(s, 0.48);
            ly = -sRound * archH0;
          } else {
            var archH1 = ellipRy * 0.85 + (botArchH - ellipRy * 0.85) * Math.pow(s, 0.48);
            ly = sRound * archH1;
          }
          var sp = toScreen(lx, ly);
          if (st === 0) ctx.moveTo(sp.x, sp.y);
          else ctx.lineTo(sp.x, sp.y);
        }
        var archAlpha = (1 - rn * 0.62) * (bArch === 0 ? 0.27 : 0.19);
        ctx.strokeStyle = 'rgba(242, 179, 126, ' + archAlpha.toFixed(3) + ')';
        ctx.lineWidth = bArch === 0 ? 1.12 : 0.85;
        ctx.stroke();
      }
    }
    ctx.restore();

    // 3. 计算全部黑洞纯粒子的三维投影位置，严格按前后深度分为：
    //    - backParticles（后半盘 sinP < 0 及透镜拱桥粒子，位于黑洞后方，经过黑洞视界内部时被黑洞遮挡）
    //    - frontParticles（仅前半赤道盘 sinP >= 0 的前景粒子，横跨黑洞正前方）
    var count = Math.min(state.particleCount, MAX_PARTICLES);
    var backParticles = [];
    var frontParticles = [];

    for (var i = 0; i < count; i++) {
      var pt = particles[i];
      var keplerOmega = 1.25 / Math.pow(0.22 + pt.rNorm, 1.32);
      pt.phi += keplerOmega * dt * state.speed;
      if (pt.phi > Math.PI * 200) pt.phi -= Math.PI * 200;

      var cosP = Math.cos(pt.phi);
      var sinP = Math.sin(pt.phi);
      var lx, ly;
      var isFrontDisk = false;

      if (pt.branch === 2) {
        // 内圈光子晕：后半圈 (sinP < 0) 位于黑洞后方被遮挡，前半圈位于前景
        var rHalo = Rs * (1.03 + 0.46 * Math.pow(pt.rNorm, 1.4));
        lx = rHalo * cosP * (1.16 + 0.22 * pt.rNorm);
        ly = rHalo * sinP * (0.42 + 0.12 * pt.rNorm) + pt.cz * 1.8;
        isFrontDisk = sinP >= 0;
      } else {
        var r = Math.max(Rs * 1.08, rInner + pt.rNorm * (rOuter - rInner) + pt.bhJitter * Rs * 0.035);
        lx = r * cosP;
        // 饱满的椭圆短半轴，使两侧回旋弯折处圆润立体
        var pEllipRy = r * (0.34 + 0.08 * (1 - pt.rNorm));

        if (sinP >= 0) {
          // 仅前半盘（ly >= 0，下方前侧圆环）作为前景横跨黑洞正前方！
          isFrontDisk = true;
          var frontDip = sinP * Math.exp(-(lx * lx) / (2 * (Rs * 1.35) * (Rs * 1.35)));
          var bandSpread = (pt.branch === 0 ? 1.0 : 0.78);
          ly = pEllipRy * bandSpread * sinP + frontDip * Rs * 0.07 + pt.cz * 2.0;
        } else {
          // 后半盘（sinP < 0）：严格归入后景 backParticles，绝不覆盖在中央黑洞上方！
          isFrontDisk = false;
          var s = -sinP;
          var sRound = Math.pow(s, 0.52);
          if (pt.branch === 0 && (i % 3 !== 0)) {
            // 上引力透镜拱桥分支
            var pTopArchH = Rs * (1.20 + 0.84 * Math.pow(pt.rNorm, 0.82)) + r * 0.22 * (1 - pt.rNorm);
            var pArchH0 = pEllipRy + (pTopArchH - pEllipRy) * Math.pow(s, 0.48);
            ly = -sRound * pArchH0 + pt.cz * 2.0;
          } else if (pt.branch === 1 && (i % 2 === 0)) {
            // 下引力透镜拱桥分支
            var pBotArchH = Rs * (1.14 + 0.72 * Math.pow(pt.rNorm, 0.85)) + r * 0.19 * (1 - pt.rNorm);
            var pArchH1 = pEllipRy * 0.85 + (pBotArchH - pEllipRy * 0.85) * Math.pow(s, 0.48);
            ly = sRound * pArchH1 + pt.cz * 2.0;
          } else {
            // 主吸积盘圆环的后半部分（直接穿过黑洞后方，在 r < Rs 处被中央黑洞自然遮挡）
            ly = pEllipRy * sinP + pt.cz * 1.85;
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
        alpha: isFrontDisk ? alpha : alpha * 0.86,
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

    // 先绘制后半盘粒子（位于黑洞底层）
    renderPureParticles(backParticles);

    // 4. 第二层：中央事件视界黑洞本体（不透明纯黑球体，彻底遮挡后方圆环与后半盘粒子！）
    ctx.save();
    var photonGlow = ctx.createRadialGradient(cx - Rs * 0.06, cy, Rs * 0.95, cx, cy, Rs * 1.28);
    photonGlow.addColorStop(0, 'rgba(255, 225, 185, 0.42)');
    photonGlow.addColorStop(0.38, 'rgba(217, 119, 87, 0.16)');
    photonGlow.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = photonGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.28, 0, Math.PI * 2);
    ctx.fill();

    // 纯黑视界遮挡层：严格擦除并遮挡所有经过黑洞后方的吸积环线条与粒子
    var abyssGrad = ctx.createRadialGradient(cx - Rs * 0.20, cy - Rs * 0.18, Rs * 0.04, cx, cy, Rs * 1.03);
    abyssGrad.addColorStop(0, '#0c0b0a');
    abyssGrad.addColorStop(0.55, '#050504');
    abyssGrad.addColorStop(0.90, '#010101');
    abyssGrad.addColorStop(1, '#000000');
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.03, 0, Math.PI * 2);
    ctx.fillStyle = abyssGrad;
    ctx.fill();

    // 视界边缘光子环细亮线
    ctx.beginPath();
    ctx.arc(cx, cy, Rs * 1.035, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 232, 198, 0.46)';
    ctx.lineWidth = 1.15;
    ctx.stroke();
    ctx.restore();

    // 5. 第三层（前景层）：仅绘制前半赤道盘（fPhi ∈ [0, π]，sin(fPhi) >= 0）的连续椭圆流线与前景粒子
    //    先画一道极细的深色内缘遮挡衬线，强化前环横跨黑球正前方、后环被黑洞遮挡的空间层次
    ctx.save();
    var innerFrontR = rInner;
    var innerFrontRy = innerFrontR * 0.42;
    ctx.beginPath();
    for (var est = 8; est <= 64; est++) {
      var ePhi = (est / 72) * Math.PI;
      var esp = toScreen(innerFrontR * Math.cos(ePhi), innerFrontRy * Math.sin(ePhi) * 0.88);
      if (est === 8) ctx.moveTo(esp.x, esp.y);
      else ctx.lineTo(esp.x, esp.y);
    }
    ctx.strokeStyle = 'rgba(10, 10, 9, 0.82)';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    for (var fnIdx = 0; fnIdx < diskRingNorms.length; fnIdx++) {
      var fn = diskRingNorms[fnIdx];
      var rFront = rInner + fn * (rOuter - rInner);
      var fEllipRy = rFront * (0.34 + 0.08 * (1 - fn));
      ctx.beginPath();
      for (var fst = 0; fst <= 72; fst++) {
        var fPhi = (fst / 72) * Math.PI; // 仅前半圈 [0, π]
        var fCos = Math.cos(fPhi), fSin = Math.sin(fPhi);
        var flx = rFront * fCos;
        var fDip = fSin * Math.exp(-(flx * flx) / (2 * (Rs * 1.35) * (Rs * 1.35)));
        var fly = fEllipRy * fSin + fDip * Rs * 0.07;
        var fsp = toScreen(flx, fly);
        if (fst === 0) ctx.moveTo(fsp.x, fsp.y);
        else ctx.lineTo(fsp.x, fsp.y);
      }
      var fAlpha = (1 - fn * 0.56) * 0.36;
      ctx.strokeStyle = 'rgba(248, 190, 134, ' + fAlpha.toFixed(3) + ')';
      ctx.lineWidth = 1.25;
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
  var heroCanvasInView = true;
  var articleCanvasInView = true;

  if (typeof IntersectionObserver === 'function') {
    var canvasObserver = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (entry.target === stageCanvas) heroCanvasInView = entry.isIntersecting;
          else if (entry.target === articleCanvas) articleCanvasInView = entry.isIntersecting;
        }
      },
      { threshold: 0.01 }
    );
    if (stageCanvas) canvasObserver.observe(stageCanvas);
    if (articleCanvas) canvasObserver.observe(articleCanvas);
  }

  function renderFrame(now) {
    if (document.hidden) {
      lastTs = now;
      requestAnimationFrame(renderFrame);
      return;
    }
    var activeHomeCanvas = state.view === 'home' && stageCanvas && stageCanvas.width >= 10 && heroCanvasInView;
    var activeArticleCanvas = state.view === 'article' && articleCanvas && articleCanvas.width >= 10 && articleCanvasInView;
    if (!activeHomeCanvas && !activeArticleCanvas) {
      lastTs = now;
      requestAnimationFrame(renderFrame);
      return;
    }

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
    sliderDensity.value = String(state.particleCount);
    if (valDensity) valDensity.textContent = state.particleCount + ' 粒子';
    sliderDensity.addEventListener('input', function () {
      state.particleCount = parseInt(sliderDensity.value, 10);
      if (valDensity) valDensity.textContent = state.particleCount + ' 粒子';
    });
  }

  var sliderSpeed = document.getElementById('slider-speed');
  var valSpeed = document.getElementById('val-speed');
  if (sliderSpeed) {
    sliderSpeed.value = String(state.speed);
    if (valSpeed) valSpeed.textContent = state.speed.toFixed(1) + 'x';
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
  /* ========================================================================
     需求 4：相册子页照片墙自由紧凑排列算法（等间距 + 最小化排列空间面积浪费）
     ======================================================================== */
  var photosArchiveGrid = document.getElementById('photos-detail-archive-grid');

  function layoutPhotosArchiveMasonry() {
    if (!photosArchiveGrid) return;
    var allCards = Array.from(photosArchiveGrid.querySelectorAll('.photo-detail-card'));
    var visibleCards = allCards.filter(function (c) {
      return !c.hidden && c.style.display !== 'none';
    });
    if (!visibleCards.length) {
      photosArchiveGrid.removeAttribute('data-masonry-ready');
      photosArchiveGrid.style.height = '';
      return;
    }

    var containerW = photosArchiveGrid.clientWidth;
    if (containerW <= 40) return;

    var vw = window.innerWidth;
    var cols = vw <= 704 ? 1 : (vw <= 1152 ? 2 : 3);
    if (cols === 1 || visibleCards.length <= 1) {
      photosArchiveGrid.removeAttribute('data-masonry-ready');
      photosArchiveGrid.style.height = '';
      allCards.forEach(function (c) {
        c.style.position = '';
        c.style.width = '';
        c.style.left = '';
        c.style.top = '';
      });
      return;
    }

    var pad = 21.6; // 1.35rem
    var gap = 18;   // 统一等间距
    var innerW = Math.max(200, containerW - pad * 2);
    var colW = (innerW - gap * (cols - 1)) / cols;

    photosArchiveGrid.dataset.masonryReady = 'true';

    // 先赋予统一列宽，以准确测量每张卡片的真实高度
    visibleCards.forEach(function (card) {
      card.style.width = colW + 'px';
    });

    // 为最小化整体排列空间面积（即让各列总高度极差最小、最高列最矮），
    // 采用「最短列优先（Shortest-Column Best-Fit）」自由排列
    var colHeights = new Array(cols).fill(0);
    visibleCards.forEach(function (card) {
      var minCol = 0;
      for (var c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[minCol]) {
          minCol = c;
        }
      }
      var x = pad + minCol * (colW + gap);
      var y = pad + colHeights[minCol];
      card.style.left = Math.round(x) + 'px';
      card.style.top = Math.round(y) + 'px';
      var cardH = card.offsetHeight || 260;
      colHeights[minCol] += cardH + gap;
    });

    var maxH = Math.max.apply(null, colHeights);
    photosArchiveGrid.style.height = Math.ceil(Math.max(0, maxH - gap) + pad * 2) + 'px';
  }

  if (photosArchiveGrid) {
    photosArchiveGrid.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) {
        img.addEventListener('load', layoutPhotosArchiveMasonry);
      }
    });
    window.addEventListener('resize', layoutPhotosArchiveMasonry);
  }

  /* ========================================================================
     需求 6 & 7：文章详细页左侧章节目录 H2/H3 折叠交互与无滚动条自动跟随
     ======================================================================== */
  var articleTocList = document.getElementById('article-toc-list');

  function setTocGroupCollapsed(groupEl, collapsed) {
    if (!groupEl) return;
    groupEl.dataset.collapsed = collapsed ? 'true' : 'false';
    var btn = groupEl.querySelector('[data-toc-toggle]');
    if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  if (articleTocList) {
    articleTocList.addEventListener('click', function (e) {
      var toggleBtn = e.target.closest('[data-toc-toggle]');
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        var group = toggleBtn.closest('[data-toc-group]');
        if (group) {
          var isCollapsed = group.dataset.collapsed !== 'false';
          group.dataset.userToggled = 'true';
          setTocGroupCollapsed(group, !isCollapsed);
        }
        return;
      }

      var link = e.target.closest('a[data-toc-link]');
      if (link) {
        var parentGroup = link.closest('[data-toc-group]');
        if (parentGroup && link.dataset.tocLevel === '2') {
          var wasActive = link.dataset.active === 'true';
          var currentlyCollapsed = parentGroup.dataset.collapsed !== 'false';
          if (currentlyCollapsed) {
            parentGroup.dataset.userToggled = 'true';
            setTocGroupCollapsed(parentGroup, false);
          } else if (wasActive) {
            parentGroup.dataset.userToggled = 'true';
            setTocGroupCollapsed(parentGroup, true);
          }
        }
      }
    });
  }

  function syncArticleTocScrollSpy() {
    if (!articleTocList) return;
    var links = Array.from(articleTocList.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;

    var scrollLine = window.scrollY + 130;
    var activeLink = links[0];

    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      var id = decodeURIComponent(href.slice(1));
      var target = id ? document.getElementById(id) : null;
      if (target) {
        var top = target.getBoundingClientRect().top + window.scrollY;
        if (top <= scrollLine) {
          activeLink = links[i];
        }
      }
    }

    var activeGroup = activeLink ? activeLink.closest('[data-toc-group]') : null;

    links.forEach(function (a) {
      if (a === activeLink) a.dataset.active = 'true';
      else delete a.dataset.active;
    });

    if (activeGroup) {
      var h2Link = activeGroup.querySelector(':scope > .toc-row > a[data-toc-level="2"]');
      if (h2Link && activeLink !== h2Link) {
        h2Link.dataset.active = 'true';
      }
    }

    Array.from(articleTocList.querySelectorAll('[data-toc-group]')).forEach(function (grp) {
      if (grp === activeGroup) {
        setTocGroupCollapsed(grp, false);
      } else if (grp.dataset.userToggled !== 'true') {
        setTocGroupCollapsed(grp, true);
      }
    });

    // 让当前激活项在限制高度的目录框内平滑居中可见（不触发外层页面滚动）
    if (activeLink && articleTocList.scrollHeight > articleTocList.clientHeight) {
      var listRect = articleTocList.getBoundingClientRect();
      var linkRect = activeLink.getBoundingClientRect();
      var offsetInList = linkRect.top - listRect.top + articleTocList.scrollTop;
      var targetScroll = Math.max(0, offsetInList - articleTocList.clientHeight * 0.45);
      articleTocList.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }

  /* ========================================================================
     需求 8：主页「友链申请」流畅悬浮窗与提交逻辑
     ======================================================================== */
  function ensureFriendLinkApplyModal() {
    if (window.__YeshengFriendLinks && typeof window.__YeshengFriendLinks.ensureFriendLinkApplyModal === "function") {
      return window.__YeshengFriendLinks.ensureFriendLinkApplyModal();
    }
    var existing = document.getElementById('link-apply-modal');
    if (existing) return existing;

    var backdrop = document.createElement('div');
    backdrop.className = 'link-apply-backdrop';
    backdrop.id = 'link-apply-modal';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML =
      '<div class="link-apply-dialog" role="dialog" aria-modal="true" aria-labelledby="link-apply-title">' +
        '<span class="q-corner q-corner--tl"></span>' +
        '<span class="q-corner q-corner--tr"></span>' +
        '<span class="q-corner q-corner--bl"></span>' +
        '<span class="q-corner q-corner--br"></span>' +
        '<div class="link-apply-topbar">' +
          '<div class="link-apply-topbar-left">' +
            '<span class="q-sec-badge">PEER NODE // APPLY</span>' +
            '<span>FRIEND LINK APPLICATION · 友链互换申请表</span>' +
          '</div>' +
          '<button type="button" class="link-apply-close" data-close-link-apply aria-label="关闭弹窗">关闭 ×</button>' +
        '</div>' +
        '<form class="link-apply-form" id="link-apply-form" novalidate>' +
          '<div class="link-apply-head">' +
            '<h3 id="link-apply-title">申请加入独立博客友链矩阵</h3>' +
            '<p>填写下方站点信息提交后，站长可在后台「友链」管理页查看并一键添加至友链列表中。</p>' +
          '</div>' +
          '<div class="link-apply-grid">' +
            '<label class="link-apply-field">' +
              '<span class="link-apply-label"><span>01 // 站长称呼</span><em>必填</em></span>' +
              '<input type="text" name="owner" required maxlength="48" placeholder="如：夜笙" autocomplete="nickname" />' +
            '</label>' +
            '<label class="link-apply-field">' +
              '<span class="link-apply-label"><span>02 // 站点标题</span><em>必填</em></span>' +
              '<input type="text" name="name" required maxlength="64" placeholder="如：夜笙的小世界" />' +
            '</label>' +
            '<label class="link-apply-field">' +
              '<span class="link-apply-label"><span>03 // 站点链接</span><em>必填</em></span>' +
              '<input type="url" name="url" required maxlength="256" placeholder="https://www.example.com" />' +
            '</label>' +
            '<label class="link-apply-field">' +
              '<span class="link-apply-label"><span>04 // 领域标签</span><em>选填</em></span>' +
              '<input type="text" name="tag" maxlength="32" placeholder="如：技术 · 随笔（默认：独立博客）" />' +
            '</label>' +
          '</div>' +
          '<label class="link-apply-field">' +
            '<span class="link-apply-label"><span>05 // 自我介绍 / 站点简介</span><em>必填</em></span>' +
            '<textarea name="description" rows="3" required maxlength="320" placeholder="一句话介绍你的站点特色、记录方向或自我介绍…"></textarea>' +
          '</label>' +
          '<div style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" aria-hidden="true">' +
            '<input type="text" name="website" tabindex="-1" autocomplete="off" />' +
            '<input type="text" name="honeypot" tabindex="-1" autocomplete="off" />' +
          '</div>' +
          '<div class="link-apply-status" id="link-apply-status" role="status" aria-live="polite"></div>' +
          '<div class="link-apply-foot">' +
            '<button type="button" class="stage-mini-btn" data-close-link-apply>取消</button>' +
            '<button type="submit" class="q-read-btn" id="link-apply-submit-btn">提交友链申请 -&gt;</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    document.body.appendChild(backdrop);

    var form = backdrop.querySelector('#link-apply-form');
    var statusEl = backdrop.querySelector('#link-apply-status');
    var submitBtn = backdrop.querySelector('#link-apply-submit-btn');

    function closeModal() {
      delete backdrop.dataset.open;
      backdrop.setAttribute('aria-hidden', 'true');
    }

    backdrop.querySelectorAll('[data-close-link-apply]').forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.dataset.open === 'true') closeModal();
    });

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var payload = {
          owner: String(fd.get('owner') || '').trim(),
          name: String(fd.get('name') || '').trim(),
          url: String(fd.get('url') || '').trim(),
          tag: String(fd.get('tag') || '').trim(),
          description: String(fd.get('description') || '').trim(),
          website: String(fd.get('website') || '').trim(),
          honeypot: String(fd.get('honeypot') || '').trim()
        };
        if (!payload.owner || !payload.name || !payload.url || !payload.description) {
          if (statusEl) {
            statusEl.dataset.type = 'error';
            statusEl.textContent = '请完整填写站长称呼、站点标题、站点链接与自我介绍。';
          }
          return;
        }
        if (!/^https?:\/\//i.test(payload.url)) {
          payload.url = 'https://' + payload.url;
        }
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '正在提交…';
        }
        if (statusEl) {
          statusEl.dataset.type = 'info';
          statusEl.textContent = '正在提交友链申请…';
        }
        fetch('/api/links/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              if (!res.ok) throw new Error(data.error || '提交失败');
              return data;
            });
          })
          .then(function () {
            if (statusEl) {
              statusEl.dataset.type = 'ok';
              statusEl.textContent = '✓ 友链申请已提交！站长在后台审核后即可一键添加至友链列表。';
            }
            form.reset();
            showToast('友链申请已成功发送至站点后台');
            setTimeout(closeModal, 1100);
          })
          .catch(function (err) {
            if (statusEl) {
              statusEl.dataset.type = 'error';
              statusEl.textContent = (err && err.message) || '提交友链申请失败，请稍后重试。';
            }
          })
          .finally(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = '提交友链申请 ->';
            }
          });
      });
    }

    return backdrop;
  }

  document.querySelectorAll('[data-open-link-apply]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var modal = ensureFriendLinkApplyModal();
      var statusEl = modal.querySelector('#link-apply-status');
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.removeAttribute('data-type');
      }
      modal.dataset.open = 'true';
      modal.setAttribute('aria-hidden', 'false');
      setTimeout(function () {
        var firstInput = modal.querySelector('input[name="owner"]');
        if (firstInput) firstInput.focus();
      }, 60);
    });
  });

  /* ========================================================================
     需求 9：文章详细页右侧悬浮窗「音乐播放模块」交互初始化
     ======================================================================== */
  function formatAudioTime(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  /* ----------------------------------------------------------------------
     音频文件二进制标签（ID3v2 / ID3v1 / FLAC / OGG / MP4）与文件名自动解析
     当音乐播放器未设置自定义标题/作者时，自动从音频文件读取，读取失败则保留默认值
     ---------------------------------------------------------------------- */
  function parseAudioFilenameFallback(urlOrName) {
    if (!urlOrName) return {};
    try {
      var decoded = decodeURIComponent(String(urlOrName));
      var base = (decoded.split('/').pop() || decoded).split('?')[0] || '';
      var withoutExt = base.replace(/\.[^.]+$/, '').replace(/^\d{10,14}[-_]/, '').trim();
      if (!withoutExt) return {};
      var sepMatch = withoutExt.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (sepMatch && sepMatch[1] && sepMatch[2]) {
        return { artist: sepMatch[1].trim(), title: sepMatch[2].trim() };
      }
      return { title: withoutExt };
    } catch (e) {
      return {};
    }
  }

  function decodeAudioTagBytes(bytes, encByte) {
    if (!bytes || !bytes.length) return '';
    try {
      if (encByte === 1 || encByte === 2) {
        var sub = bytes;
        var dec = encByte === 2 ? 'utf-16be' : 'utf-16le';
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
          dec = 'utf-16be';
          sub = bytes.subarray(2);
        } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
          dec = 'utf-16le';
          sub = bytes.subarray(2);
        }
        return new TextDecoder(dec).decode(sub).replace(/\0+/g, '').trim();
      }
      if (encByte === 3) {
        return new TextDecoder('utf-8').decode(bytes).replace(/\0+/g, '').trim();
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\0+/g, '').trim();
      } catch (e2) {
        return new TextDecoder('gb18030').decode(bytes).replace(/\0+/g, '').trim();
      }
    } catch (e) {
      return '';
    }
  }

  function parseAudioTagBuffer(buf) {
    if (window.__YeshengAudioMeta && typeof window.__YeshengAudioMeta.parseAudioTagBuffer === "function") {
      return window.__YeshengAudioMeta.parseAudioTagBuffer(buf);
    }
    var out = {};
    if (!buf || buf.length < 10) return out;
    // ID3v2
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
      var ver = buf[3];
      var tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
      var limit = Math.min(buf.length, 10 + tagSize);
      var pos = 10;
      while (pos + 10 <= limit) {
        var id = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        var fSize = ver === 4
          ? (((buf[pos + 4] & 0x7f) << 21) | ((buf[pos + 5] & 0x7f) << 14) | ((buf[pos + 6] & 0x7f) << 7) | (buf[pos + 7] & 0x7f))
          : (((buf[pos + 4] << 24) >>> 0) + ((buf[pos + 5] << 16) >>> 0) + ((buf[pos + 6] << 8) >>> 0) + (buf[pos + 7] >>> 0));
        pos += 10;
        if (fSize <= 1 || pos + fSize > limit) break;
        var enc = buf[pos];
        var contentBytes = buf.subarray(pos + 1, pos + fSize);
        if (id === 'TIT2' && !out.title) out.title = decodeAudioTagBytes(contentBytes, enc);
        else if ((id === 'TPE1' || id === 'TPE2') && !out.artist) out.artist = decodeAudioTagBytes(contentBytes, enc);
        pos += fSize;
        if (out.title && out.artist) break;
      }
    }
    return out;
  }

  function autoReadAudioMetadataForCard(cardEl, audioSrc) {
    if (!cardEl || !audioSrc) return;
    var titleEl = cardEl.querySelector('[data-music-title-el], .rail-music-title');
    var artistEl = cardEl.querySelector('[data-music-artist-el], .rail-music-artist');
    if (!titleEl && !artistEl) return;

    var curTitle = (titleEl ? titleEl.textContent : '').trim();
    var curArtist = (artistEl ? artistEl.textContent : '').trim();
    var needTitle = cardEl.dataset.titleIsDefault === 'true' || !curTitle || curTitle === '未命名伴读曲目' || curTitle === '伴读音乐 · 未命名曲目';
    var needArtist = cardEl.dataset.artistIsDefault === 'true' || !curArtist || curArtist === 'ACOUSTIC STREAM // 伴读声轨' || curArtist === '夜笙 · ACOUSTIC BGM';
    if (!needTitle && !needArtist) return;

    var fromFile = parseAudioFilenameFallback(audioSrc);
    if (needTitle && fromFile.title && titleEl) {
      titleEl.textContent = fromFile.title;
      titleEl.title = fromFile.title;
    }
    if (needArtist && fromFile.artist && artistEl) {
      artistEl.textContent = fromFile.artist;
      artistEl.title = fromFile.artist;
    }

    fetch(audioSrc, { headers: { Range: 'bytes=0-65535' }, credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('range fetch failed');
        return res.arrayBuffer();
      })
      .then(function (ab) {
        var buf = new Uint8Array(ab.byteLength > 65536 ? ab.slice(0, 65536) : ab);
        var meta = parseAudioTagBuffer(buf);
        if (needTitle && meta.title && titleEl) {
          titleEl.textContent = meta.title;
          titleEl.title = meta.title;
        }
        if (needArtist && meta.artist && artistEl) {
          artistEl.textContent = meta.artist;
          artistEl.title = meta.artist;
        }
      })
      .catch(function () {
        // 读取失败则静默保留默认标题和默认作者
      });
  }

  function initRailMusicPlayers() {
    var players = Array.from(document.querySelectorAll('[data-rail-music-player]'));
    players.forEach(function (cardEl) {
      if (cardEl.dataset.musicWired === 'true') return;
      cardEl.dataset.musicWired = 'true';

      var audio = cardEl.querySelector('[data-music-audio]');
      var playBtn = cardEl.querySelector('[data-music-toggle]');
      var seek = cardEl.querySelector('[data-music-seek]');
      var fill = cardEl.querySelector('[data-music-fill]');
      var curEl = cardEl.querySelector('[data-music-cur]');
      var durEl = cardEl.querySelector('[data-music-dur]');
      var badgeEl = cardEl.querySelector('[data-music-badge]');
      var loopBtn = cardEl.querySelector('[data-music-loop]');
      var muteBtn = cardEl.querySelector('[data-music-mute]');
      if (!audio) return;

      // 自动读取音频作者与标题，若读取失败则保留默认值
      var srcUrl = audio.getAttribute('src') || audio.src || '';
      if (srcUrl) autoReadAudioMetadataForCard(cardEl, srcUrl);

      audio.addEventListener('loadedmetadata', function () {
        if (durEl) durEl.textContent = formatAudioTime(audio.duration);
      });

      audio.addEventListener('timeupdate', function () {
        if (curEl) curEl.textContent = formatAudioTime(audio.currentTime);
        var pct = audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
        if (fill) fill.style.width = pct.toFixed(1) + '%';
        if (seek) seek.value = String(pct);
      });

      audio.addEventListener('play', function () {
        players.forEach(function (other) {
          if (other !== cardEl) {
            var otherAudio = other.querySelector('[data-music-audio]');
            if (otherAudio && !otherAudio.paused) otherAudio.pause();
          }
        });
        cardEl.dataset.playing = 'true';
        if (badgeEl) badgeEl.textContent = 'PLAYING';
      });

      audio.addEventListener('pause', function () {
        cardEl.dataset.playing = 'false';
        if (badgeEl) badgeEl.textContent = 'PAUSED';
      });

      audio.addEventListener('ended', function () {
        cardEl.dataset.playing = 'false';
        if (badgeEl) badgeEl.textContent = 'AUDIO';
      });

      if (playBtn) {
        playBtn.addEventListener('click', function () {
          if (audio.paused) {
            audio.play().catch(function () {
              showToast('音频播放失败，请检查音频文件是否有效');
            });
          } else {
            audio.pause();
          }
        });
      }

      if (seek) {
        seek.addEventListener('input', function () {
          if (audio.duration > 0) {
            audio.currentTime = (parseFloat(seek.value) / 100) * audio.duration;
          }
        });
      }

      if (loopBtn) {
        loopBtn.addEventListener('click', function () {
          audio.loop = !audio.loop;
          loopBtn.setAttribute('aria-pressed', String(audio.loop));
          showToast(audio.loop ? '已开启单曲循环' : '已关闭单曲循环');
        });
      }

      if (muteBtn) {
        muteBtn.addEventListener('click', function () {
          audio.muted = !audio.muted;
          muteBtn.setAttribute('aria-pressed', String(audio.muted));
        });
      }
    });
  }


  syncSpotCoverGeometry();
  setTimeout(fitHomePhotoWallBounds, 60);
  setTimeout(layoutPhotosArchiveMasonry, 60);
  initRailMusicPlayers();
  syncTopNavHighlight(state.view);

  resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);
})();
