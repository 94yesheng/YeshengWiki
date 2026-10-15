/**
 * 登录 / 解锁页
 *
 * 后台只认「账号 + 密码」这一条路：站点上有密文就显示解锁页，没有就提示去本机跑
 * `npm run vault` 生成。界面上不出现令牌输入框 —— 令牌只在你自己电脑上的生成器里
 * 用一次，不进这个页面。
 */
import { Github } from '../github';
import { $, esc, setBusy } from '../ui';
import { REPO, state, reload } from '../state';
import { unlockVault } from '../vault';
import { site } from '../../site.config';

/** 清空登录态并显示某个界面（顶栏也一并清掉，免得留一条空边线） */
function showOnly(html: string): void {
  const main = $('#st-main');
  const bar = $('#st-bar');
  if (bar) bar.innerHTML = '';
  if (main) main.innerHTML = html;
}

async function useToken(token: string, fromVault = false): Promise<void> {
  setBusy(true, '验证令牌…');
  try {
    const gh = new Github(token, REPO);
    const me = await gh.whoAmI();
    state.token = token;
    state.gh = gh;
    state.user = me.login;
    setBusy(false);
    await reload();
  } catch (e) {
    setBusy(false);
    state.token = null;
    state.gh = null;
    // 从密文解出来的令牌还被拒 → 多半是令牌本身失效/被撤销了，得重新生成一份密文
    if (fromVault) renderUnlock('解出来的令牌已经失效或被撤销了 —— 需要重新生成密文');
    else renderNoVault();
  }
}

/** 登录页顶部的站点标识 —— 用站点配置里的站名，改配置这里跟着变 */
function brandBlock(): string {
  return `
    <div class="st-brand">
      <div class="st-brand-name">${esc(site.title)}</div>
      <div class="st-brand-tag">后台</div>
    </div>`;
}

/**
 * 站点上还没有密文时的界面。
 * 后台**不接受令牌登录** —— 令牌只在你自己电脑上的生成器里用一次，不进这个界面。
 * 所以这里只说明"去哪里把密文建起来"。
 */
export function renderNoVault(): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card">
        ${brandBlock()}
        <p class="st-login-note">还没有配置解锁口令。</p>
        <p class="st-login-note">在你自己电脑上的项目目录（<code>D:\\blog</code>）里运行
          <code>npm run vault</code>，按提示生成密文并提交推送，然后刷新这一页。</p>
      </div>
    </div>`);
}

export function renderUnlock(message?: string): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card">
        ${brandBlock()}
        <label class="st-label" for="st-unlock-acct">账号</label>
        <input class="st-input" id="st-unlock-acct" autocomplete="off" spellcheck="false" />
        <label class="st-label" for="st-unlock-pw">密码</label>
        <input class="st-input" id="st-unlock-pw" type="password" autocomplete="current-password" />
        <button class="st-btn st-btn--primary st-btn--block" id="st-unlock-go">解锁</button>
        ${message ? `<p class="st-error">${esc(message)}</p>` : ''}
      </div>
    </div>`);

  const go = async () => {
    const blob = state.vault;
    if (!blob) return;
    const acct = $<HTMLInputElement>('#st-unlock-acct')?.value ?? '';
    const pw = $<HTMLInputElement>('#st-unlock-pw')?.value ?? '';
    if (!acct || !pw) return;
    setBusy(true, '解锁中…');
    try {
      const token = await unlockVault(blob, acct, pw);
      setBusy(false);
      await useToken(token, true);
    } catch {
      setBusy(false);
      // 账号错、密码错，都是同一个 AES-GCM 校验失败 —— 分不出来，也不该分
      renderUnlock('账号或密码不对');
    }
  };
  $('#st-unlock-go')?.addEventListener('click', () => void go());
  for (const sel of ['#st-unlock-acct', '#st-unlock-pw']) {
    $<HTMLInputElement>(sel)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void go();
    });
  }
}