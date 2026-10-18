import { defineMiddleware } from 'astro:middleware';
import { bootstrap } from './server/bootstrap';
import { handleApi } from './server/api/router';

bootstrap();

export const onRequest = defineMiddleware(async (context, next) => {
  // /api/* 由我们自己的 router 处理（静态构建时不会用到）
  const apiResponse = await handleApi(context);
  const response = apiResponse ?? (await next());

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (context.url.pathname.startsWith('/api/') || context.url.pathname.startsWith('/studio')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});
