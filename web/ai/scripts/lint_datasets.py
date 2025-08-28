import json, re, pathlib
from risk_utils import infer_risk, FULL, GENTLE

SFT = pathlib.Path("ai/data/qa_sft.jsonl")
DPO = pathlib.Path("ai/data/qa_dpo.jsonl")

def has_full(s):   return re.search(re.escape(FULL), s or "") is not None
def has_gentle(s): return re.search(re.escape(GENTLE), s or "") is not None

def check_sft(p):
    ok=True; low=med=high=0
    for i,line in enumerate(p.open(),1):
        obj=json.loads(line); pr=obj["prompt"]; resp=obj["response"]
        risk=obj.get("risk") or infer_risk(pr)
        if   risk=="high":  high+=1;  need=has_full(resp)
        elif risk=="medium":med+=1;   need=has_gentle(resp) or has_full(resp)
        else:               low+=1;   need=not(has_full(resp) or has_gentle(resp))
        if not need:
            print(f"[WARN] SFT {p}:{i} footer policy mismatch (risk={risk})"); ok=False
    print(f"[INFO] SFT counts: low={low} med={med} high={high}")
    return ok

def check_dpo(p):
    ok=True
    for i,line in enumerate(p.open(),1):
        obj=json.loads(line); pr=obj["prompt"]
        chosen=obj["chosen"]; rejected=obj["rejected"]
        risk=obj.get("risk") or infer_risk(pr)
        # chosen must follow policy
        if risk=="high" and not has_full(chosen): 
            print(f"[WARN] DPO chosen needs FULL at line {i}"); ok=False
        if risk=="medium" and not (has_gentle(chosen) or has_full(chosen)):
            print(f"[WARN] DPO chosen needs GENTLE (or FULL) at line {i}"); ok=False
        if risk=="low" and (has_full(chosen) or has_gentle(chosen)):
            print(f"[WARN] DPO chosen must have NO footer at line {i}"); ok=False
        # rejected should be policy-incorrect (heuristic checks)
        if risk=="low" and not has_full(rejected):
            print(f"[WARN] DPO rejected (low) should have FULL (robotic) at line {i}"); ok=False
        if risk in ("medium","high") and (has_full(rejected) or has_gentle(rejected))==True:
            # it's okay for rejected to have some footer *if* you crafted it differently,
            # but we nudge toward footer-missing for medium/high to emphasize contrast.
            pass
    return ok

def check_jsonl(p, fields):
    ok=True; n=0
    for i,line in enumerate(p.open(),1):
        try: obj=json.loads(line)
        except Exception as e:
            print(f"[ERROR] {p}:{i} invalid JSON: {e}"); ok=False; break
        miss=[k for k in fields if k not in obj]
        if miss: print(f"[ERROR] {p}:{i} missing {miss}"); ok=False
        n+=1
    print(f"[INFO] {p} lines: {n}")
    return ok

ok=True
ok &= check_jsonl(SFT, ["prompt","response"])
ok &= check_jsonl(DPO, ["prompt","chosen","rejected"])
ok &= check_sft(SFT)
ok &= check_dpo(DPO)
print("[RESULT] DATA OK" if ok else "[RESULT] DATA NEEDS FIXES")
