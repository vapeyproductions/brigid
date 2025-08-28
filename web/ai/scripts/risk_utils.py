import re

FULL = "If you’re concerned, contact your clinician or go to Labor & Delivery."
GENTLE = "If anything feels off or worsens, contact your clinician."

HIGH_PAT = re.compile(
    r"(bleeding|soak(?:ing)?.*pad|fluid (?:leak|gush|water (?:broke|break))|"
    r"decreased|no (?:fetal )?movement|kick\s*count.*low|"
    r"severe pain|fever|vision (?:changes|blurry)|"
    r"headache.*swelling|preterm|<\s*37\s*weeks)", re.I)

MED_PAT  = re.compile(
    r"(cramps?|backache|irregular tightenings?|pelvic pressure|nausea|diarrhea|"
    r"5-1-1|braxton\s*hicks|what should i do|is this early labor|tim(?:e|ing)\b)", re.I)

def infer_risk(prompt: str) -> str:
    t = (prompt or "").lower()
    if HIGH_PAT.search(t):  return "high"
    if MED_PAT.search(t):   return "medium"
    return "low"

def normalize_quotes(s: str) -> str:
    return (s or "").replace("'", "’").strip()

def strip_footer(resp: str) -> str:
    r = normalize_quotes(resp)
    r = re.sub(re.escape(FULL)+r"\s*$", "", r)
    r = re.sub(re.escape(GENTLE)+r"\s*$", "", r)
    return r.strip()

def ensure_footer(resp: str, risk: str) -> str:
    r = strip_footer(resp)
    if risk == "high":
        if not r.endswith(('.', '!', '?')): r += '.'
        return f"{r} {FULL}"
    if risk == "medium":
        if not r.endswith(('.', '!', '?')): r += '.'
        return f"{r} {GENTLE}"
    # low
    return r  # no footer
