# NaijaTech Opps 🇳🇬
An AI-first web dashboard that aggregates tech opportunities open to Nigerians. It fetches, parses, and updates real-time listings of:
*   **Scholarships** (DAAD, Mastercard Foundation, Erasmus Mundus, BEA, etc.)
*   **Internships** (Microsoft ADC, Moniepoint, Google STEP, etc.)
*   **Competitions & Hackathons** (Kaggle Challenges, Zindi ML Competitions, Devpost Hackathons, etc.)
*   **CS/Tech Jobs** (Paystack, Flutterwave, Andela remote jobs, etc.)

## Key Features
1.  **Glassmorphic Dark UI**: Premium, responsive dashboard with tailored HSL color codes, custom micro-animations, and a light mode toggle.
2.  **Live Updates (Sync)**: Connects to popular platforms (Opportunities for Africans, Opportunity Desk) via standard WordPress RSS feeds with built-in fallback XML/regex parsing.
3.  **Persistent Database**: Postgres (Neon) in production, a local SQLite file in development. Seeds a high-quality starting list on first run.
4.  **Flexible Filter & Search**: Instant filtering by category (Scholarships, Internships, Competitions, Jobs) or custom keyword search.
5.  **Bookmarking System**: Each visitor's bookmarks are saved privately in their own browser.
6.  **LinkedIn Post Generator**: Generates engaging, formatted LinkedIn posts with emojis, hooks, and hashtags for any selected opportunity.
7.  **Opportunity Details**: Eligibility, required documents, apply link, and a Verified badge for checked listings.
8.  **HorizonScholar Import**: Pulls the latest results of the `seyi_glory/horizon-scholar-scraper` Apify actor. Trusted results go live; the rest wait for admin review.
9.  **Admin Panel** (`/admin`): Paste a link and Gemini reads the page and drafts the listing for review. Approve, edit, unpublish, or delete listings.

## Project Structure
*   `app.py`: Flask backend, routing, API endpoints, and LinkedIn generation logic.
*   `aggregator.py`: Predefined opportunity seeds, RSS XML downloading, and keyword classification.
*   `extractor.py`: Reads a pasted link and extracts opportunity details with Gemini.
*   `templates/admin.html`, `static/js/admin.js`: Admin panel.
*   `db.py`: Database access. Uses Postgres when `DATABASE_URL` is set, otherwise the local SQLite file.
*   `templates/dashboard.html`: The HTML template structured with Material Symbols and responsive container layouts.
*   `static/css/styles.css`: CSS Variables, glassmorphic card designs, loading spinners, and toast styles.
*   `static/js/app.js`: State manager, AJAX call handlers, and modal managers.
*   `opportunities.db`: Local SQLite database used in development (not committed).

## Getting Started

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Application
Start the Flask dev server:
```bash
python app.py
```

### 3. Access Dashboard
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

## Deploying to Render
The repo includes a `render.yaml`, so Render picks up the settings automatically.

1. Sign in at [render.com](https://render.com) with GitHub.
2. Click **New > Blueprint** and select this repository.
3. Click **Apply**. Render installs the requirements and starts the app with `gunicorn`.

### Database
Set the `DATABASE_URL` environment variable on Render to a Postgres connection string (for example from [Neon](https://neon.tech)) so listings persist across restarts and deploys. Without it, the app falls back to a SQLite file, which Render's free plan wipes on every restart.

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Recommended | Postgres connection string (Neon). Without it, data resets on restart. |
| `ADMIN_PASSWORD` | For `/admin` | Password for the admin panel. The panel is disabled without it. |
| `SECRET_KEY` | Recommended | Long random string that signs admin logins. Without it, admins are logged out on every restart. |
| `GEMINI_API_KEY` | Optional | Google AI Studio key for reading pasted links. Without it, only the page title and summary are filled in. |
| `GEMINI_MODEL` | Optional | Gemini model ID (default `gemini-3.8-flash`). |
| `APIFY_TOKEN` | Optional | Apify API token for importing HorizonScholar results. |
| `APIFY_ACTOR` | Optional | Actor to import from (default `seyi_glory~horizon-scholar-scraper`). |

Notes:
*   The app syncs the RSS feeds and Apify results automatically on startup, and whenever someone clicks Sync (at most every 10 minutes). Schedule the Apify actor itself in the Apify console.
*   The free plan sleeps after ~15 minutes without visitors, so the first visit afterwards takes up to a minute to load.
