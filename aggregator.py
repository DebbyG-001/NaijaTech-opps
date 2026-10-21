import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime
import html
import requests
from bs4 import BeautifulSoup

import db

# Predefined high-quality opportunities for Nigerians (reliable seeds)
CURATED_OPPORTUNITIES = [
    {
        "title": "Google Africa Developer Scholarship (GADS) 2026",
        "category": "Scholarship",
        "organization": "Google & Pluralsight",
        "description": "A comprehensive scholarship program offering tech training in Mobile Web, Android, and Google Cloud development. Designed to empower developers across Africa and bridge the tech talent gap.",
        "url": "https://buildyourfuture.withgoogle.com/programs/google-africa-developer-scholarship",
        "deadline": "Rolling Admission",
        "source": "Curated"
    },
    {
        "title": "Mastercard Foundation Scholars Program 2026/2027",
        "category": "Scholarship",
        "organization": "Mastercard Foundation",
        "description": "Fully funded scholarships for young Africans to pursue undergraduate and postgraduate degrees at top international universities (including Edinburgh, McGill, and Berkeley). Covers tuition, accommodation, and living stipends.",
        "url": "https://mastercardfdn.org/all/scholars/",
        "deadline": "2026-10-31",
        "source": "Curated"
    },
    {
        "title": "Microsoft ADC Software Engineering Internship (Lagos)",
        "category": "Internship",
        "organization": "Microsoft African Development Centre",
        "description": "Join the engineering team at Microsoft's Lagos office. As an intern, you will work alongside world-class engineers on products like Windows, Office, and Azure, building systems that impact millions globally.",
        "url": "https://careers.microsoft.com/us/en/search-results?keywords=Nigeria%20Internship",
        "deadline": "Rolling Admission",
        "source": "Curated"
    },
    {
        "title": "Moniepoint Graduate Internship Programme 2026",
        "category": "Internship",
        "organization": "Moniepoint",
        "description": "An intensive hands-on graduate program for aspiring software engineers, product managers, and data analysts in Nigeria. Work on high-scale fintech systems and secure mentorship from industry leaders.",
        "url": "https://moniepoint.com/careers",
        "deadline": "Rolling Admission",
        "source": "Curated"
    },
    {
        "title": "Kaggle: Spaceship Titanic Machine Learning Challenge",
        "category": "Competition",
        "organization": "Kaggle",
        "description": "A popular introductory AI competition. Predict which passengers were transported by the cosmic anomaly during the Spaceship Titanic's maiden voyage. Excellent for beginners in data science.",
        "url": "https://www.kaggle.com/competitions/spaceship-titanic",
        "deadline": "Active Challenge",
        "source": "Curated"
    },
    {
        "title": "Zindi: Financial Inclusion in Africa AI Challenge",
        "category": "Competition",
        "organization": "Zindi Africa",
        "description": "Build a machine learning model to predict who is most likely to have a bank account or access to financial services in East and West Africa. Features a cash prize pool and direct recruiter visibility.",
        "url": "https://zindi.africa/competitions/financial-inclusion-in-africa",
        "deadline": "2026-08-15",
        "source": "Curated"
    },
    {
        "title": "ALX Software Engineering Scholarship 2026",
        "category": "Scholarship",
        "organization": "ALX Africa",
        "description": "A rigorous, 12-month software engineering program sponsored by the Mastercard Foundation. Gain skills in C, Python, JavaScript, and systems engineering. Open to young Nigerians with zero tech background.",
        "url": "https://www.alxafrica.com/software-engineering/",
        "deadline": "2026-09-12",
        "source": "Curated"
    },
    {
        "title": "Paystack Software Engineer (Graduate/Junior) Programme",
        "category": "Job",
        "organization": "Paystack",
        "description": "Full-time career track for early-career developers. Join one of Africa's leading payment processors to build APIs, merchant tools, and core transaction systems in Lagos, Nigeria (Hybrid).",
        "url": "https://paystack.com/careers",
        "deadline": "Rolling Admission",
        "source": "Curated"
    },
    {
        "title": "Andela Remote Technical Placement Program",
        "category": "Job",
        "organization": "Andela",
        "description": "Join Andela's talent network to be matched with global companies seeking remote developers. Tailored for Nigerian software developers, data scientists, and DevOps specialists looking for remote USD salaries.",
        "url": "https://andela.com/talent/",
        "deadline": "Open/Rolling",
        "source": "Curated"
    },
    {
        "title": "DAAD Scholarships for Development-Related Postgraduate Courses",
        "category": "Scholarship",
        "organization": "German Academic Exchange Service (DAAD)",
        "description": "Fully funded scholarships for master's and PhD programs at German universities. Aimed at professionals from developing nations, including Nigeria, to acquire advanced skills in technology and science.",
        "url": "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
        "deadline": "2026-10-15",
        "source": "Curated"
    },
    {
        "title": "Y Combinator Startup School & Funding Application 2026",
        "category": "Competition",
        "organization": "Y Combinator",
        "description": "Apply for funding and mentorship from Y Combinator. Nigerian startup founders get access to $500k standard deal funding, a world-class network, and tech support. Includes free technical founder courses.",
        "url": "https://www.ycombinator.com/apply",
        "deadline": "2026-09-01",
        "source": "Curated"
    },
    {
        "title": "Interswitch Graduate Trainee Programme (Engineering)",
        "category": "Internship",
        "organization": "Interswitch Group",
        "description": "Graduate program offering intensive rotations across core engineering teams, payment rails, switching infrastructure, and digital products. Located in Lagos, Nigeria.",
        "url": "https://www.interswitchgroup.com/careers",
        "deadline": "Rolling Admission",
        "source": "Curated"
    }
]

def init_db():
    """Creates the tables and seeds the curated list if the database is empty."""
    db.init_schema()
    
    if db.query('SELECT COUNT(*) AS n FROM opportunities', one=True)['n'] == 0:
        db.insert_opportunities(CURATED_OPPORTUNITIES)
        print("Database initialized and seeded successfully.")
    else:
        print("Database already contains opportunities.")

def get_opportunities(category_filter=None, status=db.STATUS_PUBLISHED):
    """Retrieves opportunities from the database with optional filtering.
    Pass status=None to include every status (admin views)."""
    sql = "SELECT * FROM opportunities"
    params = []
    conditions = []
    
    if category_filter:
        conditions.append("category = ?")
        params.append(category_filter)

    if status:
        conditions.append("status = ?")
        params.append(status)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
        
    sql += " ORDER BY created_at DESC, id DESC"
    
    return [db.decode_row(row) for row in db.query(sql, params)]

def clean_html(raw_html):
    """Removes HTML tags and cleans up strings."""
    if not raw_html:
        return ""
    # Strip HTML tags
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    # Decode HTML entities
    cleantext = html.unescape(cleantext)
    # Normalize whitespaces
    cleantext = re.sub(r'\s+', ' ', cleantext).strip()
    return cleantext

def classify_category(title, content):
    """Classifies an opportunity into Scholarship, Internship, Competition, or Job."""
    combined = (title + " " + content).lower()
    
    if any(k in combined for k in ["scholarship", "fellowship", "bursary", "fully funded", "study in", "mastercard foundation", "chevening"]):
        return "Scholarship"
    elif any(k in combined for k in ["internship", "intern", "step intern", "graduate trainee", "co-op"]):
        return "Internship"
    elif any(k in combined for k in ["hackathon", "competition", "contest", "challenge", "kaggle", "zindi", "prize", "coding challenge", "pitch"]):
        return "Competition"
    elif any(k in combined for k in ["job", "engineer", "developer", "designer", "architect", "analyst", "role", "recruit", "hiring"]):
        return "Job"
    else:
        # Default fallback
        return "Job"

def extract_organization(title):
    """Attempts to guess the organization name from the title."""
    # Common patterns: "Title by Org", "Title at Org", "Org: Title"
    match = re.search(r' at (.*?)(?: for|\(| -|$)', title, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    match = re.search(r' by (.*?)(?: for|\(| -|$)', title, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    match = re.search(r'^([^:]+):', title)
    if match and len(match.group(1)) < 30:
        return match.group(1).strip()
        
    return "Global"

def parse_rss_feed(url, source_name):
    """Fetches and parses a standard RSS feed, returning opportunities."""
    opportunities = []
    response = None
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"Failed to fetch {url}, status code {response.status_code}")
            return []
            
        # Parse XML using standard library ElementTree
        # Clean up any potential encoding issues by using response.content (bytes)
        root = ET.fromstring(response.content)
        items = root.findall('.//item')
        
        # Standard namespace mapping for content:encoded
        namespaces = {'content': 'http://purl.org/rss/1.0/modules/content/'}
        
        for item in items:
            title_el = item.find('title')
            link_el = item.find('link')
            
            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            link = link_el.text.strip() if link_el is not None and link_el.text else ""
            
            if not title or not link:
                # If link element doesn't have text directly (sometimes it's a sub-tag or CDATA),
                # try to get it from text attribute or tail
                continue
                
            desc_el = item.find('description')
            content_el = item.find('content:encoded', namespaces)
            
            desc_html = desc_el.text if desc_el is not None and desc_el.text else ""
            content_html = content_el.text if content_el is not None and content_el.text else desc_html
            
            desc_clean = clean_html(desc_html)
            if len(desc_clean) > 250:
                desc_clean = desc_clean[:247] + "..."
                
            category = classify_category(title, content_html or desc_html)
            org = extract_organization(title)
            
            # Find deadline in text
            deadline = "See Link"
            combined_text = (title + " " + (content_html or desc_html)).lower()
            deadline_match = re.search(r'deadline[s]?\s*:\s*([^.<>\n]+)', combined_text)
            if deadline_match:
                deadline_str = clean_html(deadline_match.group(1))
                if len(deadline_str) < 40:
                    deadline = deadline_str.strip()
            
            opportunities.append({
                "title": title,
                "category": category,
                "organization": org,
                "description": desc_clean,
                "url": link,
                "deadline": deadline,
                "source": source_name
            })
    except Exception as e:
        print(f"Error parsing feed {url} via ElementTree: {e}")
        if response is None:
            # The request itself failed, so there is nothing to fall back on
            return opportunities
        # Try a regex-based fallback if XML parsing fails due to malformed XML characters
        try:
            # Simple regex search for <item> blocks
            items_raw = re.findall(r'<item>(.*?)</item>', response.text, re.DOTALL)
            for item_raw in items_raw:
                title_m = re.search(r'<title>(.*?)</title>', item_raw, re.DOTALL)
                link_m = re.search(r'<link>(.*?)</link>', item_raw, re.DOTALL)
                desc_m = re.search(r'<description>(.*?)</description>', item_raw, re.DOTALL)
                
                title = clean_html(title_m.group(1)) if title_m else ""
                link = clean_html(link_m.group(1)) if link_m else ""
                desc_html = desc_m.group(1) if desc_m else ""
                desc_clean = clean_html(desc_html)
                
                if not title or not link:
                    continue
                    
                if len(desc_clean) > 250:
                    desc_clean = desc_clean[:247] + "..."
                    
                category = classify_category(title, desc_html)
                org = extract_organization(title)
                deadline = "See Link"
                
                opportunities.append({
                    "title": title,
                    "category": category,
                    "organization": org,
                    "description": desc_clean,
                    "url": link,
                    "deadline": deadline,
                    "source": source_name
                })
        except Exception as fallback_err:
            print(f"Regex fallback failed for {url}: {fallback_err}")
        
    return opportunities

APIFY_ACTOR = os.environ.get('APIFY_ACTOR', 'seyi_glory~horizon-scholar-scraper')
APIFY_SOURCE_NAME = 'HorizonScholar'

def fetch_apify_opportunities():
    """Reads the results of the latest successful run of the HorizonScholar Apify actor.
    The actor itself is scheduled on Apify; this only imports what it found.
    Returns [] when APIFY_TOKEN isn't configured or the request fails."""
    token = os.environ.get('APIFY_TOKEN', '').strip()
    if not token:
        return []
    url = f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/runs/last/dataset/items"
    try:
        response = requests.get(
            url,
            params={'status': 'SUCCEEDED', 'clean': 'true', 'format': 'json'},
            headers={'Authorization': f'Bearer {token}'},
            timeout=30,
        )
        response.raise_for_status()
        items = response.json()
    except Exception as e:
        print(f"Apify import failed: {e}")
        return []

    opportunities = []
    for item in items if isinstance(items, list) else []:
        title = clean_html(item.get('title') or '')
        page_url = (item.get('sourceUrl') or item.get('applyLink') or '').strip()
        if not title or not page_url.startswith(('http://', 'https://')):
            continue
        eligibility = [clean_html(e) for e in (item.get('eligibility') or []) if e]
        documents = [clean_html(d) for d in (item.get('requiredDocuments') or []) if d]
        is_trusted = bool(item.get('isTrusted'))
        lowered = title.lower()
        category = 'Competition' if any(k in lowered for k in ['competition', 'contest', 'essay', 'challenge']) else 'Scholarship'
        provider = clean_html(item.get('provider') or '') or extract_organization(title)
        description = ' '.join(eligibility[:2]) or f"{category} opportunity from {provider}."
        if len(description) > 250:
            description = description[:247] + "..."
        opportunities.append({
            "title": title,
            "category": category,
            "organization": provider,
            "description": description,
            "url": page_url,
            "deadline": clean_html(item.get('deadline') or '') or "See Link",
            "source": APIFY_SOURCE_NAME,
            "eligibility": eligibility,
            "required_documents": documents,
            "apply_link": (item.get('applyLink') or '').strip() or None,
            "is_verified": is_trusted,
            # Verified listings go live straight away; the rest wait for admin review
            "status": db.STATUS_PUBLISHED if is_trusted else db.STATUS_PENDING,
        })
    return opportunities

def fetch_and_update_opportunities():
    """Fetches opportunities from RSS feeds and the Apify actor and inserts them into the DB."""
    feeds = [
        ("https://www.opportunitiesforafricans.com/feed/", "Opportunities for Africans"),
        ("https://opportunitydesk.org/feed/", "Opportunity Desk")
    ]
    
    new_count = 0
    for feed_url, source_name in feeds:
        print(f"Fetching updates from {source_name}...")
        opps = parse_rss_feed(feed_url, source_name)
        # Listings whose URL is already stored are skipped
        new_count += db.insert_opportunities(opps)

    apify_opps = fetch_apify_opportunities()
    if apify_opps:
        print(f"Importing {len(apify_opps)} results from Apify...")
        new_count += db.insert_opportunities(apify_opps)
                
    print(f"Fetch completed. Added {new_count} new opportunities.")
    return new_count

if __name__ == '__main__':
    # Test initialization
    init_db()
