import type Database from "better-sqlite3";
import { LATEST_SCHEMA_VERSION, MIGRATION_STEPS } from "@vittaz/core";
export { LATEST_SCHEMA_VERSION } from "@vittaz/core";
export interface MigrateOptions {
  targetVersion?: number;
}
export interface MigrateResult {
  previousVersion: number;
  currentVersion: number;
  applied: number[];
}

export function getCurrentSchemaVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}
export function migrate(
  db: Database.Database,
  options: MigrateOptions = {},
): MigrateResult {
  const target = options.targetVersion ?? LATEST_SCHEMA_VERSION;
  if (!Number.isInteger(target) || target < 0 || target > LATEST_SCHEMA_VERSION)
    throw new Error("invalid_schema_target");
  if (db.inTransaction) throw new Error("migration_requires_idle_connection");
  const previousVersion = getCurrentSchemaVersion(db);
  if (previousVersion > LATEST_SCHEMA_VERSION)
    throw new Error("schema_newer_than_supported");
  if (target < previousVersion)
    throw new Error("schema_downgrade_not_supported");
  const applied: number[] = [];
  for (const step of MIGRATION_STEPS) {
    if (step.version <= previousVersion || step.version > target) continue;
    db.transaction(() => {
      db.exec(step.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(step.version, step.name, new Date().toISOString());
      db.pragma("user_version = " + step.version);
    }).immediate();
    applied.push(step.version);
  }
  return {
    previousVersion,
    currentVersion: getCurrentSchemaVersion(db),
    applied,
  };
}
