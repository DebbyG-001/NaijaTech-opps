# NaijaTech Opps 🇳🇬
An AI-first web dashboard that aggregates tech opportunities open to Nigerians. It fetches, parses, and updates real-time listings of:
*   **Scholarships** (DAAD, Mastercard Foundation, Erasmus Mundus, BEA, etc.)
*   **Internships** (Microsoft ADC, Moniepoint, Google STEP, etc.)
*   **Competitions & Hackathons** (Kaggle Challenges, Zindi ML Competitions, Devpost Hackathons, etc.)
*   **CS/Tech Jobs** (Paystack, Flutterwave, Andela remote jobs, etc.)

## Key Features
1.  **Glassmorphic Dark UI**: Premium, responsive dashboard with tailored HSL color codes, custom micro-animations, and a light mode toggle.
2.  **Live Updates (Sync)**: Connects to popular platforms (Opportunities for Africans, Opportunity Desk) via standard WordPress RSS feeds with built-in fallback XML/regex parsing.
3.  **Persisted SQLite Backend**: Seeds a high-quality starting list and updates local DB cache to ensure instant loading speeds.
4.  **Flexible Filter & Search**: Instant filtering by category (Scholarships, Internships, Competitions, Jobs) or custom keyword search.
5.  **Bookmarking System**: Each visitor's bookmarks are saved privately in their own browser.
6.  **LinkedIn Post Generator**: Generates engaging, formatted LinkedIn posts with emojis, hooks, and hashtags for any selected opportunity.

## Project Structure
*   `app.py`: Flask backend, routing, API endpoints, and LinkedIn generation logic.
*   `aggregator.py`: Handles SQLite schema creation, predefined opportunity seeds, RSS XML downloading, and keyword classification.
*   `templates/dashboard.html`: The HTML template structured with Material Symbols and responsive container layouts.
*   `static/css/styles.css`: CSS Variables, glassmorphic card designs, loading spinners, and toast styles.
*   `static/js/app.js`: State manager, AJAX call handlers, and modal managers.
*   `opportunities.db`: Local SQLite database cache.

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

Notes:
*   On the free plan the SQLite file is reset on every restart or deploy. The app re-seeds the curated list and syncs the RSS feeds automatically on startup.
*   The free plan sleeps after ~15 minutes without visitors, so the first visit afterwards takes up to a minute to load.
