from flask import Flask, render_template, jsonify, request
import aggregator
import sqlite3

app = Flask(__name__)
DATABASE = 'opportunities.db'

# Ensure the database is initialized on startup
aggregator.init_db()

def query_db(query, args=(), one=False):
    """Helper to query the database and return dictionary results."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(query, args)
    rv = cur.fetchall()
    conn.close()
    return (rv[0] if rv else None) if one else rv

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
    bookmarks_only = request.args.get('bookmarks_only') == 'true'
    search_query = request.args.get('search')
    
    # Retrieve all opportunities with bookmark status
    opps = aggregator.get_opportunities(
        category_filter=category if category in ['Scholarship', 'Internship', 'Competition', 'Job'] else None,
        show_bookmarked_only=bookmarks_only
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

@app.route('/api/bookmarks/toggle', methods=['POST'])
def api_toggle_bookmark():
    """API endpoint to toggle a bookmark."""
    data = request.get_json() or {}
    opportunity_id = data.get('opportunity_id')
    
    if not opportunity_id:
        return jsonify({"error": "Missing opportunity_id"}), 400
        
    try:
        is_bookmarked = aggregator.toggle_bookmark(int(opportunity_id))
        return jsonify({"success": True, "bookmarked": is_bookmarked})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/opportunities/refresh', methods=['POST'])
def api_refresh():
    """API endpoint to trigger fetching new opportunities."""
    try:
        new_count = aggregator.fetch_and_update_opportunities()
        return jsonify({"success": True, "new_count": new_count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/linkedin/generate', methods=['POST'])
def api_generate_linkedin():
    """API endpoint to generate a LinkedIn post draft for a given opportunity."""
    data = request.get_json() or {}
    opportunity_id = data.get('opportunity_id')
    
    if not opportunity_id:
        return jsonify({"error": "Missing opportunity_id"}), 400
        
    # Fetch opportunity details
    opp_row = query_db("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,), one=True)
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
    # Run the Flask app on localhost
    app.run(debug=True, port=5000)
