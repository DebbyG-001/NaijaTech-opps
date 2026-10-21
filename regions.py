"""Decides whether an opportunity is Nigerian, Africa-wide, or global.

Most visitors are Nigerian, so the site lists Nigerian opportunities first, then ones open
across Africa (which include Nigerians), then everything else. Matching is keyword-based on
the title, organization, summary, eligibility, and links.
"""
import re
from urllib.parse import urlparse

NIGERIA = 'nigeria'
AFRICA = 'africa'
GLOBAL = 'global'
ORDER = {NIGERIA: 0, AFRICA: 1, GLOBAL: 2}

_NIGERIA_TEXT = re.compile(
    r"\b(nigeria|nigerians?|naija|lagos|abuja|port harcourt|ibadan|kano|kaduna|enugu|benin city|"
    r"nysc|unilag|covenant university|obafemi awolowo|ahmadu bello|"
    # Nigerian tech companies and programmes
    r"paystack|flutterwave|moniepoint|interswitch|opay|palmpay|kuda|piggyvest|cowrywise|"
    r"tony elumelu|nitda|3mtt|google africa developer)\b",
    re.IGNORECASE)

_AFRICA_TEXT = re.compile(
    r"\b(africa|african|africans|sub-saharan|west africa|ecowas|pan-african|"
    r"mastercard foundation|alx|zindi)\b",
    re.IGNORECASE)

# "South Africa(n)" names one country, not the continent; it must not count as Africa-wide
_SOUTH_AFRICA = re.compile(r"\bsouth\s+africa(n|ns)?\b", re.IGNORECASE)

# Sources that only list Africa-focused opportunities
_AFRICA_SOURCES = {'zindi'}


def _is_nigerian_host(url):
    host = (urlparse(url or '').hostname or '').lower()
    return host.endswith('.ng')


def classify(opp):
    """Returns NIGERIA, AFRICA, or GLOBAL for an opportunity dict."""
    text = ' '.join(str(opp.get(key) or '') for key in ('title', 'organization', 'description'))
    text += ' ' + ' '.join(opp.get('eligibility') or [])
    if _NIGERIA_TEXT.search(text) or _is_nigerian_host(opp.get('url')) or _is_nigerian_host(opp.get('apply_link')):
        return NIGERIA
    if _AFRICA_TEXT.search(_SOUTH_AFRICA.sub(' ', text)) or (opp.get('source') or '').lower() in _AFRICA_SOURCES:
        return AFRICA
    return GLOBAL
