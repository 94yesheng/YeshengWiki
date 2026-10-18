/**
 * 登录页 —— HUD 象限蓝图设计语言版。
 *
 * 账号密码由 `/api/auth/login` 验证；成功后用 HttpOnly Cookie 维持会话，
 * 后台的读写走 `/api/fs`。不再需要 GitHub PAT 或 vault 密文。
 */
import { ApiGithub } from '../api';
import { $, esc, setBusy, toast } from '../ui';
import { state, reload, rerender } from '../state';
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
  state.csrf = null;
  state.gh = null;
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

async function useLogin(username: string, password: string): Promise<void> {
  setBusy(true, '登录中…');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? '登录失败');
    }
    const data = (await res.json()) as { user: { username: string }; csrf: string };
    state.user = data.user.username;
    state.csrf = data.csrf;
    state.gh = new ApiGithub(data.csrf);
    state.demoMode = false;
    state.token = null;
    setBusy(false);
    await reload();
  } catch (error) {
    setBusy(false);
    state.csrf = null;
    state.gh = null;
    renderUnlock(error instanceof Error ? error.message : '登录失败');
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
  renderUnlock('请使用管理员账号登录');
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
          <div class="q-topbar-cell q-topbar-cell--right"><span class="telemetry-accent">SESSION // COOKIE</span></div>
        </div>
        <div class="st-card-body">
          ${brandBlock()}
          <label class="st-label" for="st-unlock-acct">ACCOUNT // 管理员账号</label>
          <input class="st-input" id="st-unlock-acct" autocomplete="username" spellcheck="false" placeholder="输入管理员账号..." />
          <label class="st-label" for="st-unlock-pw">PASSWORD // 登录密码</label>
          <input class="st-input" id="st-unlock-pw" type="password" autocomplete="current-password" placeholder="输入登录密码..." />
          <button class="st-btn st-btn--primary st-btn--block" id="st-unlock-go">登录后台 (SIGN IN)</button>
          <button class="st-btn st-btn--block" id="st-enter-demo" style="margin-top:0.6rem;">直接进入 UI 交互演示模式（不写数据库） →</button>
          ${message ? `<p class="st-error">${esc(message)}</p>` : ''}
        </div>
        <div class="q-footbar">
          <span>SESSION: HTTPONLY COOKIE</span>
          <span>YESHENG.WIKI // STUDIO</span>
        </div>
      </div>
    </div>`);

  const go = async () => {
    const acct = $<HTMLInputElement>('#st-unlock-acct')?.value ?? '';
    const pw = $<HTMLInputElement>('#st-unlock-pw')?.value ?? '';
    if (!acct || !pw) {
      renderUnlock('请输入账号和密码；只想看界面可以点下方演示模式');
      return;
    }
    await useLogin(acct, pw);
  };
  $('#st-unlock-go')?.addEventListener('click', () => void go());
  $('#st-enter-demo')?.addEventListener('click', () => enterDemoMode());
  for (const sel of ['#st-unlock-acct', '#st-unlock-pw']) {
    $<HTMLInputElement>(sel)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void go();
    });
  }
}
