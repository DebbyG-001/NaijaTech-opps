from flask import Flask, render_template, jsonify, request, session, redirect, url_for
from datetime import datetime, timezone
from functools import wraps
import aggregator
import db
import extractor
import hmac
import os
import secrets
import threading
import time

app = Flask(__name__)

CATEGORIES = ['Scholarship', 'Internship', 'Competition', 'Job']

# Sessions are signed with SECRET_KEY; without it, admins are logged out on every restart
app.secret_key = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    # Render serves the site over HTTPS and sets RENDER=true
    SESSION_COOKIE_SECURE=bool(os.environ.get('RENDER')),
    PERMANENT_SESSION_LIFETIME=60 * 60 * 12,
)
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

# Optional link to the team's WhatsApp channel, shown as a "Join" button on the site
WHATSAPP_CHANNEL_URL = os.environ.get('WHATSAPP_CHANNEL_URL', '').strip()
if not WHATSAPP_CHANNEL_URL.startswith('https://'):
    WHATSAPP_CHANNEL_URL = ''
# Public address of the site, used in WhatsApp messages
SITE_URL = os.environ.get('SITE_URL', 'https://naijatech-opps.onrender.com').rstrip('/')

# Minimum gap between feed syncs, so repeated clicks can't hammer the source sites
SYNC_COOLDOWN_SECONDS = 10 * 60
_sync_lock = threading.Lock()
_last_sync_time = 0.0

# Failed admin logins per client, to slow down password guessing
MAX_LOGIN_FAILURES = 5
LOGIN_LOCKOUT_SECONDS = 15 * 60
_login_failures = {}

# Ensure the database is initialized on startup
aggregator.init_db()

def run_sync(force=False):
    """Fetches new opportunities unless a sync ran recently or is already running.
    Returns the number of new items, or None if the sync was skipped."""
    global _last_sync_time
    if not _sync_lock.acquire(blocking=False):
        return None
    try:
        if not force and time.time() - _last_sync_time < SYNC_COOLDOWN_SECONDS:
            return None
        new_count = aggregator.fetch_and_update_opportunities()
        _last_sync_time = time.time()
        return new_count
    finally:
        _sync_lock.release()

def start_background_sync(force=False):
    """Starts a sync without waiting for it (syncing every source can outlast a web request).
    Returns 'started', 'busy' (a sync is running), or 'cooldown' (one ran recently)."""
    if _sync_lock.locked():
        return 'busy'
    if not force and time.time() - _last_sync_time < SYNC_COOLDOWN_SECONDS:
        return 'cooldown'
    threading.Thread(target=run_sync, kwargs={'force': force}, daemon=True).start()
    return 'started'

# Pull fresh listings in the background on startup, so a fresh deploy isn't limited to the seed list
start_background_sync()

@app.route('/')
def index():
    """Main dashboard page."""
    # We pass categories to populate filters and stats
    return render_template('dashboard.html', categories=CATEGORIES, whatsapp_channel_url=WHATSAPP_CHANNEL_URL)

@app.route('/api/opportunities')
def api_opportunities():
    """API endpoint to get published opportunities with optional filters."""
    category = request.args.get('category')
    search_query = request.args.get('search')

    # Bookmarks are stored per visitor in the browser, so the server only returns listings
    opps = aggregator.get_opportunities(
        category_filter=category if category in CATEGORIES else None
    )

    # Filter by search term if provided
    if search_query:
        search_query = search_query.lower()
        opps = [
            o for o in opps
            if search_query in o['title'].lower()
            or search_query in (o['organization'] or '').lower()
            or search_query in (o['description'] or '').lower()
        ]

    return jsonify(opps)

@app.route('/healthz')
def healthz():
    """Health check used by the hosting platform."""
    return jsonify({"status": "ok"})

@app.route('/api/opportunities/refresh', methods=['POST'])
def api_refresh():
    """API endpoint to trigger fetching new opportunities in the background."""
    result = start_background_sync()
    return jsonify({"success": True, "started": result == 'started', "skipped": result != 'started'})

@app.route('/admin/api/linkedin/generate', methods=['POST'])
def api_generate_linkedin():
    """Admin-only: generates a LinkedIn post draft for a given opportunity.
    (Removed from the public site; posting is done by admins.)"""
    if not _is_admin() or request.headers.get('X-Requested-With') != 'fetch':
        return jsonify({"error": "Please log in again."}), 401
    data = request.get_json() or {}
    opportunity_id = data.get('opportunity_id')

    try:
        opportunity_id = int(opportunity_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Missing or invalid opportunity_id"}), 400

    # Fetch opportunity details (pending listings aren't public yet)
    opp_row = db.query("SELECT * FROM opportunities WHERE id = ? AND status = ?",
                       (opportunity_id, db.STATUS_PUBLISHED), one=True)
    if not opp_row:
        return jsonify({"error": "Opportunity not found"}), 404

    opp = db.decode_row(opp_row)

    # Customize the LinkedIn post based on category
    title = opp['title']
    category = opp['category']
    org = opp['organization'] or "Global Sponsor"
    desc = opp['description']
    url = opp['apply_link'] or opp['url']
    deadline = opp['deadline'] or "Rolling/ASAP"

    # Dynamic header and intro based on category
    if category == 'Scholarship':
        header = "🎓 SCHOLARSHIP OPPORTUNITY FOR NIGERIANS! 🇳🇬"
        tagline = "Are you a student or researcher looking for funding to support your academic goals? Check this out!"
        hashtags = "#scholarships #nigerianstudents #studyabroad #highereducation #funding #education"
    elif category == 'Internship':
        header = "💼 TECH INTERNSHIP ALERT! 🇳🇬"
        tagline = "Kickstart your professional engineering/tech journey with a hands-on internship placement!"
        hashtags = "#internships #techjobs #nigerintech #softwareengineering #earlycareer #careeropportunities"
    elif category == 'Competition':
        header = "🏆 AI & CODING COMPETITION ALERT! 🇳🇬"
        tagline = "Ready to test your skills, win cash prizes, and get noticed by global tech recruiters?"
        hashtags = "#hackathons #datascience #kaggle #zindi #artificialintelligence #codingchallenge"
    else: # Job
        header = "📢 TECH JOB OPENING FOR NIGERIANS! 🇳🇬"
        tagline = "Looking for your next career move? Check out this exciting software engineering/tech job vacancy!"
        hashtags = "#techjobs #hiring #nigerintech #softwaredeveloper #remotejobs #careers"

    if opp['eligibility']:
        who_section = "✅ **Who Can Apply:**\n" + "\n".join(f"• {e}" for e in opp['eligibility'][:5])
    else:
        who_section = ("💡 **Why it's a great opportunity:**\n"
                       "This program is open to applicants from Nigeria. It offers a structured way to build expertise, "
                       "gain international exposure, and network with leading minds in the field.")

    linkedin_post = f"""{header}

{tagline}

✨ **{title}**
🏢 **Host Organization:** {org}
📅 **Application Deadline:** {deadline}

📝 **Quick Summary:**
{desc}

{who_section}

👉 **Apply Here & Learn More:** {url}

{hashtags} #careers #techcommunity #professionalgrowth"""

    return jsonify({"success": True, "post": linkedin_post})


# ---------------------------------------------------------------------------
# Admin panel
# ---------------------------------------------------------------------------

def _client_id():
    # Render sits behind a proxy; the first forwarded address is the real client
    forwarded = request.headers.get('X-Forwarded-For', '')
    return forwarded.split(',')[0].strip() or request.remote_addr or 'unknown'

def _is_admin():
    return session.get('is_admin') is True

def admin_required(view):
    """Protects admin API routes: requires a logged-in session and a same-site fetch request."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not _is_admin():
            return jsonify({"error": "Please log in again."}), 401
        # Custom header can't be sent cross-site without CORS, which blocks forged requests
        if request.headers.get('X-Requested-With') != 'fetch':
            return jsonify({"error": "Bad request."}), 400
        return view(*args, **kwargs)
    return wrapper

@app.route('/admin')
def admin_page():
    return render_template('admin.html', logged_in=_is_admin(), configured=bool(ADMIN_PASSWORD),
                           error=request.args.get('error'), categories=CATEGORIES,
                           site_url=SITE_URL, whatsapp_channel_url=WHATSAPP_CHANNEL_URL)

@app.route('/admin/login', methods=['POST'])
def admin_login():
    if not ADMIN_PASSWORD:
        return redirect(url_for('admin_page'))
    client = _client_id()
    failures, first_failure = _login_failures.get(client, (0, 0.0))
    if failures >= MAX_LOGIN_FAILURES and time.time() - first_failure < LOGIN_LOCKOUT_SECONDS:
        return redirect(url_for('admin_page', error='locked'))

    password = request.form.get('password', '')
    if hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
        _login_failures.pop(client, None)
        session.clear()
        session.permanent = True
        session['is_admin'] = True
        return redirect(url_for('admin_page'))

    if time.time() - first_failure >= LOGIN_LOCKOUT_SECONDS:
        failures, first_failure = 0, time.time()
    _login_failures[client] = (failures + 1, first_failure)
    return redirect(url_for('admin_page', error='wrong'))

@app.route('/admin/logout', methods=['POST'])
def admin_logout():
    session.clear()
    return redirect(url_for('admin_page'))

def _clean_list(value):
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        return []
    return [str(v).strip()[:300] for v in value if str(v).strip()][:30]

def _validate_opportunity(data):
    """Returns (opportunity dict, error message)."""
    def text(key, limit):
        return str(data.get(key) or '').strip()[:limit]

    opp = {
        'title': text('title', 300),
        'category': text('category', 40),
        'organization': text('organization', 200),
        'description': text('description', 600),
        'url': extractor.normalize_url(text('url', 1000)),
        'deadline': text('deadline', 100),
        'source': text('source', 100) or 'Admin',
        'eligibility': _clean_list(data.get('eligibility')),
        'required_documents': _clean_list(data.get('required_documents')),
        'apply_link': extractor.normalize_url(text('apply_link', 1000)),
        'is_verified': bool(data.get('is_verified')),
        'status': data.get('status') if data.get('status') in (db.STATUS_PUBLISHED, db.STATUS_PENDING) else db.STATUS_PUBLISHED,
    }
    if not opp['title']:
        return None, "A title is required."
    if opp['category'] not in CATEGORIES:
        return None, "Pick a category."
    if not opp['url'].startswith(('http://', 'https://')):
        return None, "The opportunity link must start with http:// or https://"
    if opp['apply_link'] and not opp['apply_link'].startswith(('http://', 'https://')):
        return None, "The apply link must start with http:// or https://"
    return opp, None

@app.route('/admin/api/opportunities')
@admin_required
def admin_list():
    status = request.args.get('status')
    if status not in (db.STATUS_PUBLISHED, db.STATUS_PENDING):
        status = None
    return jsonify(aggregator.get_opportunities(status=status, include_expired=True))

@app.route('/admin/api/extract', methods=['POST'])
@admin_required
def admin_extract():
    data = request.get_json() or {}
    url = str(data.get('url') or '')
    pasted_text = str(data.get('text') or '')
    try:
        if pasted_text.strip():
            # Text the admin copied from a page that needs a sign-in
            draft = extractor.extract_from_text(url, pasted_text)
        else:
            draft = extractor.extract_opportunity(url)
    except extractor.ExtractionError as e:
        return jsonify({"error": str(e), "code": e.code}), 422
    except Exception:
        app.logger.exception("Extraction failed")
        return jsonify({"error": "Something went wrong reading that page. You can fill in the details by hand."}), 500
    existing = db.query("SELECT id, status FROM opportunities WHERE url = ?", (draft['url'],), one=True)
    draft['existing'] = existing
    return jsonify({"success": True, "draft": draft})

@app.route('/admin/api/opportunities', methods=['POST'])
@admin_required
def admin_create():
    opp, error = _validate_opportunity(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400
    if db.insert_opportunities([opp]) == 0:
        return jsonify({"error": "An opportunity with this link already exists."}), 409
    return jsonify({"success": True})

@app.route('/admin/api/opportunities/<int:opp_id>', methods=['PUT'])
@admin_required
def admin_update(opp_id):
    opp, error = _validate_opportunity(request.get_json() or {})
    if error:
        return jsonify({"error": error}), 400
    try:
        updated = db.update_opportunity(opp_id, opp)
    except Exception:
        app.logger.exception("Update failed")
        return jsonify({"error": "Could not save. Another opportunity may already use this link."}), 409
    if not updated:
        return jsonify({"error": "Opportunity not found."}), 404
    return jsonify({"success": True})

@app.route('/admin/api/opportunities/<int:opp_id>/status', methods=['POST'])
@admin_required
def admin_set_status(opp_id):
    status = (request.get_json() or {}).get('status')
    if status not in (db.STATUS_PUBLISHED, db.STATUS_PENDING):
        return jsonify({"error": "Invalid status."}), 400
    if not db.execute("UPDATE opportunities SET status = ? WHERE id = ?", (status, opp_id)):
        return jsonify({"error": "Opportunity not found."}), 404
    return jsonify({"success": True})

@app.route('/admin/api/opportunities/<int:opp_id>', methods=['DELETE'])
@admin_required
def admin_delete(opp_id):
    if not db.execute("DELETE FROM opportunities WHERE id = ?", (opp_id,)):
        return jsonify({"error": "Opportunity not found."}), 404
    return jsonify({"success": True})

@app.route('/admin/api/whatsapp')
@admin_required
def admin_whatsapp_queue():
    """Published, still-open listings not yet shared to the channel, plus recently handled ones."""
    listings = aggregator.get_opportunities()
    queue = [o for o in listings if not o.get('whatsapp_status') and not o['is_expired']]
    handled = [o for o in listings if o.get('whatsapp_status')]
    handled.sort(key=lambda o: o.get('whatsapp_at') or '', reverse=True)
    return jsonify({"queue": queue, "recent": handled[:15]})

@app.route('/admin/api/whatsapp/mark', methods=['POST'])
@admin_required
def admin_whatsapp_mark():
    """Marks listings as posted or skipped, or puts them back in the queue (action='undo')."""
    data = request.get_json() or {}
    action = data.get('action')
    try:
        ids = [int(i) for i in data.get('ids') or []][:500]
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid ids."}), 400
    if action not in (db.WHATSAPP_POSTED, db.WHATSAPP_SKIPPED, 'undo') or not ids:
        return jsonify({"error": "Invalid request."}), 400

    status = None if action == 'undo' else action
    stamp = None if action == 'undo' else datetime.now(timezone.utc).isoformat(timespec='seconds')
    placeholders = ', '.join('?' for _ in ids)
    updated = db.execute(f"UPDATE opportunities SET whatsapp_status = ?, whatsapp_at = ? WHERE id IN ({placeholders})",
                         (status, stamp, *ids))
    return jsonify({"success": True, "updated": updated})

@app.route('/admin/api/sync', methods=['POST'])
@admin_required
def admin_sync():
    result = start_background_sync(force=True)
    return jsonify({"success": True, "busy": result == 'busy',
                    "apify_configured": bool(os.environ.get('APIFY_TOKEN'))})

if __name__ == '__main__':
    # Local development server; production runs under gunicorn (see render.yaml)
    app.run(debug=True, port=5000, use_reloader=False)
