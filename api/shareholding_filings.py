"""Official SEBI shareholding-pattern (SHP) filings, sourced from NSE.

Every listed company files a quarterly shareholding pattern under SEBI (LODR)
Regulation 31. NSE publishes the filing index plus the raw XBRL instance for
each one; this module turns those filings into per-investor holdings.

Two disclosures matter here:

* Named public shareholders. Regulation 31 requires any public shareholder
  holding more than 1% to be named, with an exact share count. This is the
  backbone of the portfolio data.
* Persons Acting in Concert (PAC). Where a company discloses a concert party,
  the filing itself names the group leader and every member entity WITH share
  counts -- including members below the 1% naming threshold. When a filing
  carries a PAC block we prefer it: it is both officially grouped and more
  complete than the named-holder table.

Everything here is derived from the exchange filing. There is no third-party
aggregator in the path.
"""

from datetime import datetime, timezone
import re
import xml.etree.ElementTree as ET

import requests

NSE_BASE = "https://www.nseindia.com"
SHP_MASTER_PATH = "/api/corporate-share-holdings-master?index=equities"
SHP_WARMUP_URL = f"{NSE_BASE}/companies-listing/corporate-filings-shareholding-pattern"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": f"{NSE_BASE}/",
    "X-Requested-With": "XMLHttpRequest",
}

# Public (Table III) context groups, mapped to the class the UI splits on.
# Promoter groups (IndividualsOrHUF, OthersIndianShareholders,
# OtherForeignShareholders) are deliberately absent -- a promoter is not an
# investor, and those groups sit in Table II.
_PUBLIC_CATEGORIES = {
    "DetailsOfSharesHeldByResidentIndividualShareholdersHoldingNominalShareCapitalInExcessOfRsTwoLakh":
        ("individual", "Resident individual"),
    "DetailsOfSharesHeldByResidentIndividualShareholdersHoldingNominalShareCapitalUpToRsTwoLakh":
        ("individual", "Resident individual"),
    "DetailsOfSharesHeldByNonResidentIndians": ("individual", "Non-resident Indian"),
    "NonResidentIndividualsOrForeignIndividuals": ("individual", "Non-resident individual"),
    "DetailsOfSharesHeldByForeignNationals": ("individual", "Foreign national"),
    "DetailsOfSharesHeldByDirectorsAndDirectorsRelatives": ("individual", "Director / relative"),
    "DetailsOfSharesHeldByBodiesCorporate": ("individual", "Body corporate"),
    "OtherNonInstitutions": ("individual", "Other non-institution"),
    "MutualFundsOrUTI": ("institution", "Mutual fund"),
    "AlternativeInvestmentFunds": ("institution", "Alternative investment fund"),
    "DetailsOfSharesHeldByBanks": ("institution", "Bank"),
    "InsuranceCompanies": ("institution", "Insurance company"),
    "ProvidentFundsOrPensionFunds": ("institution", "Provident / pension fund"),
    "DetailsOfSharesHeldByInstitutionsForeignPortfolioInvestorOne": ("institution", "FPI Category I"),
    "DetailsOfSharesHeldByInstitutionsForeignPortfolioInvestorTwo": ("institution", "FPI Category II"),
    "DetailsOfSharesHeldByOtherInstitutionsForeign": ("institution", "Foreign institution"),
    "DetailsOfSharesHeldByForeignCompanies": ("institution", "Foreign company"),
    "DetailsOfSharesHeldByForeignDirectInvestment": ("institution", "Foreign direct investment"),
    "SovereignWealthFundsDomestic": ("institution", "Sovereign wealth fund"),
    "NBFCsRegisteredWithRBI": ("institution", "NBFC"),
    "OtherFinancialInstitutions": ("institution", "Other financial institution"),
}

# Custodians, IEPF, employee trusts and government promoter vehicles are public
# on paper but are not investment decisions -- they would pollute a ranking.
_EXCLUDED_CATEGORIES = {
    "DetailsOfSharesHeldByInvestorEducationAndProtectionFund",
    "EmployeeBenefitsTrusts",
    "CustodianOrDRHolder",
    "OverseasDepositories",
    "CentralGovernmentOrStateGovernments",
    "DetailsOfSharesHeldByShareholdingByCompaniesOrBodiesCorporateWhereCentralOrStateGovernmentIsPromoter",
}

_HONORIFICS = {"MR", "MRS", "MS", "SHRI", "SMT", "DR", "PROF", "SRI", "KUMARI", "M/S"}

# Legal-form noise only. These are dropped from identity keys so that
# "Bright Star Investments Private Ltd." and "Bright Star Investments Pvt. Ltd."
# -- the same entity, spelled two ways in one filing -- resolve to one key.
# Distinctive words like INVESTMENTS or SECURITIES are deliberately NOT here:
# stripping them would collapse unrelated companies onto a shared surname.
_LEGAL_FORM_TOKENS = {
    "LIMITED", "LTD", "PRIVATE", "PVT", "LLP", "INC", "CORP", "CORPORATION",
    "COMPANY", "PLC", "AND", "&", "THE", "OF", "A", "C",
}
# Signals that a name is an entity rather than a person, which selects the
# corporate keying strategy (full name) over the personal one (surname+given).
_CORPORATE_HINT_TOKENS = _LEGAL_FORM_TOKENS | {
    "TRUST", "FUND", "FUNDS", "PARTNERS", "PARTNERSHIP", "HOLDINGS", "HOLDING",
    "INVESTMENTS", "INVESTMENT", "CAPITAL", "ENTERPRISES", "ENTERPRISE",
    "VENTURES", "SECURITIES", "ADVISORS", "ADVISERS", "ASSOCIATES", "MUTUAL",
    "ETF", "AMC", "BANK", "INSURANCE", "PENSION", "NPS", "SCHEME", "PORTFOLIO",
    "ASSET", "MANAGEMENT", "FINANCE", "FINSERV", "ESTATES", "RESORTS", "TRADING",
}
_PUNCT_RE = re.compile(r"[^A-Z0-9&\s]")
_CONTEXT_RE = re.compile(r"^(?P<base>.+?)_Context(?P<idx>\d+)$")
_PAC_RE = re.compile(r"^PAC_Public(?P<idx>\d+)$")

# Well-known investors whose filing names vary beyond what first+last
# normalisation can reconcile, or who hold through vehicles that never appear
# in a PAC block. PAC disclosures handle grouping wherever a company files
# them; this map is the fallback for the rest.
INVESTOR_ALIASES = {
    "DAMANI_RADHAKISHAN": "Radhakishan Damani",
    "DAMANI_GOPIKISHAN": "Radhakishan Damani",
    "BRIGHT STAR INVESTMENTS": "Radhakishan Damani",
    "DERIVE INVESTMENTS": "Radhakishan Damani",
    "DERIVE TRADING RESORTS": "Radhakishan Damani",
    "DAMANI ESTATES FINANCE": "Radhakishan Damani",
    "JHUNJHUNWALA_RAKESH": "Rakesh Jhunjhunwala (estate)",
    "JHUNJHUNWALA_REKHA": "Rekha Jhunjhunwala",
    "KEDIA_VIJAY": "Vijay Kedia",
    "KEDIA SECURITIES": "Vijay Kedia",
    "KACHOLIA_ASHISH": "Ashish Kacholia",
    "BENGAL FINANCE": "Ashish Kacholia",
    "KHANNA_DOLLY": "Dolly Khanna",
    "KHANNA_RAJIV": "Dolly Khanna",
    "AGRAWAL_MUKUL": "Mukul Agrawal",
    "SINGHANIA_SUNIL": "Sunil Singhania",
    "ABAKKUS": "Sunil Singhania",
    "VELIYATH_PORINJU": "Porinju Veliyath",
    "DHAWAN_ASHISH": "Ashish Dhawan",
    "BHANSALI_AKASH": "Akash Bhansali",
    "BHANSHALI_AKASH": "Akash Bhansali",
    "SHAH_NEMISH": "Nemish Shah",
    "GOEL_ANIL": "Anil Kumar Goel",
    "GOEL_SEEMA": "Anil Kumar Goel",
}
_ALIAS_DISPLAYS = set(INVESTOR_ALIASES.values())

# SEBI's category buckets are about share capital, not about who the holder is:
# pension schemes, ETFs and insurance pools are routinely filed under "bodies
# corporate" or "other non-institutions". Without this override they rank as
# individuals and crowd out the actual people on the investors tab.
_INSTITUTION_NAME_RE = re.compile(
    r"\b(MUTUAL\s+FUND|FUND|ETF|NPS|PENSION|PROVIDENT|SUPERANNUATION|GRATUITY|"
    r"INSURANCE|ASSURANCE|TRUSTEE|TRUST\s*-?\s*A/C|ASSET\s+MANAGEMENT|AMC|ULIP|"
    r"LICI|SCHEME|ARBITRAGE|FLEXI\s*CAP|SOVEREIGN|DEPOSITORY|"
    r"PORTFOLIO\s+MANAGE|ALTERNATIVE\s+INVESTMENT|VENTURE\s+CAPITAL\s+FUND)\b",
    re.IGNORECASE,
)
_ACRONYMS = {
    "LIC", "LICI", "SBI", "HDFC", "ICICI", "IDBI", "UTI", "NPS", "ETF", "AMC",
    "LLP", "PVT", "LTD", "ULIP", "A/C", "IIFL", "IDFC", "DSP", "PNB", "HSBC",
    "BNP", "JM", "L&T", "PMS", "INC", "PLC", "NRI", "HUF", "VC", "AIF",
}


def classify_by_name(name, default):
    """Institution when the filed name says so, else the filing's own bucket."""
    return "institution" if _INSTITUTION_NAME_RE.search(name or "") else default


def display_name(name):
    """Readable form of a filed name.

    Filings arrive in whatever case the company's registrar typed, so the same
    investor shows up as "AKASH BHANSHALI" in one and "Akash Bhanshali" in the
    next. Shouty all-caps names are title-cased; anything already mixed-case is
    left exactly as filed.
    """
    cleaned = " ".join((name or "").split())
    if not cleaned or any(c.islower() for c in cleaned):
        return cleaned
    words = []
    for word in cleaned.split(" "):
        bare = word.strip(".,-")
        words.append(word if bare.upper() in _ACRONYMS else word.title())
    return " ".join(words)


def _text(el):
    return (el.text or "").strip() if el is not None else ""


def _local(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _int(value):
    try:
        return int(float(str(value).replace(",", "").strip()))
    except (TypeError, ValueError):
        return None


def _float(value):
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def normalize_name(name):
    """Uppercase, de-punctuated, honorific-free form of a filed name."""
    cleaned = _PUNCT_RE.sub(" ", (name or "").upper())
    tokens = [t for t in cleaned.split() if t and t not in _HONORIFICS]
    return " ".join(tokens)


def entity_key(name):
    """Identity for a specific filed entity, ignoring legal-form spelling.

    Used to reconcile the same entity named twice inside one filing (the PAC
    block and the named-holder table rarely agree on "Pvt." vs "Private").
    """
    tokens = [t for t in normalize_name(name).split() if t not in _LEGAL_FORM_TOKENS]
    return " ".join(tokens)


def investor_key(name, klass="individual"):
    """Stable identity key for a filed shareholder name.

    Individuals are keyed on surname + given name so that "Radhakishan S
    Damani" and "Radhakishan Shivkishan Damani" collapse to one investor;
    middle names and initials in Indian filings are wildly inconsistent.
    Corporate entities keep their full de-suffixed name, since two unrelated
    companies routinely share a first and last word.
    """
    norm = normalize_name(name)
    if not norm:
        return ""
    tokens = norm.split()
    corporate = any(t in _CORPORATE_HINT_TOKENS for t in tokens)
    if klass == "individual" and not corporate and len(tokens) >= 2:
        key = f"{tokens[-1]}_{tokens[0]}"
    else:
        key = entity_key(name) or norm
    return INVESTOR_ALIASES.get(key, key)


def canonical_display(name, key):
    """Curated label when the key resolved through the alias map, else as filed."""
    return key if key in _ALIAS_DISPLAYS else name


def _facts_by_context(xml_bytes):
    """{contextRef: {localTagName: text}} for every fact in the instance."""
    root = ET.fromstring(xml_bytes)
    facts = {}
    for el in root:
        ctx = el.get("contextRef")
        if not ctx:
            continue
        facts.setdefault(ctx, {})[_local(el.tag)] = _text(el)
    return facts


def parse_shp_filing(xml_bytes):
    """Extract named public holders and PAC groups from one SHP XBRL instance.

    Returns {"total_shares", "named": [...], "pac": [...]}. Percentages are
    converted from the filing's fractions to whole percents.
    """
    facts = _facts_by_context(xml_bytes)
    total = _int(facts.get("ShareholdingPattern_ContextI", {}).get("NumberOfFullyPaidUpEquityShares"))

    named, pac = [], []
    for ctx, fields in facts.items():
        name = fields.get("NameOfTheShareholder")
        if not name or not ctx.startswith("D_"):
            continue
        body = ctx[2:]

        pac_match = _PAC_RE.match(body)
        if pac_match:
            values = facts.get(body, {})
            shares = _int(values.get("NumberOfShares"))
            if shares is None:
                continue
            member = fields.get("NameOfThePAC") or name
            pac.append({
                "leader": display_name(name),
                "entity": display_name(member),
                "shares": shares,
                "pct": round((_float(values.get("PercentageOfShareholdingByPAC")) or 0) * 100, 4),
            })
            continue

        match = _CONTEXT_RE.match(body)
        if not match:
            continue
        base = match.group("base")
        if base in _EXCLUDED_CATEGORIES or base not in _PUBLIC_CATEGORIES:
            continue
        values = facts.get(body, {})
        shares = _int(values.get("NumberOfFullyPaidUpEquityShares") or values.get("NumberOfShares"))
        if shares is None or shares <= 0:
            continue
        klass, label = _PUBLIC_CATEGORIES[base]
        named.append({
            "entity": display_name(name),
            "class": classify_by_name(name, klass),
            "category": label,
            "shares": shares,
            "pct": round((_float(values.get("ShareholdingAsAPercentageOfTotalNumberOfShares")) or 0) * 100, 4),
        })

    return {"total_shares": total, "named": named, "pac": pac}


def holdings_from_filing(parsed):
    """Collapse one filing's disclosures into deduplicated per-investor rows.

    Where a PAC block exists for a group, it supersedes that group's named-holder
    rows: the filing's own concert disclosure is both authoritative on grouping
    and reaches members below the 1% naming threshold. Named holders that no PAC
    block covers are kept as standalone investors.
    """
    named = parsed.get("named") or []
    pac = parsed.get("pac") or []
    class_by_entity = {entity_key(h["entity"]): h["class"] for h in named}
    category_by_entity = {entity_key(h["entity"]): h["category"] for h in named}

    rows = []
    claimed = set()
    groups = {}
    for member in pac:
        leader = member["leader"]
        klass = classify_by_name(leader, class_by_entity.get(entity_key(leader), "individual"))
        key = investor_key(leader, klass)
        if not key:
            continue
        groups.setdefault(key, {"leader": leader, "class": klass, "members": []})
        groups[key]["members"].append(member)
        claimed.add(entity_key(member["entity"]))

    for key, group in groups.items():
        for member in group["members"]:
            entity_norm = entity_key(member["entity"])
            rows.append({
                "holder_key": key,
                "holder_name": canonical_display(group["leader"], key),
                "entity_name": member["entity"],
                "class": group["class"],
                "category": category_by_entity.get(entity_norm, "Concert party"),
                "shares": member["shares"],
                "pct": member["pct"],
                "source": "pac",
            })

    for holding in named:
        if entity_key(holding["entity"]) in claimed:
            continue
        key = investor_key(holding["entity"], holding["class"])
        if not key:
            continue
        rows.append({
            "holder_key": key,
            "holder_name": canonical_display(holding["entity"], key),
            "entity_name": holding["entity"],
            "class": holding["class"],
            "category": holding["category"],
            "shares": holding["shares"],
            "pct": holding["pct"],
            "source": "named",
        })
    return rows


def _quarter_iso(value):
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime((value or "").strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def new_session():
    session = requests.Session()
    session.headers.update(_HEADERS)
    try:
        session.get(SHP_WARMUP_URL, timeout=12)
    except requests.RequestException:
        pass
    return session


def fetch_filing_index(session=None, from_date=None, to_date=None):
    """Latest SHP filing per symbol, straight from NSE's filing master.

    One request covers the entire listed universe (~2,300 companies), so a
    refresh never needs to walk symbols one at a time.
    """
    session = session or new_session()
    path = SHP_MASTER_PATH
    if from_date and to_date:
        path += f"&from_date={from_date}&to_date={to_date}"
    response = session.get(f"{NSE_BASE}{path}", timeout=60)
    response.raise_for_status()

    latest = {}
    for record in response.json():
        symbol = (record.get("symbol") or "").strip()
        xbrl = (record.get("xbrl") or "").strip()
        quarter = _quarter_iso(record.get("date"))
        if not symbol or not xbrl or not quarter:
            continue
        entry = {
            "symbol": symbol,
            "company": (record.get("name") or "").strip(),
            "quarter_date": quarter,
            "record_id": str(record.get("recordId") or ""),
            "xbrl_url": xbrl,
            "submission_date": (record.get("submissionDate") or "").strip(),
        }
        current = latest.get(symbol)
        if not current or entry["quarter_date"] > current["quarter_date"]:
            latest[symbol] = entry
    return list(latest.values())


def fetch_filing_holdings(entry, session=None):
    """Download and parse one filing into investor rows."""
    session = session or new_session()
    response = session.get(entry["xbrl_url"], timeout=45)
    response.raise_for_status()
    parsed = parse_shp_filing(response.content)
    return {
        "symbol": entry["symbol"],
        "company": entry.get("company", ""),
        "quarter_date": entry["quarter_date"],
        "total_shares": parsed["total_shares"],
        "rows": holdings_from_filing(parsed),
    }


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()
