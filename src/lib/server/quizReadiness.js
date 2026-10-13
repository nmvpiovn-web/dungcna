// src/lib/server/quizReadiness.js
// Cloudflare D1 schema & migration ledger readiness verification for Quiz module
// Implements Fail-Closed Security: Safe masking for students/guests, actionable diagnostics for staff.

import { isStaffUser } from './auth.js';

export const REQUIRED_QUIZ_TABLES = [
  'quizzes',
  'quiz_questions',
  'quiz_builder_defaults',
  'quiz_question_sources',
  'quiz_bundle_sync_locks',
  'quiz_bundle_sync_events'
];

export const REQUIRED_QUIZ_QUESTION_COLUMNS = [
  'source_type',
  'source_id'
];

export const REQUIRED_QUIZ_MIGRATIONS = [
  '0018_knowledge_fts_triggers_backfill.sql',
  '0019_seed_public_quiz_catalog.sql',
  '0020_quiz_question_provenance.sql',
  '0021_quiz_auto_builder_defaults.sql',
  '0022_quiz_bundle_sync_phase3.sql'
];

export const REMEDIATION_CODE_REMOTE = 'npx wrangler d1 migrations apply tienganh-pro-db --remote';
export const REMEDIATION_CODE_LOCAL = 'npx wrangler d1 migrations apply tienganh-pro-db --local';

// WeakMap per DB instance to strictly isolate readiness caches across different databases
let dbReadinessWeakMap = new WeakMap();
const READINESS_CACHE_TTL_MS = 15_000;
const MAX_READINESS_CACHE_PER_DB = 10;
let globalFallbackCache = new Map();

export function clearQuizReadinessCache() {
  dbReadinessWeakMap = new WeakMap();
  globalFallbackCache.clear();
}

/**
 * Inspect D1 database for quiz module tables, columns, migrations ledger, and catalog seeds.
 * Returns detailed diagnostic for staff, or a safely masked status for students and guests.
 * Separates schema_ready from catalog_empty and uses a bounded WeakMap cache per DB instance.
 *
 * @param {object} platform Cloudflare platform object containing env.DB
 * @param {object|null} authUser User object from verifyServerAuth, or null if guest
 * @param {object} [options] Cache bypass options
 * @returns {Promise<object>} Readiness result
 */
export async function checkQuizReadiness(platform, authUser = null, options = { bypassCache: false }) {
  const isStaff = isStaffUser(authUser);
  const db = platform?.env?.DB;

  if (!db) {
    const unavail = isStaff ? {
      ready: false,
      schema_ready: false,
      catalog_empty: true,
      status: 'database_unavailable',
      is_staff: true,
      missing_tables: [...REQUIRED_QUIZ_TABLES],
      missing_columns: [...REQUIRED_QUIZ_QUESTION_COLUMNS],
      missing_migrations: [...REQUIRED_QUIZ_MIGRATIONS],
      published_count: 0,
      catalog_seeded: false,
      remediation_code: REMEDIATION_CODE_REMOTE,
      message: 'Lỗi cấu hình hệ thống: Không tìm thấy binding cơ sở dữ liệu Cloudflare D1 (DB).'
    } : {
      ready: false,
      schema_ready: false,
      catalog_empty: true,
      status: 'maintenance',
      is_staff: false,
      message: 'Hệ thống Quiz đang tạm dừng để bảo trì. Vui lòng quay lại sau.'
    };
    return unavail;
  }

  // Get or initialize DB-isolated cache
  let dbCache;
  if (typeof db === 'object' && db !== null) {
    dbCache = dbReadinessWeakMap.get(db);
    if (!dbCache) {
      dbCache = new Map();
      dbReadinessWeakMap.set(db, dbCache);
    }
  } else {
    dbCache = globalFallbackCache;
  }

  const roleKey = isStaff ? 'staff' : 'public';
  if (!options?.bypassCache && dbCache.has(roleKey)) {
    const entry = dbCache.get(roleKey);
    if (Date.now() - entry.timestamp < READINESS_CACHE_TTL_MS) {
      return entry.data;
    }
  }

  function setCached(result) {
    if (dbCache.size >= MAX_READINESS_CACHE_PER_DB) {
      const oldestKey = dbCache.keys().next().value;
      dbCache.delete(oldestKey);
    }
    dbCache.set(roleKey, { timestamp: Date.now(), data: result });
    return result;
  }

  try {
    // 1. Inspect existing tables
    const tablesRes = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" +
      REQUIRED_QUIZ_TABLES.map(() => '?').join(', ') + ")"
    ).bind(...REQUIRED_QUIZ_TABLES).all();

    const existingTables = new Set((tablesRes?.results || []).map(r => r.name));
    const missingTables = REQUIRED_QUIZ_TABLES.filter(t => !existingTables.has(t));

    // 2. Inspect quiz_questions columns if table exists
    const missingColumns = [];
    if (existingTables.has('quiz_questions')) {
      const colRes = await db.prepare("PRAGMA table_info(quiz_questions)").all();
      const existingCols = new Set((colRes?.results || []).map(r => r.name));
      for (const col of REQUIRED_QUIZ_QUESTION_COLUMNS) {
        if (!existingCols.has(col)) {
          missingColumns.push(col);
        }
      }
    } else {
      missingColumns.push(...REQUIRED_QUIZ_QUESTION_COLUMNS);
    }

    // 3. Inspect applied migrations from d1_migrations
    let missingMigrations = [];
    let d1MigrationsTableExists = true;
    try {
      const migRes = await db.prepare(
        "SELECT name FROM d1_migrations WHERE name IN (" +
        REQUIRED_QUIZ_MIGRATIONS.map(() => '?').join(', ') + ")"
      ).bind(...REQUIRED_QUIZ_MIGRATIONS).all();
      const appliedMigNames = new Set((migRes?.results || []).map(r => r.name));
      missingMigrations = REQUIRED_QUIZ_MIGRATIONS.filter(m => !appliedMigNames.has(m));
    } catch {
      d1MigrationsTableExists = false;
      missingMigrations = [...REQUIRED_QUIZ_MIGRATIONS];
    }

    // 4. Inspect published quizzes count
    let publishedCount = 0;
    if (existingTables.has('quizzes')) {
      try {
        const countRes = await db.prepare(
          "SELECT COUNT(*) AS total FROM quizzes WHERE status = 'published'"
        ).first();
        publishedCount = Number(countRes?.total || 0);
      } catch {
        publishedCount = 0;
      }
    }

    const catalogSeeded = publishedCount > 0 || (d1MigrationsTableExists && !missingMigrations.includes('0019_seed_public_quiz_catalog.sql'));
    const schemaReady = missingTables.length === 0 &&
                        missingColumns.length === 0 &&
                        missingMigrations.length === 0;
    const catalogEmpty = publishedCount === 0;

    if (schemaReady && !catalogEmpty) {
      return setCached({
        ready: true,
        schema_ready: true,
        catalog_empty: false,
        status: 'ready',
        is_staff: isStaff,
        published_count: publishedCount,
        catalog_seeded: true,
        message: 'Hệ thống Quiz đã sẵn sàng hoạt động.'
      });
    }

    if (schemaReady && catalogEmpty) {
      return setCached({
        ready: true,
        schema_ready: true,
        catalog_empty: true,
        status: 'catalog_empty',
        is_staff: isStaff,
        published_count: 0,
        catalog_seeded: catalogSeeded,
        message: isStaff
          ? 'Cơ sở dữ liệu Quiz đã sẵn sàng (đã áp dụng migrations), hiện chưa có bài quiz nào được xuất bản trong danh mục.'
          : 'Hiện tại chưa có bài quiz nào được xuất bản.'
      });
    }

    // Unready state: distinguish staff vs guest/student
    if (isStaff) {
      const failureReasons = [];
      if (missingMigrations.length > 0) failureReasons.push(`Chưa chạy ${missingMigrations.length} migrations (${missingMigrations.join(', ')})`);
      if (missingTables.length > 0) failureReasons.push(`Thiếu ${missingTables.length} bảng (${missingTables.join(', ')})`);
      if (missingColumns.length > 0) failureReasons.push(`Thiếu cột quiz_questions(${missingColumns.join(', ')})`);
      if (publishedCount === 0 && !catalogSeeded) failureReasons.push('Chưa có bài quiz nào được xuất bản trong danh mục công khai (0019 seed)');

      return setCached({
        ready: false,
        schema_ready: false,
        catalog_empty: catalogEmpty,
        status: 'schema_unmigrated',
        is_staff: true,
        missing_tables: missingTables,
        missing_columns: missingColumns,
        missing_migrations: missingMigrations,
        published_count: publishedCount,
        catalog_seeded: catalogSeeded,
        remediation_code: REMEDIATION_CODE_REMOTE,
        remediation_instructions: `Vui lòng chạy lệnh sau trên terminal để áp dụng toàn bộ migrations còn thiếu lên Cloudflare D1:\n${REMEDIATION_CODE_REMOTE}`,
        message: `Cơ sở dữ liệu Quiz chưa hoàn tất migrations: ${failureReasons.join('; ')}.`
      });
    }

    // Safe non-staff response: zero leaked schema details, no SQL commands
    return setCached({
      ready: false,
      schema_ready: false,
      catalog_empty: catalogEmpty,
      status: 'maintenance',
      is_staff: false,
      message: 'Hệ thống bài tập trắc nghiệm đang trong quá trình đồng bộ và cập nhật dữ liệu. Bạn vui lòng quay lại sau ít phút nhé!'
    });
  } catch (err) {
    console.error('checkQuizReadiness error:', err);
    if (isStaff) {
      return setCached({
        ready: false,
        schema_ready: false,
        catalog_empty: true,
        status: 'error',
        is_staff: true,
        missing_tables: [...REQUIRED_QUIZ_TABLES],
        missing_columns: [...REQUIRED_QUIZ_QUESTION_COLUMNS],
        missing_migrations: [...REQUIRED_QUIZ_MIGRATIONS],
        published_count: 0,
        catalog_seeded: false,
        remediation_code: REMEDIATION_CODE_REMOTE,
        message: 'Lỗi kiểm tra trạng thái cơ sở dữ liệu Quiz: ' + (err?.message || String(err))
      });
    }
    return setCached({
      ready: false,
      schema_ready: false,
      catalog_empty: true,
      status: 'maintenance',
      is_staff: false,
      message: 'Hệ thống Quiz đang tạm dừng để bảo trì. Vui lòng quay lại sau.'
    });
  }
}
