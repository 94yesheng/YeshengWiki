/**
 * GitHub Contents API 的最小客户端
 *
 * 后台不经过任何服务器：浏览器拿着你自己的访问令牌直接调 api.github.com。
 * 之所以可行，是因为 api.github.com 支持跨域请求，而且它走的是另一条通道 ——
 * 实测这台机器上 github.com:443 会被间歇阻断，但 api.github.com 一直稳定。
 *
 * 只实现内容读写需要的几个动作。刻意不做"整树替换"之类的大动作：
 * 每次保存只 PUT 一个文件，diff 干净、出错影响面小。
 *
 * 令牌的权限边界（在 GitHub 上生成时设定）：fine-grained、只授权这一个私有仓库、
 * 只给 Contents: Read and write。所以这里连"改 .github/workflows"都做不到 ——
 * 那正是我们要的：后台碰不到 CI 与 Secrets。
 */

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface RemoteFile {
  /** 文件的 UTF-8 文本内容 */
  text: string;
  /** 提交时要用它做乐观锁：远端变过就会被拒绝（409） */
  sha: string;
  path: string;
}

export interface DirEntry {
  name: string;
  path: string;
  sha: string;
  /** 'file' | 'dir' */
  type: string;
}

/** 请求失败时抛这个，便于 UI 分辨"令牌不对""权限不足""文件被别人改过" */
export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly hint?: string
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

const API = 'https://api.github.com';

/** Uint8Array → base64（不用 btoa 直接处理二进制，避免 Latin-1 误码） */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // 分块，避免参数过多导致栈溢出
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Github {
  constructor(
    private readonly token: string,
    private readonly ref: RepoRef,
    /** 便于测试时指向本地假服务；默认就是真 GitHub */
    private readonly base = API
  ) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /** 把 HTTP 状态翻译成"人话 + 怎么办" */
  private fail(status: number, detail?: string): GithubError {
    if (status === 401)
      return new GithubError('令牌无效或已过期', status, '回 GitHub 重新生成一个细粒度令牌，注意要给 Contents 的读+写权限');
    if (status === 403)
      return new GithubError('令牌权限不足', status, '检查令牌是否勾了 Contents: Read and write，以及是否包含了这个仓库');
    if (status === 404)
      return new GithubError('找不到仓库或路径', status, '确认令牌的 Repository access 里有 YeshengWiki；私有仓库未授权时 GitHub 一律返回 404');
    if (status === 409 || status === 422)
      return new GithubError('远端文件已经被改过', status, '可能是别处改了这个文件。刷新页面重新加载后再改，避免覆盖别人的改动');
    return new GithubError(detail || `请求失败（HTTP ${status}）`, status);
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.base}${path}`, { ...init, headers: { ...this.headers(), ...(init?.headers ?? {}) } });
    return res;
  }

  /** 读一个文件的文本；不存在返回 null（GitHub 对私有仓库未授权也返回 404） */
  async getFile(path: string): Promise<RemoteFile | null> {
    const res = await this.request(`/repos/${this.ref.owner}/${this.ref.repo}/contents/${path}?ref=${this.ref.branch}`);
    if (res.status === 404) return null;
    if (!res.ok) throw this.fail(res.status);
    const data = (await res.json()) as { content?: string; sha: string; encoding?: string };
    if (typeof data.content !== 'string') return null; // 目录
    const bytes = base64ToBytes(data.content);
    return { text: new TextDecoder().decode(bytes), sha: data.sha, path };
  }

  /** 列目录（GitHub 不分页上限 1000 条，我们的目录远小于这个数） */
  async listDir(dir: string): Promise<DirEntry[]> {
    const res = await this.request(`/repos/${this.ref.owner}/${this.ref.repo}/contents/${dir}?ref=${this.ref.branch}`);
    if (res.status === 404) return [];
    if (!res.ok) throw this.fail(res.status);
    const data = (await res.json()) as Array<{ name: string; path: string; sha: string; type: string }>;
    if (!Array.isArray(data)) return [];
    return data.map((d) => ({ name: d.name, path: d.path, sha: d.sha, type: d.type }));
  }

  /** 写文本文件。传 sha 表示"更新已有文件"，不传表示新建 */
  async putText(path: string, text: string, commitMessage: string, sha?: string): Promise<void> {
    const body = {
      message: commitMessage,
      content: bytesToBase64(new TextEncoder().encode(text)),
      branch: this.ref.branch,
      ...(sha ? { sha } : {}),
    };
    const res = await this.request(`/repos/${this.ref.owner}/${this.ref.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw this.fail(res.status, detail.slice(0, 300));
    }
  }

  /** 写二进制文件（图片上传走这个） */
  async putBinary(path: string, bytes: Uint8Array, commitMessage: string, sha?: string): Promise<void> {
    const body = {
      message: commitMessage,
      content: bytesToBase64(bytes),
      branch: this.ref.branch,
      ...(sha ? { sha } : {}),
    };
    const res = await this.request(`/repos/${this.ref.owner}/${this.ref.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw this.fail(res.status);
  }

  async deleteFile(path: string, sha: string, commitMessage: string): Promise<void> {
    const res = await this.request(`/repos/${this.ref.owner}/${this.ref.repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: commitMessage, sha, branch: this.ref.branch }),
    });
    if (!res.ok) throw this.fail(res.status);
  }

  /** 拿当前用户，用来在登录时验证令牌是否可用 */
  async whoAmI(): Promise<{ login: string }> {
    const res = await this.request('/user');
    if (!res.ok) throw this.fail(res.status);
    return (await res.json()) as { login: string };
  }
}
