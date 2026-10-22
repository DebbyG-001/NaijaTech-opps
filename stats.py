"""Anonymous reach measurement: daily visitors, details opened, and apply clicks.

Each event stores only the day (Nigeria time), what happened, which opportunity it was
about, and whether the visitor arrived from our WhatsApp channel. No IP address, name,
cookie, or device identifier is kept, so no consent banner is needed.
"""
from datetime import timedelta

import db
import deadlines
import regions

# visit = first page load of the day on a device; pageview = every page load;
# details = "View Details" opened; apply = "Apply" tapped
KINDS = {'visit', 'pageview', 'details', 'apply'}
REFS = {'whatsapp', 'other'}
OPPORTUNITY_KINDS = {'details', 'apply'}


def record_event(kind, opportunity_id=None, ref=None):
    """Stores one event. Returns False (and stores nothing) for anything malformed."""
    if kind not in KINDS:
        return False
    if kind in OPPORTUNITY_KINDS:
        try:
            opportunity_id = int(opportunity_id)
        except (TypeError, ValueError):
            return False
        if opportunity_id <= 0:
            return False
    else:
        opportunity_id = None
    ref = ref if ref in REFS else 'other'
    day = deadlines.today_in_nigeria().isoformat()
    db.execute("INSERT INTO events (day, kind, opportunity_id, ref) VALUES (?, ?, ?, ?)",
               (day, kind, opportunity_id, ref))
    return True


def get_stats(days=30):
    """Daily series and totals for the last `days` days, plus the most-clicked opportunities."""
    today = deadlines.today_in_nigeria()
    first = today - timedelta(days=days - 1)
    day_list = [(first + timedelta(days=i)).isoformat() for i in range(days)]

    daily = {d: {'day': d, 'visitors': 0, 'whatsapp_visitors': 0, 'pageviews': 0, 'details': 0, 'apply': 0}
             for d in day_list}
    rows = db.query("SELECT day, kind, ref, COUNT(*) AS n FROM events WHERE day >= ? "
                    "GROUP BY day, kind, ref", (first.isoformat(),))
    for r in rows:
        bucket = daily.get(r['day'])
        if not bucket:
            continue
        n = int(r['n'])
        if r['kind'] == 'visit':
            bucket['visitors'] += n
            if r['ref'] == 'whatsapp':
                bucket['whatsapp_visitors'] += n
        elif r['kind'] == 'pageview':
            bucket['pageviews'] += n
        elif r['kind'] in ('details', 'apply'):
            bucket[r['kind']] += n
    series = [daily[d] for d in day_list]

    def total(key, last_n):
        return sum(day[key] for day in series[-last_n:])

    totals = {span: {key: total(key, n) for key in ('visitors', 'whatsapp_visitors', 'pageviews', 'details', 'apply')}
              for span, n in (('7d', 7), (f'{days}d', days))}

    # Per-opportunity counts, joined to titles in Python so it works the same on SQLite and Postgres
    per_opp = {}
    for r in db.query("SELECT opportunity_id AS id, kind, COUNT(*) AS n FROM events "
                      "WHERE day >= ? AND opportunity_id IS NOT NULL GROUP BY opportunity_id, kind",
                      (first.isoformat(),)):
        entry = per_opp.setdefault(int(r['id']), {'details': 0, 'apply': 0})
        entry[r['kind']] = entry.get(r['kind'], 0) + int(r['n'])

    by_category, by_region, top = {}, {}, []
    if per_opp:
        ids = list(per_opp)
        placeholders = ', '.join('?' for _ in ids)
        opps = {o['id']: db.decode_row(o) for o in
                db.query(f"SELECT * FROM opportunities WHERE id IN ({placeholders})", ids)}
        for opp_id, counts in per_opp.items():
            opp = opps.get(opp_id)
            if not opp:
                continue  # listing was deleted since
            region = regions.classify(opp)
            by_category[opp['category']] = by_category.get(opp['category'], 0) + counts['apply']
            by_region[region] = by_region.get(region, 0) + counts['apply']
            top.append({'id': opp_id, 'title': opp['title'], 'category': opp['category'],
                        'region': region, 'source': opp.get('source'), **counts})
        top.sort(key=lambda o: (o['apply'], o['details']), reverse=True)

    return {
        'days': days,
        'series': series,
        'totals': totals,
        'top': top[:10],
        'apply_by_category': by_category,
        'apply_by_region': by_region,
    }
