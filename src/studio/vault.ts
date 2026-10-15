/**
 * 保险箱：从站点上取加密后的令牌，用账号+密码在现场解开
 *
 * 【分工】密文放在仓库里的数据文件 `public/studio/vault.json`（跟着站点一起发布，
 * 所以任何设备打开后台都能拿到同一份）；**生成密文在你自己电脑上做**
 * （`node scripts/vault.mjs`），不在公网的程序里 —— 公网上只放"解不开的密文"，
 * 不放"能生成密文的东西"。
 *
 * 【为什么公开密文是安全的】因为密钥不是你我能定义的，也不是从密文推出来的：
 *   口令（账号 + 密码）──PBKDF2（60 万次）──▶ 密钥 ──AES-GCM──▶ 解出令牌
 * 拿到密文 + 知道算法（这俩都是公开的）都还不够，必须知道口令。这是密码学的
 * 基本原则：唯一需要保密的只有密钥。
 *
 * 【所以代价是】密文公开 ⇒ 攻击门槛从"要先碰到你的电脑"降到"任何人都能下载下来
 * 慢慢试"。口令（账号那一半 + 密码那一半）就是唯一的防线，必须够强。
 *
 * 【它防住什么、防不住什么】
 *   防住：别人下载到密文、翻你的浏览器存储 —— 都没有口令，解不开。
 *   防不住：解锁期间内存里能读到令牌的东西（恶意扩展、被入侵的页面）；
 *           口令太弱被离线暴力破解 —— 口令强度就是这把锁的全部强度。
 *
 * 【"账号 + 密码"是什么】它不是一个登录系统：后台没有账号数据库，没有任何东西被
 * 验证，账号也不参与任何查询。它只是把一个长口令拆成两半让你分开记住：
 *   口令 = 账号 + NUL + 密码   （NUL 在输入框里打不出来，不会撞）
 * 唯一真实的增益：**光有密码不够** —— 密码在别处泄露了，还得知道账号那一半。
 * 代价：两半都要完全一致（大小写、空格），差一个字符就解不开，且无法找回。
 */

export interface VaultBlob {
  v: 2;
  /** PBKDF2 迭代次数。写进密文里，将来调高也能解开旧的 */
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

/** 密文文件的位置（跟着站点走） */
export const VAULT_URL = '/studio/vault.json';

/** 更早的版本把令牌明文存在浏览器里 —— 启动时清掉 */
const LEGACY_KEY = 'yesheng-studio-token';

/**
 * 两半之间的分隔符 —— NUL 在输入框里打不出来，所以不会撞。
 * 换成空格之类就会出歧义：账号「a b」+ 密码「c」与账号「a」+ 密码「b c」
 * 会拼成同一个口令，那两对不同的人就能互相解开彼此的密文。
 * 这里写成转义而不是塞一个真正的 NUL 字节：源码里藏不可见字符，编辑器与 diff 都会踩坑。
 * scripts/vault.mjs 里必须用同样的值，否则两边对不上。
 */
const SEP = '\u0000';

/** OWASP 现行建议：PBKDF2-SHA256 迭代 60 万次 */
const DEFAULT_ITERATIONS = 600_000;

const unb64 = (text: string): Uint8Array => {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * 取站点上的密文文件。没有（HTTP 404）返回 null —— 此时后台显示令牌登录页。
 *
 * 带一个时间戳参数：不然浏览器或主机的缓存会给出旧密文，你换了令牌却还是登不进去
 * （密文换了但页面拿的是缓存 —— 这种问题最难查）。
 */
export async function fetchVault(): Promise<VaultBlob | null> {
  try {
    const res = await fetch(`${VAULT_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = (await res.json()) as VaultBlob;
    if (typeof blob.ct !== 'string' || typeof blob.salt !== 'string') return null;
    return blob;
  } catch {
    return null;
  }
}

/** 用账号 + 密码解开密文拿回令牌；任一半不对都会抛错（AES-GCM 的认证标签校验失败） */
export async function unlockVault(blob: VaultBlob, account: string, password: string): Promise<string> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(account + SEP + password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: unb64(blob.salt) as BufferSource,
      iterations: blob.iterations || DEFAULT_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(blob.iv) as BufferSource } as AesGcmParams,
    key,
    unb64(blob.ct) as BufferSource
  );
  return new TextDecoder().decode(plain);
}

/**
 * 取出更早版本明文存的令牌并立即删除。
 * 返回非 null 表示这台机器上曾经明文存过令牌 —— 调用方提示一句，让用户知道它被清了。
 */
export function takeLegacyToken(): string | null {
  const old = localStorage.getItem(LEGACY_KEY);
  if (old) localStorage.removeItem(LEGACY_KEY);
  return old;
}
