/**
 * 进程级初始化：打开数据库、播种管理员、清理过期会话。
 * 由 middleware 在首个请求时调用一次。
 */
import { cleanupExpiredSessions, ensureAdminFromEnv } from './auth';
import { getDb } from './db';

let done = false;

export function bootstrap(): void {
  if (done) return;
  done = true;
  getDb();
  ensureAdminFromEnv();
  cleanupExpiredSessions();
}
