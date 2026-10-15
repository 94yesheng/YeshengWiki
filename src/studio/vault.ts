/**
 * 令牌的加密存储（"保险箱"）
 *
 * 【为什么不是"把账号密码算成密钥"】
 * 有人会想：能不能用账号密码通过一个算法直接算出密钥，这样什么都不用存？
 * 不行 —— 密钥不是你我能定义的。api.github.com 只认 GitHub 自己签发的令牌
 * （访问令牌或 OAuth 授权码），我们算出来的任何字符串它都不认识；而且 GitHub
 * 2021 年就关闭了"用账号密码调 API"的方式。
 *
 * 【这里做的是：用口令把令牌锁起来】
 *   口令（账号 + 密码两半拼起来）──PBKDF2 派生──▶ 加密密钥（不存，每次现算）
 *   令牌 ──AES-GCM 加密──▶ 密文（存浏览器）
 * 本机只留密文。打开后台时输一次账号和密码，现场派生密钥解开它。
 * 全程用浏览器自带的 WebCrypto，不引第三方库，密码与令牌都不外发。
 *
 * 【"账号 + 密码"到底是什么】
 * 它**不是一个登录系统** —— 没有任何东西被验证，账号也不参与任何查询。它只是把一个
 * 长口令拆成两半让你分开记住：
 *   口令 = 账号 + NUL + 密码   （NUL 是分隔符，输入框里打不出来）
 * 所以它带来的安全性 = "一个总长度更长的口令"，不多不少。
 * 唯一的真实增益：**光有密码不够** —— 密码在别处泄露了，还得知道账号那一半。
 * 代价：拼错一个字符（大小写、空格）就解不开，而且没有任何找回途径。
 *
 * 【它防住什么、防不住什么】
 *   防住：别人翻你电脑/浏览器存储 —— 只看到密文；电脑丢了也一样。
 *   防不住：解锁期间内存里能读到令牌的东西（恶意扩展、被入侵的页面）；
 *           口令太弱被离线暴力破解 —— 口令强度就是这把锁的全部强度。
 */

export interface VaultBlob {
  /** 2 = 账号+密码两半；1 = 旧版单密码（启动时会被清除并要求重新登录） */
  v: 2;
  /** PBKDF2 迭代次数，写进密文里，将来调高也能解开旧的 */
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

const VAULT_KEY = 'yesheng-studio-vault';
/** 更早的版本把令牌明文存在浏览器里 —— 启动时会清掉并提示重新登录 */
const LEGACY_KEY = 'yesheng-studio-token';

/** OWASP 现行建议：PBKDF2-SHA256 迭代 60 万次 */
const ITERATIONS = 600_000;

/**
 * 两半之间的分隔符 —— NUL 在输入框里打不出来，所以不会撞。
 * 换成空格之类就会出歧义：账号「a b」+ 密码「c」与账号「a」+ 密码「b c」
 * 会拼成同一个口令，那两对不同的人就能互相解开彼此的密文。
 * 这里写成转义而不是塞一个真正的 NUL 字节：源码里藏不可见字符，
 * 编辑器、diff、以后的维护都会踩坑。
 */
const SEP = '\u0000';

/** 把两半拼成派生用的口令 */
function passphrase(account: string, password: string): string {
  return account + SEP + password;
}

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (text: string): Uint8Array => {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function deriveKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** 用口令（账号+密码）把令牌加密后存进浏览器 */
export async function saveVault(token: string, account: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase(account, password), salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(token)
  );
  const blob: VaultBlob = {
    v: 2,
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(new Uint8Array(ct)),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

/** 本机存的是哪一版的密文：'v2' | 'v1'（旧版单密码，需要重新登录） | null（没有） */
export function vaultVersion(): 'v2' | 'v1' | null {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as { v?: number; ct?: string };
    if (typeof blob.ct !== 'string') return null;
    return blob.v === 2 ? 'v2' : 'v1';
  } catch {
    return null;
  }
}

export function hasVault(): boolean {
  return vaultVersion() === 'v2';
}

/** 用账号+密码解开密文拿回令牌；任一半不对都会抛错（AES-GCM 的认证标签校验失败） */
export async function unlockVault(account: string, password: string): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error('本机没有保存过令牌');
  const blob = JSON.parse(raw) as VaultBlob;
  const key = await deriveKey(passphrase(account, password), unb64(blob.salt), blob.iterations || ITERATIONS);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(blob.iv) as BufferSource } as AesGcmParams,
    key,
    unb64(blob.ct) as BufferSource
  );
  return new TextDecoder().decode(plain);
}

/** 忘掉本机的令牌（连密文一起删） */
export function clearVault(): void {
  localStorage.removeItem(VAULT_KEY);
}

/**
 * 取出更早版本明文存的令牌并立即删除。
 * 返回非 null 表示这台机器上曾经明文存过令牌 —— 调用方应当提示重新登录一遍。
 */
export function takeLegacyToken(): string | null {
  const old = localStorage.getItem(LEGACY_KEY);
  if (old) localStorage.removeItem(LEGACY_KEY);
  return old;
}
