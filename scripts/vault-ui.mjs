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
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(root, 'scripts', 'vault-ui.html');
const TARGET = path.join(root, 'public', 'studio', 'vault.json');

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
    return json(res, 200, targetStatus());
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

  json(res, 404, { ok: false, error: '没有这个路径' });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log('\n保险箱生成器（本地界面）');
  console.log(`  地址：${url}`);
  console.log(`  密文会写进：${path.relative(root, TARGET).replace(/\\/g, '/')}`);
  console.log('  这个服务只监听本机（127.0.0.1），也不会被部署 —— 它在 scripts/ 下，不进 dist。');
  console.log('  用完按 Ctrl+C 关掉即可。\n');
  // 顺手打开默认浏览器（打不开也不影响，手动访问上面的地址就行）
  const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(opener, () => {});
});
