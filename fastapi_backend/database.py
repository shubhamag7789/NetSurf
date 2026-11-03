"""
NetSurf Database Layer (SQLite)
Manages multi-user authentication, session tracking, and user-owned domain data.
Enforces foreign keys, WAL mode, and strict user ownership filtering.
"""

import sqlite3
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from contextlib import contextmanager
from .config import settings

def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or settings.DB_PATH
    conn = sqlite3.connect(path, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

@contextmanager
def db_session(db_path: Optional[str] = None):
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db(db_path: Optional[str] = None):
    """Initializes tables for authentication and user-owned resources."""
    with db_session(db_path) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            replaced_by TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_tasks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            goal TEXT NOT NULL,
            domain TEXT,
            status TEXT NOT NULL DEFAULT 'completed',
            plan TEXT,
            results TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_preferences (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            preferred_job_roles TEXT,
            preferred_locations TEXT,
            product_preferences TEXT,
            shopping_preferences TEXT,
            travel_preferences TEXT,
            general_preferences TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_saved_items (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_workflow_memory (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            task_pattern TEXT NOT NULL,
            learned_solution TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS price_observations (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            observed_price REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'INR',
            source_url TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            extraction_status TEXT NOT NULL,
            note TEXT DEFAULT '',
            FOREIGN KEY (item_id) REFERENCES user_saved_items(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_tasks_user_id ON user_tasks(user_id);
        CREATE INDEX IF NOT EXISTS idx_saved_items_user_id ON user_saved_items(user_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_memory_user_id ON user_workflow_memory(user_id);
        CREATE INDEX IF NOT EXISTS idx_price_obs_item ON price_observations(item_id);
        CREATE INDEX IF NOT EXISTS idx_price_obs_user ON price_observations(user_id);
        """)

        # Migration: Add preferences columns if not already present in existing databases
        for col in ["shopping_preferences", "travel_preferences", "general_preferences", "enable_workflow_memory"]:
            try:
                conn.execute(f"ALTER TABLE user_preferences ADD COLUMN {col} TEXT;")
            except Exception:
                pass

        # Migration: Add price tracking columns to user_saved_items if not already present
        saved_items_cols = [
            ("url", "TEXT DEFAULT ''"),
            ("currency", "TEXT DEFAULT 'INR'"),
            ("initial_price", "REAL"),
            ("current_price", "REAL"),
            ("target_price", "REAL"),
            ("tracking_enabled", "INTEGER DEFAULT 0"),
            ("last_checked_at", "TEXT DEFAULT ''"),
            ("last_status", "TEXT DEFAULT 'verified'"),
            ("consecutive_failures", "INTEGER DEFAULT 0"),
            ("last_notified_price", "REAL"),
            ("last_notified_at", "TEXT DEFAULT ''"),
        ]
        for col_name, col_def in saved_items_cols:
            try:
                conn.execute(f"ALTER TABLE user_saved_items ADD COLUMN {col_name} {col_def};")
            except Exception:
                pass

        # Migration: Add workflow memory enhancement columns if not already present
        memory_cols = [
            ("category", "TEXT DEFAULT 'general'"),
            ("description", "TEXT DEFAULT ''"),
            ("parameters", "TEXT DEFAULT '[]'"),
            ("action_sequence", "TEXT DEFAULT '[]'"),
            ("phases", "TEXT DEFAULT '[]'"),
            ("success_rate", "REAL DEFAULT 100.0"),
            ("success_count", "INTEGER DEFAULT 1"),
            ("failure_count", "INTEGER DEFAULT 0"),
            ("reuse_count", "INTEGER DEFAULT 0"),
            ("last_executed_at", "TEXT DEFAULT ''"),
            ("failure_conditions", "TEXT DEFAULT '[]'"),
        ]
        for col_name, col_def in memory_cols:
            try:
                conn.execute(f"ALTER TABLE user_workflow_memory ADD COLUMN {col_name} {col_def};")
            except Exception:
                pass

# Initialize database schema on load
init_db()

# ── USER CRUD ───────────────────────────────────────────────────────────────

def create_user(email: str, name: str, password_hash: str, db_path: Optional[str] = None) -> Dict[str, Any]:
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db_session(db_path) as conn:
        conn.execute(
            """INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, email.lower().strip(), name.strip(), password_hash, now, now)
        )
        # Create initial default preferences row
        conn.execute(
            """INSERT INTO user_preferences (id, user_id, preferred_job_roles, preferred_locations, product_preferences, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), user_id, json.dumps([]), json.dumps([]), json.dumps({}), now)
        )
    return get_user_by_id(user_id, db_path)

def get_user_by_id(user_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_user_by_email(email: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None

# ── REFRESH TOKEN / SESSION OPERATIONS ─────────────────────────────────────

def store_refresh_token(token_id: str, user_id: str, token_hash: str, expires_at: str, db_path: Optional[str] = None):
    now = datetime.now(timezone.utc).isoformat()
    with db_session(db_path) as conn:
        conn.execute(
            """INSERT INTO refresh_tokens (id, user_id, token_hash, revoked, expires_at, created_at)
               VALUES (?, ?, ?, 0, ?, ?)""",
            (token_id, user_id, token_hash, expires_at, now)
        )

def get_refresh_token(token_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute("SELECT * FROM refresh_tokens WHERE id = ?", (token_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def revoke_refresh_token(token_id: str, replaced_by: Optional[str] = None, db_path: Optional[str] = None):
    with db_session(db_path) as conn:
        conn.execute(
            "UPDATE refresh_tokens SET revoked = 1, replaced_by = ? WHERE id = ?",
            (replaced_by, token_id)
        )

def revoke_all_user_tokens(user_id: str, db_path: Optional[str] = None):
    with db_session(db_path) as conn:
        conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?", (user_id,))

# ── USER TASKS (ISOLATED) ──────────────────────────────────────────────────

def create_user_task(user_id: str, goal: str, domain: Optional[str] = None, status: str = "completed",
                     plan: Optional[Any] = None, results: Optional[Any] = None, db_path: Optional[str] = None) -> Dict[str, Any]:
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan_str = json.dumps(plan) if plan is not None else None
    results_str = json.dumps(results) if results is not None else None
    with db_session(db_path) as conn:
        conn.execute(
            """INSERT INTO user_tasks (id, user_id, goal, domain, status, plan, results, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (task_id, user_id, goal, domain, status, plan_str, results_str, now)
        )
    return get_user_task(user_id, task_id, db_path)

def get_user_tasks(user_id: str, limit: int = 50, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "SELECT * FROM user_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit)
        )
        return [dict(r) for r in cursor.fetchall()]

def get_user_task(user_id: str, task_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "SELECT * FROM user_tasks WHERE id = ? AND user_id = ?",
            (task_id, user_id)
        )
        row = cursor.fetchone()
        return dict(row) if row else None

def delete_user_task(user_id: str, task_id: str, db_path: Optional[str] = None) -> bool:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM user_tasks WHERE id = ? AND user_id = ?",
            (task_id, user_id)
        )
        return cursor.rowcount > 0

# ── USER PREFERENCES (ISOLATED - PHASE 3) ──────────────────────────────────

DEFAULT_SHOPPING_PREFERENCES = {
    "min_budget": None,
    "max_budget": None,
    "preferred_brands": [],
    "excluded_brands": [],
    "min_rating": None,
    "preferred_sellers": [],
    "exclusive_brands": False,
    "min_ram": None,
    "min_storage": None,
    "product_categories": [],
    "priorities": ["price", "performance", "battery", "camera", "rating"]
}

DEFAULT_TRAVEL_PREFERENCES = {
    "preferred_destinations": [],
    "preferred_airlines": [],
    "excluded_airlines": [],
    "max_budget": None,
    "max_stops": None,
    "preferred_departure_times": [],
    "hotel_budget": None,
    "min_hotel_rating": None,
    "amenities": [],
    "num_guests": 2,
    "preferred_hotel_categories": []
}

DEFAULT_JOB_PREFERENCES = {
    "preferred_roles": [],
    "preferred_locations": [],
    "experience_level": None,
    "min_salary": None
}

DEFAULT_MOVIE_PREFERENCES = {
    "preferred_languages": [],
    "preferred_formats": [],
    "preferred_cinemas": []
}

DEFAULT_GENERAL_PREFERENCES = {
    "preferred_websites": [],
    "default_currency": "INR",
    "language": "English",
    "search_preferences": {}
}

def get_user_preferences(user_id: str, db_path: Optional[str] = None) -> Dict[str, Any]:
    with db_session(db_path) as conn:
        cursor = conn.execute("SELECT * FROM user_preferences WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            now = datetime.now(timezone.utc).isoformat()
            pref_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO user_preferences (id, user_id, preferred_job_roles, preferred_locations, product_preferences,
                                                shopping_preferences, travel_preferences, general_preferences, updated_at)
                   VALUES (?, ?, '[]', '[]', '{}', '{}', '{}', '{}', ?)""",
                (pref_id, user_id, now)
            )
            return {
                "user_id": user_id,
                "preferred_job_roles": [],
                "preferred_locations": [],
                "product_preferences": {},
                "shopping": dict(DEFAULT_SHOPPING_PREFERENCES),
                "travel": dict(DEFAULT_TRAVEL_PREFERENCES),
                "jobs": dict(DEFAULT_JOB_PREFERENCES),
                "movies": dict(DEFAULT_MOVIE_PREFERENCES),
                "general": dict(DEFAULT_GENERAL_PREFERENCES),
                "enable_workflow_memory": True,
                "updated_at": now
            }
        d = dict(row)
        
        # Safely parse JSON blocks
        raw_shop = json.loads(d.get("shopping_preferences") or "{}")
        raw_travel = json.loads(d.get("travel_preferences") or "{}")
        raw_gen = json.loads(d.get("general_preferences") or "{}")
        raw_jobs = json.loads(d.get("job_preferences") or "{}") if "job_preferences" in d else {}
        raw_movies = json.loads(d.get("movie_preferences") or "{}") if "movie_preferences" in d else {}
        raw_mem = d.get("enable_workflow_memory")
        if raw_mem is None:
            mem_enabled = True
        elif isinstance(raw_mem, str):
            mem_enabled = raw_mem.strip().lower() not in ["0", "false", "no", ""]
        else:
            mem_enabled = bool(raw_mem)

        return {
            "user_id": d["user_id"],
            "preferred_job_roles": json.loads(d.get("preferred_job_roles") or "[]"),
            "preferred_locations": json.loads(d.get("preferred_locations") or "[]"),
            "product_preferences": json.loads(d.get("product_preferences") or "{}"),
            "shopping": {**DEFAULT_SHOPPING_PREFERENCES, **raw_shop},
            "travel": {**DEFAULT_TRAVEL_PREFERENCES, **raw_travel},
            "jobs": {**DEFAULT_JOB_PREFERENCES, **raw_jobs},
            "movies": {**DEFAULT_MOVIE_PREFERENCES, **raw_movies},
            "general": {**DEFAULT_GENERAL_PREFERENCES, **raw_gen},
            "enable_workflow_memory": mem_enabled,
            "updated_at": d["updated_at"]
        }

def update_user_preferences(user_id: str,
                            preferred_job_roles: Optional[List[str]] = None,
                            preferred_locations: Optional[List[str]] = None,
                            product_preferences: Optional[Dict[str, Any]] = None,
                            shopping: Optional[Dict[str, Any]] = None,
                            travel: Optional[Dict[str, Any]] = None,
                            jobs: Optional[Dict[str, Any]] = None,
                            movies: Optional[Dict[str, Any]] = None,
                            general: Optional[Dict[str, Any]] = None,
                            enable_workflow_memory: Optional[bool] = None,
                            db_path: Optional[str] = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    current = get_user_preferences(user_id, db_path)

    job_roles = json.dumps(preferred_job_roles if preferred_job_roles is not None else current["preferred_job_roles"])
    locations = json.dumps(preferred_locations if preferred_locations is not None else current["preferred_locations"])
    prod_prefs = json.dumps(product_preferences if product_preferences is not None else current["product_preferences"])

    merged_shopping = {**current["shopping"], **(shopping or {})}
    merged_travel = {**current["travel"], **(travel or {})}
    merged_jobs = {**current.get("jobs", DEFAULT_JOB_PREFERENCES), **(jobs or {})}
    merged_movies = {**current.get("movies", DEFAULT_MOVIE_PREFERENCES), **(movies or {})}
    merged_general = {**current["general"], **(general or {})}
    mem_flag = int(enable_workflow_memory) if enable_workflow_memory is not None else int(current.get("enable_workflow_memory", True))

    shop_json = json.dumps(merged_shopping)
    travel_json = json.dumps(merged_travel)
    jobs_json = json.dumps(merged_jobs)
    movies_json = json.dumps(merged_movies)
    gen_json = json.dumps(merged_general)

    with db_session(db_path) as conn:
        try:
            conn.execute("ALTER TABLE user_preferences ADD COLUMN job_preferences TEXT;")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE user_preferences ADD COLUMN movie_preferences TEXT;")
        except Exception:
            pass

        conn.execute(
            """UPDATE user_preferences 
               SET preferred_job_roles = ?, preferred_locations = ?, product_preferences = ?,
                   shopping_preferences = ?, travel_preferences = ?, job_preferences = ?, movie_preferences = ?,
                   general_preferences = ?, enable_workflow_memory = ?, updated_at = ?
               WHERE user_id = ?""",
            (job_roles, locations, prod_prefs, shop_json, travel_json, jobs_json, movies_json, gen_json, mem_flag, now, user_id)
        )
    return get_user_preferences(user_id, db_path)

def reset_user_preferences(user_id: str, db_path: Optional[str] = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with db_session(db_path) as conn:
        conn.execute(
            """UPDATE user_preferences
               SET shopping_preferences = '{}', travel_preferences = '{}', general_preferences = '{}', updated_at = ?
               WHERE user_id = ?""",
            (now, user_id)
        )
    return get_user_preferences(user_id, db_path)

# ── USER SAVED ITEMS & PRICE TRACKING (ISOLATED) ──────────────────────────

def create_user_saved_item(
    user_id: str,
    item_type: str,
    title: str,
    content: Optional[Any] = None,
    url: str = "",
    currency: str = "INR",
    initial_price: Optional[float] = None,
    current_price: Optional[float] = None,
    target_price: Optional[float] = None,
    tracking_enabled: bool = False,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    content_str = json.dumps(content) if content is not None and not isinstance(content, str) else (content or "")
    track_flag = 1 if tracking_enabled else 0
    curr_pr = current_price if current_price is not None else initial_price
    init_pr = initial_price if initial_price is not None else current_price

    with db_session(db_path) as conn:
        # Prevent duplicate saved entries for the same user and URL/title
        existing = None
        if url and len(url.strip()) > 5:
            cursor = conn.execute(
                "SELECT * FROM user_saved_items WHERE user_id = ? AND url = ?",
                (user_id, url.strip())
            )
            existing = cursor.fetchone()
        elif title:
            cursor = conn.execute(
                "SELECT * FROM user_saved_items WHERE user_id = ? AND title = ? AND item_type = ?",
                (user_id, title.strip(), item_type)
            )
            existing = cursor.fetchone()

        if existing:
            # Update existing saved entry in place rather than creating a duplicate
            conn.execute(
                """UPDATE user_saved_items 
                   SET title = ?, content = ?, current_price = ?, target_price = ?, tracking_enabled = ?, last_checked_at = ?
                   WHERE id = ? AND user_id = ?""",
                (title, content_str, curr_pr, target_price, track_flag, now, existing["id"], user_id)
            )
            cursor = conn.execute("SELECT * FROM user_saved_items WHERE id = ? AND user_id = ?", (existing["id"], user_id))
            row = cursor.fetchone()
            return _format_saved_item_row(dict(row)) if row else {}

        conn.execute(
            """INSERT INTO user_saved_items 
               (id, user_id, item_type, title, content, url, currency, 
                initial_price, current_price, target_price, tracking_enabled, 
                last_checked_at, last_status, consecutive_failures, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
            (item_id, user_id, item_type, title, content_str, url, currency,
             init_pr, curr_pr, target_price, track_flag, now if curr_pr is not None else "", "verified", now)
        )

        # If a price was supplied, record initial price observation
        if curr_pr is not None:
            obs_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO price_observations 
                   (id, item_id, user_id, observed_price, currency, source_url, timestamp, extraction_status, note)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', 'Initial saved price')""",
                (obs_id, item_id, user_id, curr_pr, currency, url, now)
            )

        cursor = conn.execute(
            "SELECT * FROM user_saved_items WHERE id = ? AND user_id = ?",
            (item_id, user_id)
        )
        row = cursor.fetchone()
        return _format_saved_item_row(dict(row)) if row else {}

def _format_saved_item_row(d: Dict[str, Any]) -> Dict[str, Any]:
    if not d:
        return {}
    if "content" in d and isinstance(d["content"], str):
        try:
            d["content"] = json.loads(d["content"])
        except Exception:
            pass
    if "tracking_enabled" in d:
        d["tracking_enabled"] = bool(d["tracking_enabled"])
    return d

def get_user_saved_items(
    user_id: str,
    item_type: Optional[str] = None,
    tracking_only: bool = False,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    with db_session(db_path) as conn:
        query = "SELECT * FROM user_saved_items WHERE user_id = ?"
        params: List[Any] = [user_id]
        if item_type:
            query += " AND item_type = ?"
            params.append(item_type)
        if tracking_only:
            query += " AND tracking_enabled = 1"
        query += " ORDER BY created_at DESC"
        
        cursor = conn.execute(query, tuple(params))
        return [_format_saved_item_row(dict(r)) for r in cursor.fetchall()]

def get_user_saved_item(user_id: str, item_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "SELECT * FROM user_saved_items WHERE id = ? AND user_id = ?",
            (item_id, user_id)
        )
        row = cursor.fetchone()
        return _format_saved_item_row(dict(row)) if row else None

def update_user_saved_item(
    user_id: str,
    item_id: str,
    title: Optional[str] = None,
    url: Optional[str] = None,
    target_price: Optional[float] = None,
    tracking_enabled: Optional[bool] = None,
    current_price: Optional[float] = None,
    last_status: Optional[str] = None,
    consecutive_failures: Optional[int] = None,
    last_notified_price: Optional[float] = None,
    last_notified_at: Optional[str] = None,
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    existing = get_user_saved_item(user_id, item_id, db_path)
    if not existing:
        return None

    now = datetime.now(timezone.utc).isoformat()
    fields = []
    params = []

    if title is not None:
        fields.append("title = ?")
        params.append(title)
    if url is not None:
        fields.append("url = ?")
        params.append(url)
    if target_price is not None:
        fields.append("target_price = ?")
        params.append(target_price)
    if tracking_enabled is not None:
        fields.append("tracking_enabled = ?")
        params.append(1 if tracking_enabled else 0)
    if current_price is not None:
        fields.append("current_price = ?")
        params.append(current_price)
        fields.append("last_checked_at = ?")
        params.append(now)
    if last_status is not None:
        fields.append("last_status = ?")
        params.append(last_status)
    if consecutive_failures is not None:
        fields.append("consecutive_failures = ?")
        params.append(consecutive_failures)
    if last_notified_price is not None:
        fields.append("last_notified_price = ?")
        params.append(last_notified_price)
    if last_notified_at is not None:
        fields.append("last_notified_at = ?")
        params.append(last_notified_at)

    if not fields:
        return existing

    params.extend([item_id, user_id])
    with db_session(db_path) as conn:
        conn.execute(
            f"UPDATE user_saved_items SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            tuple(params)
        )
        cursor = conn.execute(
            "SELECT * FROM user_saved_items WHERE id = ? AND user_id = ?",
            (item_id, user_id)
        )
        row = cursor.fetchone()
        return _format_saved_item_row(dict(row)) if row else None

def delete_user_saved_item(user_id: str, item_id: str, db_path: Optional[str] = None) -> bool:
    with db_session(db_path) as conn:
        conn.execute("DELETE FROM price_observations WHERE item_id = ? AND user_id = ?", (item_id, user_id))
        cursor = conn.execute(
            "DELETE FROM user_saved_items WHERE id = ? AND user_id = ?",
            (item_id, user_id)
        )
        return cursor.rowcount > 0

# ── PRICE OBSERVATIONS & HISTORY ───────────────────────────────────────────

def add_price_observation(
    item_id: str,
    user_id: str,
    observed_price: float,
    currency: str = "INR",
    source_url: str = "",
    extraction_status: str = "verified",
    note: str = "",
    timestamp: Optional[str] = None,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    obs_id = str(uuid.uuid4())
    now = timestamp or datetime.now(timezone.utc).isoformat()

    with db_session(db_path) as conn:
        # Check last observation to avoid unnecessary duplicated redundant entries
        last_cur = conn.execute(
            """SELECT observed_price, extraction_status FROM price_observations 
               WHERE item_id = ? AND user_id = ? 
               ORDER BY timestamp DESC LIMIT 1""",
            (item_id, user_id)
        )
        last_row = last_cur.fetchone()
        
        is_dedup = False
        # Insert observation if price changed, status changed, or first record
        if not last_row or abs(last_row["observed_price"] - observed_price) > 0.01 or last_row["extraction_status"] != extraction_status:
            conn.execute(
                """INSERT INTO price_observations 
                   (id, item_id, user_id, observed_price, currency, source_url, timestamp, extraction_status, note)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (obs_id, item_id, user_id, observed_price, currency, source_url, now, extraction_status, note)
            )
        else:
            is_dedup = True

        # Directly update parent saved item on conn to prevent nested SQLite locks
        if extraction_status == "verified":
            conn.execute(
                """UPDATE user_saved_items 
                   SET current_price = ?, last_checked_at = ?, last_status = ?, consecutive_failures = 0
                   WHERE id = ? AND user_id = ?""",
                (observed_price, now, extraction_status, item_id, user_id)
            )
        else:
            conn.execute(
                """UPDATE user_saved_items 
                   SET last_checked_at = ?, last_status = ?
                   WHERE id = ? AND user_id = ?""",
                (now, extraction_status, item_id, user_id)
            )

        return {
            "id": obs_id,
            "item_id": item_id,
            "user_id": user_id,
            "observed_price": observed_price,
            "currency": currency,
            "source_url": source_url,
            "timestamp": now,
            "extraction_status": extraction_status,
            "note": note,
            "deduplicated": is_dedup
        }

def get_price_history_for_item(
    user_id: str,
    item_id: str,
    limit: int = 50,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            """SELECT * FROM price_observations 
               WHERE item_id = ? AND user_id = ?
               ORDER BY timestamp ASC LIMIT ?""",
            (item_id, user_id, limit)
        )
        return [dict(r) for r in cursor.fetchall()]

def get_all_active_trackers(user_id: Optional[str] = None, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    with db_session(db_path) as conn:
        if user_id:
            cursor = conn.execute(
                "SELECT * FROM user_saved_items WHERE user_id = ? AND tracking_enabled = 1",
                (user_id,)
            )
        else:
            cursor = conn.execute(
                "SELECT * FROM user_saved_items WHERE tracking_enabled = 1"
            )
        return [_format_saved_item_row(dict(r)) for r in cursor.fetchall()]

# ── USER WORKFLOW MEMORY (ISOLATED) ───────────────────────────────────────

def create_user_workflow_memory(user_id: str, task_pattern: str, learned_solution: Any, db_path: Optional[str] = None) -> Dict[str, Any]:
    mem_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    solution_str = json.dumps(learned_solution) if not isinstance(learned_solution, str) else learned_solution
    with db_session(db_path) as conn:
        conn.execute(
            """INSERT INTO user_workflow_memory (id, user_id, task_pattern, learned_solution, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (mem_id, user_id, task_pattern, solution_str, now)
        )
    return get_user_workflow_memory_item(user_id, mem_id, db_path)

def get_user_workflow_memory(user_id: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "SELECT * FROM user_workflow_memory WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        )
        return [dict(r) for r in cursor.fetchall()]

def get_user_workflow_memory_item(user_id: str, memory_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "SELECT * FROM user_workflow_memory WHERE id = ? AND user_id = ?",
            (memory_id, user_id)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def save_or_update_workflow_memory(
    user_id: str,
    task_pattern: str,
    category: str,
    description: str,
    parameters: List[str],
    action_sequence: List[Dict[str, Any]],
    phases: List[Dict[str, Any]],
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Saves a newly learned successful workflow or updates an existing pattern
    for the authenticated user.
    """
    now = datetime.now(timezone.utc).isoformat()
    existing = find_matching_workflow_memory(user_id, task_pattern, db_path)

    params_json = json.dumps(parameters)
    actions_json = json.dumps(action_sequence)
    phases_json = json.dumps(phases)

    with db_session(db_path) as conn:
        if existing:
            mem_id = existing["id"]
            succ_count = existing.get("success_count", 1) + 1
            fail_count = existing.get("failure_count", 0)
            rate = round((succ_count / (succ_count + fail_count)) * 100, 1)

            conn.execute(
                """UPDATE user_workflow_memory
                   SET category = ?, description = ?, parameters = ?, action_sequence = ?, phases = ?,
                       success_count = ?, success_rate = ?, last_executed_at = ?
                   WHERE id = ? AND user_id = ?""",
                (category, description, params_json, actions_json, phases_json,
                 succ_count, rate, now, mem_id, user_id)
            )
        else:
            mem_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO user_workflow_memory
                   (id, user_id, task_pattern, learned_solution, category, description,
                    parameters, action_sequence, phases, success_rate, success_count,
                    failure_count, reuse_count, last_executed_at, failure_conditions, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (mem_id, user_id, task_pattern, actions_json, category, description,
                 params_json, actions_json, phases_json, 100.0, 1, 0, 0, now, "[]", now)
            )
        cursor = conn.execute(
            "SELECT * FROM user_workflow_memory WHERE id = ? AND user_id = ?",
            (mem_id, user_id)
        )
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        for key in ["parameters", "action_sequence", "phases", "failure_conditions"]:
            if key in res and isinstance(res[key], str):
                try:
                    res[key] = json.loads(res[key])
                except Exception:
                    pass
        return res


def find_matching_workflow_memory(
    user_id: str,
    task_pattern: str,
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Finds the highest-rated saved workflow pattern matching the task signature for a user."""
    with db_session(db_path) as conn:
        cursor = conn.execute(
            """SELECT * FROM user_workflow_memory
               WHERE user_id = ? AND task_pattern = ?
               ORDER BY success_rate DESC, reuse_count DESC, created_at DESC
               LIMIT 1""",
            (user_id, task_pattern)
        )
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        for key in ["parameters", "action_sequence", "phases", "failure_conditions"]:
            if key in res and isinstance(res[key], str):
                try:
                    res[key] = json.loads(res[key])
                except Exception:
                    pass
        return res


def increment_workflow_memory_reuse(
    user_id: str,
    memory_id: str,
    success: bool = True,
    failure_condition: Optional[str] = None,
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Records an execution outcome of a reused workflow."""
    existing = get_user_workflow_memory_item(user_id, memory_id, db_path)
    if not existing:
        return None

    now = datetime.now(timezone.utc).isoformat()
    reuse_cnt = existing.get("reuse_count", 0) + 1
    succ_cnt = existing.get("success_count", 1) + (1 if success else 0)
    fail_cnt = existing.get("failure_count", 0) + (0 if success else 1)
    rate = round((succ_cnt / (succ_cnt + fail_cnt)) * 100, 1)

    fail_conds = []
    try:
        fail_conds = json.loads(existing.get("failure_conditions") or "[]")
    except Exception:
        pass
    if failure_condition and failure_condition not in fail_conds:
        fail_conds.append(failure_condition)

    with db_session(db_path) as conn:
        conn.execute(
            """UPDATE user_workflow_memory
               SET reuse_count = ?, success_count = ?, failure_count = ?,
                   success_rate = ?, last_executed_at = ?, failure_conditions = ?
               WHERE id = ? AND user_id = ?""",
            (reuse_cnt, succ_cnt, fail_cnt, rate, now, json.dumps(fail_conds), memory_id, user_id)
        )
        cursor = conn.execute(
            "SELECT * FROM user_workflow_memory WHERE id = ? AND user_id = ?",
            (memory_id, user_id)
        )
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        for key in ["parameters", "action_sequence", "phases", "failure_conditions"]:
            if key in res and isinstance(res[key], str):
                try:
                    res[key] = json.loads(res[key])
                except Exception:
                    pass
        return res


def delete_user_workflow_memory_item(
    user_id: str,
    memory_id: str,
    db_path: Optional[str] = None
) -> bool:
    """Deletes an individual workflow memory item owned by the user."""
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM user_workflow_memory WHERE id = ? AND user_id = ?",
            (memory_id, user_id)
        )
        return cursor.rowcount > 0


def clear_user_workflow_memory(
    user_id: str,
    db_path: Optional[str] = None
) -> int:
    """Deletes all workflow memory items for the authenticated user."""
    with db_session(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM user_workflow_memory WHERE user_id = ?",
            (user_id,)
        )
        return cursor.rowcount
