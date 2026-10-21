"""Database access shared by the app and the aggregator.

Uses Postgres when the DATABASE_URL environment variable is set (production on Render,
backed by Neon), and falls back to a local SQLite file otherwise (local development).
Queries are written with SQLite-style `?` placeholders and translated for Postgres.
"""
import os
import sqlite3

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
USE_POSTGRES = bool(DATABASE_URL)

# Absolute path so the app works no matter which directory it is started from
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'opportunities.db')

if USE_POSTGRES:
    import psycopg
    from psycopg.rows import dict_row


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


def insert_opportunities(opps):
    """Inserts opportunities, skipping any whose URL is already stored. Returns how many were new."""
    sql = _sql('''
        INSERT INTO opportunities (title, category, organization, description, url, deadline, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (url) DO NOTHING
    ''')
    new_count = 0
    conn = connect()
    try:
        cur = conn.cursor()
        for opp in opps:
            cur.execute(sql, (opp['title'], opp['category'], opp['organization'],
                              opp['description'], opp['url'], opp['deadline'], opp['source']))
            new_count += max(cur.rowcount, 0)
        conn.commit()
    finally:
        conn.close()
    return new_count


def init_schema():
    """Creates the tables if they don't exist yet."""
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
