"""Database access shared by the app and the aggregator.

Uses Postgres when the DATABASE_URL environment variable is set (production on Render,
backed by Neon), and falls back to a local SQLite file otherwise (local development).
Queries are written with SQLite-style `?` placeholders and translated for Postgres.
"""
import json
import os
import sqlite3

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
USE_POSTGRES = bool(DATABASE_URL)

# Absolute path so the app works no matter which directory it is started from
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'opportunities.db')

if USE_POSTGRES:
    import psycopg
    from psycopg.rows import dict_row

# Columns added after the first release; created on startup if missing.
# eligibility and required_documents hold JSON-encoded lists of strings.
EXTRA_COLUMNS = {
    'eligibility': 'TEXT',
    'required_documents': 'TEXT',
    'apply_link': 'TEXT',
    'is_verified': 'INTEGER DEFAULT 0',
    'status': "TEXT DEFAULT 'published'",
}

STATUS_PUBLISHED = 'published'
STATUS_PENDING = 'pending'


def connect():
    """Opens a new database connection. Use it as a context manager or close it yourself."""
    if USE_POSTGRES:
        return psycopg.connect(DATABASE_URL, row_factory=dict_row)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _sql(query):
    return query.replace('?', '%s') if USE_POSTGRES else query


def query(sql, params=(), one=False):
    """Runs a SELECT and returns a list of dicts (or a single dict / None when one=True)."""
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(_sql(sql), params)
        rows = [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
    if one:
        return rows[0] if rows else None
    return rows


def execute(sql, params=()):
    """Runs a single write statement and commits it. Returns the number of affected rows."""
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(_sql(sql), params)
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def _as_json_list(value):
    if not value:
        return None
    if isinstance(value, str):
        value = [value]
    items = [str(v).strip() for v in value if str(v).strip()]
    return json.dumps(items) if items else None


def _row_values(opp):
    return (
        opp['title'], opp['category'], opp.get('organization'), opp.get('description'),
        opp['url'], opp.get('deadline'), opp.get('source'),
        _as_json_list(opp.get('eligibility')), _as_json_list(opp.get('required_documents')),
        opp.get('apply_link'), 1 if opp.get('is_verified') else 0,
        opp.get('status') or STATUS_PUBLISHED,
    )


_INSERT_SQL = '''
    INSERT INTO opportunities (title, category, organization, description, url, deadline, source,
                               eligibility, required_documents, apply_link, is_verified, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (url) DO NOTHING
'''


def insert_opportunities(opps):
    """Inserts opportunities, skipping any whose URL is already stored. Returns how many were new."""
    sql = _sql(_INSERT_SQL)
    new_count = 0
    conn = connect()
    try:
        cur = conn.cursor()
        for opp in opps:
            cur.execute(sql, _row_values(opp))
            new_count += max(cur.rowcount, 0)
        conn.commit()
    finally:
        conn.close()
    return new_count


def update_opportunity(opp_id, opp):
    """Overwrites the editable fields of one opportunity. Returns True if it existed."""
    values = _row_values(opp)
    return execute('''
        UPDATE opportunities
        SET title = ?, category = ?, organization = ?, description = ?, url = ?, deadline = ?,
            source = ?, eligibility = ?, required_documents = ?, apply_link = ?, is_verified = ?,
            status = ?
        WHERE id = ?
    ''', values + (opp_id,)) > 0


def decode_row(row):
    """Turns a database row into the shape the API returns (JSON lists decoded, flags as bools)."""
    out = dict(row)
    for key in ('eligibility', 'required_documents'):
        try:
            out[key] = json.loads(out.get(key) or '[]')
        except (TypeError, ValueError):
            out[key] = []
    out['is_verified'] = bool(out.get('is_verified'))
    return out


def _existing_columns():
    if USE_POSTGRES:
        rows = query("SELECT column_name AS name FROM information_schema.columns "
                     "WHERE table_name = 'opportunities'")
    else:
        rows = query("PRAGMA table_info(opportunities)")
    return {r['name'] for r in rows}


def init_schema():
    """Creates the tables if they don't exist yet and adds any newer columns."""
    if USE_POSTGRES:
        id_column = 'id SERIAL PRIMARY KEY'
    else:
        id_column = 'id INTEGER PRIMARY KEY AUTOINCREMENT'
    execute(f'''
        CREATE TABLE IF NOT EXISTS opportunities (
            {id_column},
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            organization TEXT,
            description TEXT,
            url TEXT UNIQUE NOT NULL,
            deadline TEXT,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    existing = _existing_columns()
    for name, definition in EXTRA_COLUMNS.items():
        if name not in existing:
            execute(f'ALTER TABLE opportunities ADD COLUMN {name} {definition}')
