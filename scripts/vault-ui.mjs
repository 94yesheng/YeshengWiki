/**
 * 本地可视化界面：生成后台的加密令牌（保险箱）
 *
 * 【为什么是"本地起一个小服务"而不是一个静态网页】
 * 两个原因：
 *   1. 生成完要**直接写进 public/studio/vault.json** —— 浏览器里的页面写不了磁盘
 *      （file:// 下的 File System Access API 能用，但每次都要手动选路径，麻烦）
 *   2. 加密仍然在**浏览器里**做（WebCrypto），和后台解密走的是同一套 API —— 参数一致
 *      才互通，用同一套实现最不容易错
 *
 * 【安全边界】这个服务只监听 127.0.0.1（外面连不上），只做三件事：给页面、
 * 报告密文文件状态、接收一份密文写进那个固定路径。它经手令牌吗？不 —— 令牌
 * 从头到尾只在浏览器里，服务端只收到**已经加密好的密文**。
 *
 * 【它永远不会被部署】文件在 scripts/ 下，不在 public/ 里，所以不会进 dist。
 *
 * 用法：npm run vault   （或 node scripts/vault-ui.mjs）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** 工具自己所在的地方 —— 页面文件永远跟它走，和"往哪个仓库写"是两件事 */
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 要往哪个仓库写密文。
 * 默认是本脚本所在的项目；用环境变量 VAULT_REPO_ROOT 可以指向另一个项目
 * （比如你还有第二个站点，或者想拿一个临时仓库先试试这条路）。
 *
 * 注意它和上面那个 here 是分开的：页面从 here 取，密文写进 root。
 * 早先两者共用一个变量，一旦用 VAULT_REPO_ROOT 指向别处，连自己的页面都找不到了（踩过）。
 */
const root = process.env.VAULT_REPO_ROOT ? path.resolve(process.env.VAULT_REPO_ROOT) : path.resolve(here, '..');
const PAGE = path.join(here, 'vault-ui.html');
const TARGET = path.join(root, 'public', 'studio', 'vault.json');

/**
 * 明文记录写哪儿。故意放在**仓库之外**（`D:\文件\博客` 不是 git 仓库，所以不可能被提交），
 * 而且用 markdown，方便直接打开查。
 * 用 --log <路径> 可以改。
 */
const logArg = process.argv.indexOf('--log');
const LOG_PATH = logArg > -1 ? process.argv[logArg + 1] : 'D:\\文件\\博客\\保险箱记录.md';

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 4399;

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

/** 密文文件的状态：存在吗、多大、什么时候写的 */
function targetStatus() {
  if (!fs.existsSync(TARGET)) return { exists: false, path: path.relative(root, TARGET).replace(/\\/g, '/') };
  const stat = fs.statSync(TARGET);
  return {
    exists: true,
    path: path.relative(root, TARGET).replace(/\\/g, '/'),
    bytes: stat.size,
    modified: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
  };
}

/**
 * 接收密文并写盘。
 * 只做基本形状校验 —— 真正的正确性由页面上的自检保证（生成后立刻用同一口令解一遍），
 * 这里拦的是"明显不是密文"的东西，避免把乱七八糟的内容写进去。
 */
function validate(blob) {
  if (!blob || typeof blob !== 'object') return '收到的不是对象';
  if (blob.v !== 2) return '不是 v2 格式的密文';
  if (!Number.isFinite(blob.iterations) || blob.iterations < 100_000) return '迭代次数不合理';
  for (const key of ['salt', 'iv', 'ct']) {
    const value = blob[key];
    if (typeof value !== 'string' || value.length < 8 || !/^[A-Za-z0-9+/=]+$/.test(value)) {
      return `${key} 不是合法的 base64`;
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    if (!fs.existsSync(PAGE)) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('缺少 scripts/vault-ui.html');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(PAGE));
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    return json(res, 200, { ...targetStatus(), logPath: LOG_PATH });
  }

  if (req.method === 'POST' && url.pathname === '/save') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let blob;
      try {
        blob = JSON.parse(body);
      } catch {
        return json(res, 400, { ok: false, error: '请求体不是合法 JSON' });
      }
      const problem = validate(blob);
      if (problem) return json(res, 400, { ok: false, error: problem });
      try {
        fs.mkdirSync(path.dirname(TARGET), { recursive: true });
        fs.writeFileSync(TARGET, JSON.stringify(blob, null, 2) + '\n');
      } catch (e) {
        return json(res, 500, { ok: false, error: `写文件失败：${e instanceof Error ? e.message : String(e)}` });
      }
      return json(res, 200, { ok: true, ...targetStatus() });
    });
    return;
  }

  // 在本机留一份明文记录（默认不写，由页面上的勾选框决定）
  if (req.method === 'POST' && url.pathname === '/log') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let markdown;
      try {
        markdown = JSON.parse(body).markdown;
      } catch {
        return json(res, 400, { ok: false, error: '请求体不是合法 JSON' });
      }
      if (typeof markdown !== 'string' || markdown.length < 40) {
        return json(res, 400, { ok: false, error: '记录内容不合理' });
      }
      try {
        fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
        fs.writeFileSync(LOG_PATH, markdown, 'utf8');
      } catch (e) {
        return json(res, 500, { ok: false, error: `写记录失败：${e instanceof Error ? e.message : String(e)}` });
      }
      return json(res, 200, { ok: true, path: LOG_PATH });
    });
    return;
  }

  // 提交并推送：只提交密文那一个文件，不碰工作区里其他改动
  if (req.method === 'POST' && url.pathname === '/commit') {
    void (async () => {
      const rel = path.relative(root, TARGET).replace(/\\/g, '/');
      const steps = [];
      const run = (args) =>
        new Promise((resolve) => {
          execFile('git', args, { cwd: root, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({ ok: !err, out: `${stdout}${stderr}`.trim() });
          });
        });

      const add = await run(['add', '--', rel]);
      steps.push({ cmd: `git add -- ${rel}`, ...add });
      if (!add.ok) return json(res, 200, { ok: false, steps, note: 'git add 失败' });

      const staged = await run(['diff', '--cached', '--name-only', '--', rel]);
      if (!staged.out.trim()) {
        steps.push({ cmd: 'git status', ok: true, out: '密文与仓库里的一致，不需要提交。' });
        return json(res, 200, { ok: true, steps, note: '没有变化，未提交' });
      }

      const commit = await run([
        'commit',
        '-m',
        'chore: 更新保险箱密文（本地生成器写入）',
        '-m',
        'Co-Authored-By: Claude Code <noreply@anthropic.com>',
      ]);
      steps.push({ cmd: 'git commit', ...commit });
      if (!commit.ok) return json(res, 200, { ok: false, steps, note: 'git commit 失败' });

      const push = await run(['push']);
      steps.push({ cmd: 'git push', ...push });
      return json(res, 200, {
        ok: push.ok,
        steps,
        note: push.ok
          ? '已提交并推送到 GitHub'
          : '提交成功，但推送失败 —— 多半是网络到 GitHub 又断了。过一会儿再点一次即可（本地已经提交好了）。',
      });
    })();
    return;
  }

  json(res, 404, { ok: false, error: '没有这个路径' });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log('\n保险箱生成器（本地界面）');
  console.log(`  地址：${url}`);
  console.log(`  密文会写进：${path.relative(root, TARGET).replace(/\\/g, '/')}（这个会提交到 GitHub）`);
  console.log(`  明文记录（可选）：${LOG_PATH}`);
  console.log('    ↑ 仓库之外，不会被提交。默认不写，要写就在页面上勾一下。');
  console.log('  这个服务只监听本机（127.0.0.1），也不会被部署 —— 它在 scripts/ 下，不进 dist。');
  console.log('  用完按 Ctrl+C 关掉即可。\n');
  // 顺手打开默认浏览器（打不开也不影响，手动访问上面的地址就行）
  const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(opener, () => {});
});
