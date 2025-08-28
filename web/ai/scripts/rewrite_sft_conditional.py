import json, pathlib
from risk_utils import infer_risk, ensure_footer

src = pathlib.Path("ai/data/qa_sft.jsonl")
dst = pathlib.Path("ai/data/qa_sft.v2.jsonl")

total=low=med=high=0
with src.open() as fin, dst.open("w") as fout:
    for line in fin:
        obj = json.loads(line)
        risk = infer_risk(obj["prompt"])
        obj["response"] = ensure_footer(obj["response"], risk)
        obj["risk"] = risk
        total += 1
        if risk=="low": low+=1
        elif risk=="medium": med+=1
        else: high+=1
        fout.write(json.dumps(obj, ensure_ascii=False)+"\n")

print(f"[SFT] wrote {dst} | total={total} (low={low}, med={med}, high={high})")
