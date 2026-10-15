/**
 * 本地生成"保险箱"密文 —— 在你自己电脑上跑，不在公开的程序里
 *
 * 为什么生成放在本地：后台页面是**公开部署**的。虽然密文本身公开无所谓（没有口令解不开），
 * 但"输入令牌 + 口令 → 输出密文"这个**工具**没必要也挂到公网上 —— 它只会增加暴露面。
 * 所以这台机器上生成、写进仓库，程序那边只负责拿密文解密。
 *
 * 产出的格式必须和浏览器端 src/studio/vault.ts 完全一致，否则后台解不开：
 *   { v: 2, iterations: 600000, salt, iv, ct }
 *   · 口令 = 账号 + NUL + 密码   （NUL 在输入框里打不出来，不会撞）
 *   · 密钥 = PBKDF2-SHA256（60 万次迭代）
 *   · 密文 = AES-GCM(令牌)
 * 两边都用标准的 WebCrypto，参数一致就能互通。
 *
 * 用法：node scripts/vault.mjs
 *      生成后写进 public/studio/vault.json，然后提交推送 —— 之后打开后台只需输账号密码。
 *
 * 换令牌或换口令时：再跑一次这个脚本，覆盖那个文件，提交推送。
 * 顺手在 GitHub 上把旧令牌撤销掉，旧密文就彻底没价值了。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'studio', 'vault.json');

/** 与浏览器端保持一致的参数 —— 任何一项不一致都会导致后台解不开 */
const ITERATIONS = 600_000;
const SEP = '\u0000';

/** 有终端才谈得上"不回显"；管道输入本来也不会回显 */
const TTY = Boolean(process.stdin.isTTY);

/**
 * 非终端（管道）模式：一次性把 stdin 读完，按行取用。
 * 为什么不每次现建一个 readline 接口：那样管道数据会被前一个接口吞掉，第二个问题就卡住了
 * （踩过）。一次性读完最简单也最可靠，顺便让这个脚本可以被别的东西驱动。
 */
const piped = TTY ? null : fs.readFileSync(0, 'utf8').split(/\r?\n/);
let pipedAt = 0;

/**
 * 问一个问题。hidden = true 时输入不回显（贴令牌和输密码时不该显示在屏幕上，
 * 也不该留在终端历史里）。
 */
function ask(question, { hidden = false } = {}) {
  if (piped) {
    process.stdout.write(question + (hidden ? '（管道输入）\n' : ''));
    return Promise.resolve(piped[pipedAt++] ?? '');
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // 这是 Node 里现成的"不回显"办法：把内部写回显的钩子换掉，自己打印提示语
      rl._writeToOutput = () => {};
      process.stdout.write(question);
    }
    rl.question(hidden ? '' : question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function main() {
  console.log('生成后台的加密令牌（保险箱）\n');
  console.log('提示：口令是「账号 + 密码」两半拼起来的，两半都要记住，差一个字符就解不开。');
  console.log('      账号别用站名、昵称这类能被猜到的词 —— 那样它就退化成"盐"，不提供额外强度。\n');

  const token = (await ask('访问令牌（粘贴后回车，不回显）：', { hidden: true })).trim();
  if (!token) {
    console.error('没有输入令牌，已取消');
    process.exit(1);
  }
  if (!/^(github_pat_|ghp_)/.test(token)) {
    console.log('注意：这串看起来不像 GitHub 令牌，继续也可以，但请确认没粘错。\n');
  }

  const account = await ask('解锁账号（至少 3 位）：');
  if (account.trim().length < 3) {
    console.error('账号太短，已取消');
    process.exit(1);
  }
  const password = await ask('解锁密码（至少 6 位）：', { hidden: true });
  if (password.length < 6) {
    console.error('密码太短，已取消');
    process.exit(1);
  }
  const again = await ask('再输一次密码：', { hidden: true });
  if (again !== password) {
    console.error('两次输入不一致，已取消');
    process.exit(1);
  }

  // 口令 = 账号 + NUL + 密码；账号原样使用，不做 trim、不做大小写归一
  const passphrase = account + SEP + password;
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));

  const blob = { v: 2, iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };

  // 自检：用同样的口令解一遍，确认产出的密文真的能解开（防手滑打错密码）
  const checkKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const back = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, checkKey, ct));
  if (back !== token) {
    console.error('自检失败：解出来的和输入的不一致，已取消');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(blob, null, 2) + '\n');

  console.log(`\n✓ 已写入 ${path.relative(root, OUT).replace(/\\/g, '/')}（自检通过：用同一口令能解回令牌）`);
  console.log('\n接下来：');
  console.log('  git add public/studio/vault.json && git commit -m "chore: 更新保险箱密文" && git push');
  console.log('  推送后打开后台，就只需要输账号和密码了。');
  console.log('\n注意：口令没有找回途径。忘了的话，重跑这个脚本生成一份新的即可（密文本来就是可替换的）。');
}

await main();
