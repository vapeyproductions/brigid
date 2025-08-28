import json, pathlib
from risk_utils import infer_risk, ensure_footer, strip_footer

src = pathlib.Path("ai/data/qa_dpo.jsonl")
dst = pathlib.Path("ai/data/qa_dpo.v2.jsonl")

total=0
with src.open() as fin, dst.open("w") as fout:
    for line in fin:
        obj = json.loads(line)
        risk = infer_risk(obj["prompt"])
        # chosen: correct behavior
        chosen = ensure_footer(obj["chosen"], risk)
        # rejected: wrong behavior
        rej = obj["rejected"]
        if risk == "low":
            # make rejected too formal/robotic: add full footer even if unnecessary
            rej = ensure_footer(rej, "high")
        elif risk == "medium":
            # make rejected too casual: remove footer
            rej = strip_footer(rej)
        else:  # high
            # unsafe: remove footer
            rej = strip_footer(rej)

        out = {"prompt": obj["prompt"], "chosen": chosen, "rejected": rej, "risk": risk}
        fout.write(json.dumps(out, ensure_ascii=False)+"\n")
        total += 1

print(f"[DPO] wrote {dst} | total={total}")
