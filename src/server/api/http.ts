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

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, status);
}

export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    // 用 text() 再 parse：比 json() 更容易在失败时定位空 body / 编码问题
    const text = await request.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    console.error('[api] 请求体不是合法 JSON', error);
    return null;
  }
}
