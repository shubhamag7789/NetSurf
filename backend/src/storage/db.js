'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(process.cwd(), 'netsurf.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_request TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      plan TEXT,
      actions TEXT,
      results TEXT,
      error TEXT,
      recovery_attempts INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      action_data TEXT,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      duration_ms INTEGER,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      task_category TEXT NOT NULL,
      user_request_pattern TEXT NOT NULL,
      plan_template TEXT NOT NULL,
      constraints TEXT,
      successful_action_patterns TEXT,
      failure_patterns TEXT,
      verification_conditions TEXT,
      success_count INTEGER DEFAULT 1,
      last_used TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY DEFAULT 'default',
      display_name TEXT NOT NULL DEFAULT 'User',
      preferred_job_roles TEXT DEFAULT '["Software Developer", "Full Stack Developer"]',
      preferred_locations TEXT DEFAULT '["India", "Remote"]',
      experience_level TEXT DEFAULT 'Fresher',
      preferred_industries TEXT DEFAULT '["Technology", "Fintech"]',
      product_preferences TEXT DEFAULT '{"minRam": 16, "preferredBrands": ["Apple", "Lenovo"]}',
      apply_preferences_to_tasks INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default settings if not present
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  insertSetting.run('model_provider', 'gemini');
  insertSetting.run('model_name', 'gemini-1.5-flash');
  insertSetting.run('gemini_model', 'gemini-1.5-flash');
  insertSetting.run('search_provider', 'tavily');
  insertSetting.run('browser_headless', 'false');
  insertSetting.run('browser_timeout', '30000');
  insertSetting.run('max_retries', '2');
  insertSetting.run('memory_enabled', 'true');
  insertSetting.run('allowed_origins', 'http://localhost:3001');
  insertSetting.run('approval_required_actions', 'submit_form,purchase,delete,send_message');

  // Seed default user profile if not present
  db.prepare(`
    INSERT OR IGNORE INTO user_profile (id, display_name, experience_level, apply_preferences_to_tasks)
    VALUES ('default', 'Engineer', 'Fresher', 0)
  `).run();
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function createTask(id, userRequest) {
  const db = getDb();
  db.prepare(`
    INSERT INTO tasks (id, user_request, status, started_at)
    VALUES (?, ?, 'pending', datetime('now'))
  `).run(id, userRequest);
}

function updateTask(id, fields) {
  const db = getDb();
  const entries = Object.entries(fields);
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v));
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...values, id);
}

function getTask(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return row ? parseTask(row) : null;
}

function getAllTasks(limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?')
    .all(limit)
    .map(parseTask);
}

function parseTask(row) {
  return {
    ...row,
    plan: row.plan ? JSON.parse(row.plan) : null,
    actions: row.actions ? JSON.parse(row.actions) : [],
    results: row.results ? JSON.parse(row.results) : null,
  };
}

// ── Action Logs ────────────────────────────────────────────────────────────

function logAction(taskId, stepIndex, actionType, actionData, status, result, error, durationMs) {
  const db = getDb();
  db.prepare(`
    INSERT INTO action_logs (task_id, step_index, action_type, action_data, status, result, error, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    stepIndex,
    actionType,
    JSON.stringify(actionData),
    status,
    result ? JSON.stringify(result) : null,
    error || null,
    durationMs || null
  );
}

function getActionLogs(taskId) {
  const db = getDb();
  return db.prepare('SELECT * FROM action_logs WHERE task_id = ? ORDER BY step_index ASC').all(taskId).map(r => ({
    ...r,
    action_data: r.action_data ? JSON.parse(r.action_data) : null,
    result: r.result ? JSON.parse(r.result) : null,
  }));
}

// ── Memory ────────────────────────────────────────────────────────────────

function saveMemory(record) {
  const db = getDb();
  const existing = db.prepare(`
    SELECT id, success_count FROM memory
    WHERE task_category = ? AND user_request_pattern = ?
  `).get(record.task_category, record.user_request_pattern);

  if (existing) {
    db.prepare(`
      UPDATE memory
      SET plan_template = ?,
          constraints = ?,
          successful_action_patterns = ?,
          failure_patterns = ?,
          verification_conditions = ?,
          success_count = success_count + 1,
          last_used = datetime('now')
      WHERE id = ?
    `).run(
      JSON.stringify(record.plan_template),
      JSON.stringify(record.constraints || {}),
      JSON.stringify(record.successful_action_patterns || []),
      JSON.stringify(record.failure_patterns || []),
      JSON.stringify(record.verification_conditions || []),
      existing.id
    );
    return existing.id;
  }

  db.prepare(`
    INSERT INTO memory (id, task_category, user_request_pattern, plan_template, constraints,
      successful_action_patterns, failure_patterns, verification_conditions, last_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    record.id,
    record.task_category,
    record.user_request_pattern,
    JSON.stringify(record.plan_template),
    JSON.stringify(record.constraints || {}),
    JSON.stringify(record.successful_action_patterns || []),
    JSON.stringify(record.failure_patterns || []),
    JSON.stringify(record.verification_conditions || [])
  );
  return record.id;
}

function getAllMemory() {
  const db = getDb();
  return db.prepare('SELECT * FROM memory ORDER BY last_used DESC').all().map(parseMemory);
}

function getMemoryById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM memory WHERE id = ?').get(id);
  return row ? parseMemory(row) : null;
}

function deleteMemory(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM memory WHERE id = ?').run(id);
  return result.changes > 0;
}

function findRelevantMemory(taskCategory, limit = 3) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM memory
    WHERE task_category = ?
    ORDER BY success_count DESC, last_used DESC
    LIMIT ?
  `).all(taskCategory, limit).map(parseMemory);
}

function incrementMemoryUse(id) {
  const db = getDb();
  db.prepare(`
    UPDATE memory SET success_count = success_count + 1, last_used = datetime('now') WHERE id = ?
  `).run(id);
}

function parseMemory(row) {
  return {
    ...row,
    plan_template: row.plan_template ? JSON.parse(row.plan_template) : [],
    constraints: row.constraints ? JSON.parse(row.constraints) : {},
    successful_action_patterns: row.successful_action_patterns ? JSON.parse(row.successful_action_patterns) : [],
    failure_patterns: row.failure_patterns ? JSON.parse(row.failure_patterns) : [],
    verification_conditions: row.verification_conditions ? JSON.parse(row.verification_conditions) : [],
  };
}

// ── Settings ──────────────────────────────────────────────────────────────

function getSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getAllSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function setSetting(key, value) {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value));
}

// ── User Profile ──────────────────────────────────────────────────────────

function getUserProfile() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_profile WHERE id = ?').get('default');
  if (!row) return null;

  let roles = 'Software Developer';
  try {
    const parsed = JSON.parse(row.preferred_job_roles);
    roles = Array.isArray(parsed) ? (parsed[0] || 'Software Developer') : parsed;
  } catch {
    roles = row.preferred_job_roles || 'Software Developer';
  }

  let locs = 'India';
  try {
    const parsed = JSON.parse(row.preferred_locations);
    locs = Array.isArray(parsed) ? (parsed[0] || 'India') : parsed;
  } catch {
    locs = row.preferred_locations || 'India';
  }

  const applyFlag = Boolean(row.apply_preferences_to_tasks);

  return {
    id: row.id,
    display_name: row.display_name,
    preferred_job_roles: roles,
    preferred_locations: locs,
    experience_level: row.experience_level || 'Fresher',
    preferred_industries: row.preferred_industries,
    product_preferences: row.product_preferences,
    apply_profile_to_tasks: applyFlag,
    apply_preferences_to_tasks: applyFlag,
    updated_at: row.updated_at,
  };
}

function updateUserProfile(fields) {
  const db = getDb();
  const current = getUserProfile() || {};
  const updated = { ...current, ...fields };

  const roles = typeof updated.preferred_job_roles === 'string'
    ? updated.preferred_job_roles
    : JSON.stringify(updated.preferred_job_roles || []);

  const locs = typeof updated.preferred_locations === 'string'
    ? updated.preferred_locations
    : JSON.stringify(updated.preferred_locations || []);

  const applyVal = (updated.apply_profile_to_tasks !== undefined)
    ? (updated.apply_profile_to_tasks ? 1 : 0)
    : (updated.apply_preferences_to_tasks ? 1 : 0);

  db.prepare(`
    UPDATE user_profile
    SET display_name = ?,
        preferred_job_roles = ?,
        preferred_locations = ?,
        experience_level = ?,
        preferred_industries = ?,
        product_preferences = ?,
        apply_preferences_to_tasks = ?,
        updated_at = datetime('now')
    WHERE id = 'default'
  `).run(
    updated.display_name || 'User',
    roles,
    locs,
    updated.experience_level || 'Fresher',
    typeof updated.preferred_industries === 'string' ? updated.preferred_industries : JSON.stringify(updated.preferred_industries || []),
    typeof updated.product_preferences === 'string' ? updated.product_preferences : JSON.stringify(updated.product_preferences || {}),
    applyVal
  );
  return getUserProfile();
}

// ── Saved Searches ────────────────────────────────────────────────────────

function getSavedSearches() {
  const db = getDb();
  return db.prepare('SELECT * FROM saved_searches ORDER BY created_at DESC').all();
}

function addSavedSearch(id, query, category) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO saved_searches (id, query, category, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(id, query, category || 'general');
  return getSavedSearches();
}

function deleteSavedSearch(id) {
  const db = getDb();
  db.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
  return getSavedSearches();
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  createTask, updateTask, getTask, getAllTasks,
  logAction, getActionLogs,
  saveMemory, getAllMemory, getMemoryById, deleteMemory, findRelevantMemory, incrementMemoryUse,
  getSetting, getAllSettings, setSetting,
  getUserProfile, updateUserProfile,
  getSavedSearches, addSavedSearch, deleteSavedSearch,
  closeDb,
};
