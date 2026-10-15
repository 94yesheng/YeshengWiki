/**
 * 令牌的加密存储（"保险箱"）
 *
 * 【为什么不是"把账号密码算成密钥"】
 * 有人会想：能不能用账号密码通过一个算法直接算出密钥，这样什么都不用存？
 * 不行 —— 密钥不是你我能定义的。api.github.com 只认 GitHub 自己签发的令牌
 * （访问令牌或 OAuth 授权码），我们算出来的任何字符串它都不认识；而且 GitHub
 * 2021 年就关闭了"用账号密码调 API"的方式。所以在浏览器这一侧，"算出密钥"
 * 没有接口能接住。
 *
 * 【所以这里做的是另一件事：用密码把令牌锁起来】
 *   密码 ──PBKDF2 派生──▶ 加密密钥（不存储，每次现算）
 *   令牌 ──AES-GCM 加密──▶ 密文（存浏览器）
 * 本机只留密文，密码本身不存。打开后台时输一次密码，现场派生密钥解开它。
 * 这和密码管理器是同一个做法，用的是浏览器自带的 WebCrypto，不引第三方库，
 * 也把密钥派生全程留在本地。
 *
 * 【它防住什么、防不住什么】（这两个都要说清楚）
 *   防住：别人翻你电脑/浏览器存储 —— 只看到密文；电脑丢了也一样。
 *   防不住：解锁期间在内存里能读到令牌的东西（恶意扩展、被入侵的页面）；
 *           密码太弱被离线暴力破解 —— 所以密码强度就是这把锁的全部强度。
 */

export interface VaultBlob {
  v: 1;
  /** PBKDF2 迭代次数，写进密文里，将来调高也能解开旧的 */
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

/** 加密后的令牌 */
const VAULT_KEY = 'yesheng-studio-vault';
/** 旧版本明文存的令牌 —— 启动时会被清掉，并提示重新登录 */
const LEGACY_KEY = 'yesheng-studio-token';

/** OWASP 现行建议：PBKDF2-SHA256 迭代 60 万次 */
const ITERATIONS = 600_000;

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

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
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

/** 用密码把令牌加密后存进浏览器 */
export async function saveVault(token: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(token));
  const blob: VaultBlob = {
    v: 1,
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(new Uint8Array(ct)),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

export function hasVault(): boolean {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return false;
  try {
    const blob = JSON.parse(raw) as VaultBlob;
    return typeof blob.ct === 'string' && typeof blob.salt === 'string';
  } catch {
    return false;
  }
}

/** 用密码解开密文拿回令牌；密码不对会抛错（AES-GCM 的认证标签校验失败） */
export async function unlockVault(password: string): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error('本机没有保存过令牌');
  const blob = JSON.parse(raw) as VaultBlob;
  const key = await deriveKey(password, unb64(blob.salt), blob.iterations || ITERATIONS);
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
 * 取出旧版本明文存的令牌并立即删除。
 * 返回非 null 表示这台机器上曾经明文存过令牌 —— 调用方应当提示重新登录一遍。
 */
export function takeLegacyToken(): string | null {
  const old = localStorage.getItem(LEGACY_KEY);
  if (old) localStorage.removeItem(LEGACY_KEY);
  return old;
}
