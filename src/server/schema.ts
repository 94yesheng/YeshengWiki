/**
 * SQLite schema —— SQL 本体在 `db/schema.sql`。
 * 应用侧用 Vite 的 `?raw` 打进 bundle；迁移脚本直接读文件。
 */
import schemaSql from '../../db/schema.sql?raw';

export const SCHEMA_VERSION = 4;
export const SCHEMA_SQL = schemaSql;
