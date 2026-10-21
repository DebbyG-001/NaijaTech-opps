"""Understands free-text deadlines and decides when a listing has expired.

Deadlines come from many sources in many formats ("2026-10-31", "30th November 2026",
"Oct 23, 2026", "Aug 31 - Oct 23, 2026", "Rolling Admission"). parse_deadline returns the
last date it can find, or None when there is no concrete date (rolling, "See Link", ...).
"""
import re
from datetime import date, datetime, timedelta, timezone

# Listings stay visible, marked "Deadline passed", for this many days after the deadline
GRACE_DAYS = 3
CLOSING_SOON_DAYS = 7

# Nigeria is UTC+1 all year (no daylight saving)
LAGOS_TZ = timezone(timedelta(hours=1))

MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}
_MONTH = r'(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
_DAY = r'(\d{1,2})(?:st|nd|rd|th)?'

_ISO = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})')
_DAY_MONTH_YEAR = re.compile(_DAY + r'\s+(?:of\s+)?' + _MONTH + r',?\s+(\d{4})', re.IGNORECASE)
_MONTH_DAY_YEAR = re.compile(_MONTH + r'\.?\s+' + _DAY + r',?\s+(\d{4})', re.IGNORECASE)
# "Aug 31 - Oct 23, 2026": the start date has no year of its own
_RANGE_END = re.compile(_MONTH + r'\.?\s+' + _DAY + r'\s*[-–]\s*' + _MONTH + r'\.?\s+' + _DAY + r',?\s+(\d{4})', re.IGNORECASE)
# "Oct 05 - 27, 2026": both days in the same month
_SAME_MONTH_RANGE = re.compile(_MONTH + r'\.?\s+' + _DAY + r'\s*[-–]\s*' + _DAY + r',?\s+(\d{4})', re.IGNORECASE)


def _make(year, month, day):
    try:
        return date(int(year), month, int(day))
    except ValueError:
        return None


def parse_deadline(text):
    """Returns the deadline as a date, or None if there is no concrete date in the text."""
    if not text:
        return None
    text = str(text)
    found = []  # (position in text, date)

    for m in _ISO.finditer(text):
        found.append((m.start(), _make(m.group(1), int(m.group(2)), m.group(3))))
    for m in _RANGE_END.finditer(text):
        found.append((m.start(), _make(m.group(5), MONTHS[m.group(3)[:3].lower()], m.group(4))))
    for m in _SAME_MONTH_RANGE.finditer(text):
        found.append((m.start(), _make(m.group(4), MONTHS[m.group(1)[:3].lower()], m.group(3))))
    for m in _DAY_MONTH_YEAR.finditer(text):
        found.append((m.start(), _make(m.group(3), MONTHS[m.group(2)[:3].lower()], m.group(1))))
    for m in _MONTH_DAY_YEAR.finditer(text):
        found.append((m.start(), _make(m.group(3), MONTHS[m.group(1)[:3].lower()], m.group(2))))

    dates = [d for _, d in sorted(found, key=lambda f: f[0]) if d]
    # When several dates appear (a range or "opens X, closes Y"), the latest one is the deadline
    return max(dates) if dates else None


_DEADLINE_LABEL = re.compile(r'(?:application\s+)?(?:deadline|closing\s+date|apply\s+(?:by|before))\s*[:\-–]?\s*', re.IGNORECASE)


def deadline_in_text(text):
    """Finds a date right after a 'Deadline:' style label in longer text, as an ISO date string."""
    if not text:
        return None
    for m in _DEADLINE_LABEL.finditer(str(text)):
        # Only look a short way past the label, so later dates in the text aren't mistaken for it
        found = parse_deadline(text[m.end():m.end() + 40])
        if found:
            return found.isoformat()
    return None


def today_in_nigeria():
    return datetime.now(LAGOS_TZ).date()


def deadline_status(text, today=None):
    """Returns a dict describing where a listing stands relative to its deadline."""
    today = today or today_in_nigeria()
    deadline = parse_deadline(text)
    if deadline is None:
        return {'deadline_date': None, 'days_left': None, 'is_expired': False, 'is_hidden': False}
    days_left = (deadline - today).days
    return {
        'deadline_date': deadline.isoformat(),
        'days_left': days_left,
        'is_expired': days_left < 0,
        'is_hidden': days_left < -GRACE_DAYS,
    }


def format_deadline(d):
    """Formats a date the way the site shows deadlines, e.g. '23 Oct 2026'."""
    return f"{d.day} {d.strftime('%b %Y')}"
