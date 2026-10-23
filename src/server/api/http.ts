/** API 响应小工具：统一 JSON、错误和 no-store。 */
export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function fail(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
  headers: HeadersInit = {}
): Response {
  return json({ error: message, ...extra }, status, headers);
}

const DEFAULT_MAX_JSON_BYTES = 2 * 1024 * 1024; // 默认 JSON 请求体上限 2MB

export async function readJson<T = unknown>(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES
): Promise<T | null> {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      console.warn(`[api] JSON 请求体超出限制: ${contentLength} > ${maxBytes}`);
      return null;
    }
    // 用 text() 再 parse：比 json() 更容易在失败时定位空 body / 编码问题
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      console.warn(`[api] JSON 文本字节数超出限制: > ${maxBytes}`);
      return null;
    }
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    console.error('[api] 请求体不是合法 JSON', error);
    return null;
  }
}
