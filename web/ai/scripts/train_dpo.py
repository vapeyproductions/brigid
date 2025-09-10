import os
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM

# Try 4-bit QLoRA (bitsandbytes present on GPU)
bnb_available = False
try:
    from transformers import BitsAndBytesConfig
    import importlib.metadata as ilmd; ilmd.version("bitsandbytes")
    bnb_available = True
except Exception:
    bnb_available = False

from peft import PeftModel
from trl import DPOTrainer, DPOConfig

# ---------- ENV ----------
BASE_MODEL  = os.environ.get("BASE_MODEL",  "openai/gpt-oss-20b")
SFT_ADAPTER = os.environ.get("SFT_ADAPTER", "ai/out/qa")              # SFT output dir
DPO_PATH    = os.environ.get("DPO_PATH",    "ai/data/qa_dpo.jsonl")   # DPO dataset
OUT_DIR     = os.environ.get("OUT_DIR",     "ai/out/qa_dpo")
CTX_LEN     = int(os.environ.get("CTX_LEN", "2048"))

SYSTEM = (
    "You are a cautious, non-diagnostic assistant for pregnancy education. "
    "Use simple, supportive language. Keep answers ≤120 words. "
    "Use conditional safety: low→no footer, medium→gentle footer, high→full footer."
)

def is_gpt_oss(name: str) -> bool:
    return "gpt-oss" in (name or "").lower()

def to_harmony(system: str, user: str) -> str:
    # Harmony chat headers: system → user → assistant
    return (f"<|start_header_id|>system<|end_header_id|>\n{system}\n<|eot_id|>"
            f"<|start_header_id|>user<|end_header_id|>\n{user}\n<|eot_id|>"
            f"<|start_header_id|>assistant<|end_header_id|>\n")

def wrap_prompt(p: str) -> str:
    if is_gpt_oss(BASE_MODEL):
        return to_harmony(SYSTEM, p)
    # Fallback (non-harmony)
    return f"<|system|>\n{SYSTEM}\n<|user|>\n{p}\n<|assistant|>\n"

def main():
    print(f"[INFO] Loading DPO dataset: {DPO_PATH}")
    ds = load_dataset("json", data_files=DPO_PATH, split="train")
    ds = ds.map(lambda ex: {"prompt": wrap_prompt(ex["prompt"]),
                            "chosen": ex["chosen"], "rejected": ex["rejected"]})

    print(f"[INFO] Loading tokenizer: {BASE_MODEL}")
    tok = AutoTokenizer.from_pretrained(BASE_MODEL, use_fast=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    print(f"[INFO] Loading base model ({'4-bit' if bnb_available else 'full precision'}) and applying SFT adapter: {SFT_ADAPTER}")
    model_kwargs = {"device_map": "auto"} if bnb_available else {}
    if bnb_available:
        qcfg = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype="bfloat16",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
        )
        model_kwargs["quantization_config"] = qcfg

    base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, **model_kwargs)
    model = PeftModel.from_pretrained(base, SFT_ADAPTER)  # stack DPO on top of SFT

    cfg = DPOConfig(
        output_dir=OUT_DIR,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=12,   # bump to 16–24 if tight on VRAM
        num_train_epochs=1,               # 2 for extra polish if time allows
        learning_rate=1e-5,
        beta=0.1,
        max_length=CTX_LEN,
        max_prompt_length=min(CTX_LEN//2, 1024),
        logging_steps=10,
        save_strategy="steps",
        save_steps=200,
        save_total_limit=2,
        report_to=[],
        bf16=True,                        # Ampere+; set False if needed
        gradient_checkpointing=True,
        optim="adamw_torch",
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        seed=42,
    )

    # Auto-resume if a checkpoint exists
    resume = None
    if os.path.isdir(OUT_DIR):
        cps = [d for d in os.listdir(OUT_DIR) if d.startswith("checkpoint-")]
        if cps:
            latest = sorted(cps, key=lambda x: int(x.split("-")[-1]))[-1]
            resume = os.path.join(OUT_DIR, latest)
            print(f"[INFO] Resuming from {resume}")

    print("[INFO] Starting DPO training …")
    trainer = DPOTrainer(
        model=model,
        args=cfg,
        beta=cfg.beta,
        train_dataset=ds,
        tokenizer=tok,
    )
    trainer.train(resume_from_checkpoint=resume)

    print(f"[INFO] Saving DPO adapter → {OUT_DIR}")
    trainer.model.save_pretrained(OUT_DIR)
    tok.save_pretrained(OUT_DIR)
    print("[INFO] Done.")

if __name__ == "__main__":
    main()
