/**
 * 登录 / 解锁页 —— HUD 象限蓝图设计语言版
 *
 * 既支持原有的「账号 + 密码 → PBKDF2 解密 vault.json 连接 GitHub API」流程，
 * 也新增了「免接口 UI 交互演示模式（无需密文一键进入工作台）」入口，
 * 方便在未配置接口或仅调试界面交互时直接体验全部后台功能。
 */
import { Github } from '../github';
import { $, esc, setBusy, toast } from '../ui';
import { REPO, state, reload, rerender } from '../state';
import { unlockVault } from '../vault';
import { site } from '../../site.config';
import { loadMockAll } from '../mock';

function showOnly(html: string): void {
  const main = $('#st-main');
  const bar = $('#st-bar');
  if (bar) bar.innerHTML = '';
  if (main) main.innerHTML = html;
}

export function enterDemoMode(): void {
  const mock = loadMockAll();
  state.demoMode = true;
  state.user = 'yesheng (LOCAL-UI)';
  state.posts = mock.posts;
  state.walls = mock.walls;
  state.links = mock.links;
  state.site = mock.site;
  state.photoFiles = mock.photoFiles;
  state.postAssetFiles = mock.postAssetFiles;
  state.staged = { added: [], removed: [] };
  state.selected = state.posts[0]?.id ?? null;
  state.draft = {};
  state.dirty = false;
  rerender();
  toast('已进入 UI 交互演示模式 · 所有编辑、EXIF 解析与乱码预览均可直接交互');
}

async function useToken(token: string, fromVault = false): Promise<void> {
  setBusy(true, '验证令牌…');
  try {
    const gh = new Github(token, REPO);
    const me = await gh.whoAmI();
    state.token = token;
    state.gh = gh;
    state.demoMode = false;
    state.user = me.login;
    setBusy(false);
    await reload();
  } catch {
    setBusy(false);
    state.token = null;
    state.gh = null;
    if (fromVault) renderUnlock('解出来的令牌已经失效或被撤销了 —— 需要重新生成密文，或直接点击下方进入 UI 演示模式');
    else renderNoVault();
  }
}

function brandBlock(): string {
  return `
    <div class="st-brand">
      <div class="st-brand-motif" aria-hidden="true">
        <svg class="planar-icon planar-icon--infinity" viewBox="0 0 36 18">
          <path d="M10.5 2.2C6.7 2.2 3.7 5.2 3.7 9C3.7 12.8 6.7 15.8 10.5 15.8C15.2 15.8 20.8 2.2 25.5 2.2C29.3 2.2 32.3 5.2 32.3 9C32.3 12.8 29.3 15.8 25.5 15.8C20.8 15.8 15.2 2.2 10.5 2.2Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          <circle cx="10.5" cy="9" r="1.35" fill="currentColor"/>
          <circle cx="25.5" cy="9" r="1.35" fill="currentColor"/>
        </svg>
        <svg class="planar-icon planar-icon--blackhole" viewBox="0 0 36 18">
          <path d="M8.5 8.2C11.2 2.4 24.8 2.4 27.5 8.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
          <path d="M10.5 10.2C13.2 14.8 22.8 14.8 25.5 10.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.75" stroke-linecap="round"/>
          <circle cx="18" cy="9" r="4.2" fill="currentColor"/>
          <ellipse cx="18" cy="9.2" rx="14.5" ry="3.1" transform="rotate(-11 18 9.2)" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="st-brand-name">${esc(site.title)}</div>
      <div class="st-brand-tag">STUDIO // 象限蓝图管理中枢</div>
    </div>`;
}

export function renderNoVault(): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card q-frame">
        <span class="q-corner q-corner--tl"></span>
        <span class="q-corner q-corner--tr"></span>
        <span class="q-corner q-corner--bl"></span>
        <span class="q-corner q-corner--br"></span>
        <div class="q-topbar">
          <div class="q-topbar-cell"><span class="q-sec-badge">VAULT // 00</span><span>AUTH GATEWAY</span></div>
          <div class="q-topbar-cell q-topbar-cell--right"><span>PBKDF2 · AES-GCM</span></div>
        </div>
        <div class="st-card-body">
          ${brandBlock()}
          <p class="st-login-note">当前尚未检测到解锁密文，或你正处于纯前端 UI 交互预览环境。</p>
          <button class="st-btn st-btn--primary st-btn--block" id="st-enter-demo">进入后台 UI 交互工作台（免接口演示） →</button>
          <p class="st-login-note" style="margin-top:var(--space-4)">如需连接 GitHub 仓库，可在本地项目目录运行 <code>npm run vault</code> 生成密文。</p>
        </div>
      </div>
    </div>`);
  $('#st-enter-demo')?.addEventListener('click', () => enterDemoMode());
}

export function renderUnlock(message?: string): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card q-frame">
        <span class="q-corner q-corner--tl"></span>
        <span class="q-corner q-corner--tr"></span>
        <span class="q-corner q-corner--bl"></span>
        <span class="q-corner q-corner--br"></span>
        <div class="q-topbar">
          <div class="q-topbar-cell"><span class="q-sec-badge">STUDIO // AUTH</span><span>SECURITY GATEWAY</span></div>
          <div class="q-topbar-cell q-topbar-cell--right"><span class="telemetry-accent">96REM HUD</span></div>
        </div>
        <div class="st-card-body">
          ${brandBlock()}
          <label class="st-label" for="st-unlock-acct">ACCOUNT // 账号标识</label>
          <input class="st-input" id="st-unlock-acct" autocomplete="off" spellcheck="false" placeholder="输入管理账号..." />
          <label class="st-label" for="st-unlock-pw">PASSPHRASE // 解锁口令</label>
          <input class="st-input" id="st-unlock-pw" type="password" autocomplete="current-password" placeholder="输入解密口令..." />
          <button class="st-btn st-btn--primary st-btn--block" id="st-unlock-go">解锁仓库读写权限 (UNLOCK)</button>
          <button class="st-btn st-btn--block" id="st-enter-demo" style="margin-top:0.6rem;">直接进入 UI 交互演示模式（无需口令/接口） →</button>
          ${message ? `<p class="st-error">${esc(message)}</p>` : ''}
        </div>
        <div class="q-footbar">
          <span>CIPHER: PBKDF2-SHA256</span>
          <span>YESHENG.WIKI // STUDIO</span>
        </div>
      </div>
    </div>`);

  const go = async () => {
    const blob = state.vault;
    if (!blob) return;
    const acct = $<HTMLInputElement>('#st-unlock-acct')?.value ?? '';
    const pw = $<HTMLInputElement>('#st-unlock-pw')?.value ?? '';
    if (!acct || !pw) {
      enterDemoMode();
      return;
    }
    setBusy(true, '解锁中…');
    try {
      const token = await unlockVault(blob, acct, pw);
      setBusy(false);
      await useToken(token, true);
    } catch {
      setBusy(false);
      renderUnlock('账号或密码不对（如需直接预览后台界面与交互，请点下方按钮）');
    }
  };
  $('#st-unlock-go')?.addEventListener('click', () => void go());
  $('#st-enter-demo')?.addEventListener('click', () => enterDemoMode());
  for (const sel of ['#st-unlock-acct', '#st-unlock-pw']) {
    $<HTMLInputElement>(sel)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void go();
    });
  }
}