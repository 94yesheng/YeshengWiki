/**
 * /studio/ 的传输层：实现 Github 的那些方法，但底层是 /api/fs。
 *
 * 继承 Github 只是为了让现有 content.ts / views 的 `gh: Github` 类型原样复用；
 * 父类的 token/request 永远不会被调用。
 */
import { Github, type DirEntry, type RemoteFile } from './github';

async function errorOf(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `请求失败（HTTP ${res.status}）`;
  } catch {
    return `请求失败（HTTP ${res.status}）`;
  }
}

export class ApiGithub extends Github {
  /** listDir 预取缓存：消除打开后台或保存时的 N+1 瀑布流请求 */
  private readonly prefetchCache = new Map<string, RemoteFile>();

  constructor(private readonly csrf: string) {
    super('', { owner: 'local', repo: 'local', branch: 'main' });
  }

  private fsUrl(path: string, extra = ''): string {
    return `/api/fs?path=${encodeURIComponent(path)}${extra}`;
  }

  async getFile(path: string): Promise<RemoteFile | null> {
    const cached = this.prefetchCache.get(path);
    if (cached) {
      this.prefetchCache.delete(path);
      return cached;
    }
    const res = await fetch(this.fsUrl(path), { headers: { 'X-CSRF-Token': this.csrf } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorOf(res));
    return (await res.json()) as RemoteFile;
  }

  async getBinary(path: string): Promise<{ bytes: Uint8Array; sha: string } | null> {
    const res = await fetch(this.fsUrl(path, '&binary=1'), {
      headers: { 'X-CSRF-Token': this.csrf },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await errorOf(res));
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      sha: res.headers.get('X-File-Sha') ?? '',
    };
  }

  async listDir(dir: string): Promise<DirEntry[]> {
    const res = await fetch(this.fsUrl(dir, '&list=1'), {
      headers: { 'X-CSRF-Token': this.csrf },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(await errorOf(res));
    const data = (await res.json()) as {
      entries?: Array<DirEntry & { text?: string }>;
    };
    const entries = Array.isArray(data.entries) ? data.entries : [];
    for (const entry of entries) {
      if (typeof entry.text === 'string') {
        this.prefetchCache.set(entry.path, {
          path: entry.path,
          sha: entry.sha,
          text: entry.text,
        });
      }
    }
    return entries.map(({ name, path, sha, type }) => ({ name, path, sha, type }));
  }

  async putText(
    path: string,
    text: string,
    commitMessage: string,
    sha?: string,
    fromPath?: string
  ): Promise<void> {
    this.prefetchCache.delete(path);
    if (fromPath) this.prefetchCache.delete(fromPath);
    const res = await fetch(this.fsUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf },
      body: JSON.stringify({
        text,
        message: commitMessage,
        sha,
        ...(fromPath ? { fromPath } : {}),
      }),
    });
    if (!res.ok) throw new Error(await errorOf(res));
  }

  async putBinary(
    path: string,
    bytes: Uint8Array,
    _commitMessage: string,
    sha?: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': this.csrf,
    };
    if (sha) headers['X-File-Sha'] = sha;
    const res = await fetch(this.fsUrl(path, '&binary=1'), {
      method: 'PUT',
      headers,
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
    if (!res.ok) throw new Error(await errorOf(res));
  }

  async deleteFile(path: string, sha: string, commitMessage: string): Promise<void> {
    this.prefetchCache.delete(path);
    const res = await fetch(this.fsUrl(path), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf },
      body: JSON.stringify({ sha, message: commitMessage }),
    });
    if (!res.ok) throw new Error(await errorOf(res));
  }

  async whoAmI(): Promise<{ login: string }> {
    const res = await fetch('/api/auth/me', { headers: { 'X-CSRF-Token': this.csrf } });
    if (!res.ok) throw new Error(await errorOf(res));
    const data = (await res.json()) as { user?: { username?: string } };
    return { login: data.user?.username ?? 'admin' };
  }
}
