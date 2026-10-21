from flask import Flask, render_template, jsonify, request
import aggregator
import db
import threading
import time

app = Flask(__name__)

# Minimum gap between feed syncs, so repeated clicks can't hammer the source sites
SYNC_COOLDOWN_SECONDS = 10 * 60
_sync_lock = threading.Lock()
_last_sync_time = 0.0

# Ensure the database is initialized on startup
aggregator.init_db()

def run_sync():
    """Fetches new opportunities unless a sync ran recently or is already running.
    Returns the number of new items, or None if the sync was skipped."""
    global _last_sync_time
    if not _sync_lock.acquire(blocking=False):
        return None
    try:
        if time.time() - _last_sync_time < SYNC_COOLDOWN_SECONDS:
            return None
        new_count = aggregator.fetch_and_update_opportunities()
        _last_sync_time = time.time()
        return new_count
    finally:
        _sync_lock.release()

# Pull fresh listings in the background on startup, so a fresh deploy isn't limited to the seed list
threading.Thread(target=run_sync, daemon=True).start()

@app.route('/')
def index():
    """Main dashboard page."""
    # We pass categories to populate filters and stats
    categories = ['Scholarship', 'Internship', 'Competition', 'Job']
    return render_template('dashboard.html', categories=categories)

@app.route('/api/opportunities')
def api_opportunities():
    """API endpoint to get opportunities with optional filters."""
    category = request.args.get('category')
    search_query = request.args.get('search')

    # Bookmarks are stored per visitor in the browser, so the server only returns listings
    opps = aggregator.get_opportunities(
        category_filter=category if category in ['Scholarship', 'Internship', 'Competition', 'Job'] else None
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
    """API endpoint to trigger fetching new opportunities."""
    try:
        new_count = run_sync()
        if new_count is None:
            return jsonify({"success": True, "new_count": 0, "skipped": True})
        return jsonify({"success": True, "new_count": new_count})
    except Exception as e:
        app.logger.exception("Sync failed")
        return jsonify({"error": "Sync failed. Please try again later."}), 500

@app.route('/api/linkedin/generate', methods=['POST'])
def api_generate_linkedin():
    """API endpoint to generate a LinkedIn post draft for a given opportunity."""
    data = request.get_json() or {}
    opportunity_id = data.get('opportunity_id')
    
    try:
        opportunity_id = int(opportunity_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Missing or invalid opportunity_id"}), 400

    # Fetch opportunity details
    opp_row = db.query("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,), one=True)
    if not opp_row:
        return jsonify({"error": "Opportunity not found"}), 404
        
    opp = dict(opp_row)
    
    # Customize the LinkedIn post based on category
    title = opp['title']
    category = opp['category']
    org = opp['organization'] or "Global Sponsor"
    desc = opp['description']
    url = opp['url']
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

    linkedin_post = f"""{header}

{tagline}

✨ **{title}**
🏢 **Host Organization:** {org}
📅 **Application Deadline:** {deadline}

📝 **Quick Summary:**
{desc}

💡 **Why it's a great opportunity:**
This program is open to applicants from Nigeria. It offers a structured way to build expertise, gain international exposure, and network with leading minds in the field.

👉 **Apply Here & Learn More:** {url}

{hashtags} #careers #techcommunity #professionalgrowth"""

    return jsonify({"success": True, "post": linkedin_post})

if __name__ == '__main__':
    # Local development server; production runs under gunicorn (see render.yaml)
    app.run(debug=True, port=5000, use_reloader=False)
