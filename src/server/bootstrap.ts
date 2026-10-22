/**
 * 进程级初始化：打开数据库、播种管理员、清理过期会话，并启动后台周期性清理任务。
 * 由 middleware 在首个请求时调用一次。
 */
import { cleanupExpiredSessions, ensureAdminFromEnv } from './auth';
import { getDb } from './db';

let done = false;
const SESSION_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 每 30 分钟定期清理过期会话与限流记录

export function bootstrap(): void {
  if (done) return;
  done = true;
  getDb();
  ensureAdminFromEnv();
  cleanupExpiredSessions();

  const timer = setInterval(() => {
    try {
      cleanupExpiredSessions();
    } catch (error) {
      console.error('[bootstrap] 清理过期会话失败', error);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
  timer.unref?.();
}
