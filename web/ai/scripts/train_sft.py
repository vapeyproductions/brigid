import os
from datasets import load_dataset
from transformers import (AutoModelForCausalLM, AutoTokenizer, Trainer,
                          TrainingArguments, DataCollatorForLanguageModeling,
                          BitsAndBytesConfig)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# Use a HF base you can later swap for gpt-oss. For your current dev flow with phi3:
# microsoft/Phi-3-mini-4k-instruct matches "phi3:mini" in Ollama.
BASE = os.environ.get("BASE_MODEL", "microsoft/Phi-3-mini-4k-instruct")
DATA = os.environ.get("SFT_PATH", "ai/data/qa_sft.jsonl")
OUT  = os.environ.get("OUT_DIR",  "ai/out/qa")
MAXLEN = int(os.environ.get("CTX_LEN", "2048"))

SYSTEM = "You are a cautious, non-diagnostic assistant for pregnancy education. Use simple, supportive language. Keep answers ≤120 words. Always end with: ‘If you’re concerned, contact your clinician or go to Labor & Delivery.’"

def wrap(ex):
    # Simple generic chat wrap. If you change base families later, ensure the template matches.
    return f"<|system|>\n{SYSTEM}\n<|user|>\n{ex['prompt']}\n<|assistant|>\n{ex['response']}"

def main():
    ds = load_dataset("json", data_files=DATA, split="train")
    ds = ds.map(lambda ex: {"text": wrap(ex)})

    tok = AutoTokenizer.from_pretrained(BASE, use_fast=True)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    # 4-bit QLoRA
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype="bfloat16",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4"
    )
    model = AutoModelForCausalLM.from_pretrained(BASE, quantization_config=bnb, device_map="auto")
    model = prepare_model_for_kbit_training(model)

    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05,
        target_modules=["q_proj","k_proj","v_proj","o_proj"],
        bias="none",
        task_type="CAUSAL_LM"
    )
    model = get_peft_model(model, lora)

    def tok_fn(ex): return tok(ex["text"], truncation=True, max_length=MAXLEN)
    tds = ds.map(tok_fn, remove_columns=ds.column_names)
    collator = DataCollatorForLanguageModeling(tok, mlm=False)

    args = TrainingArguments(
        output_dir=OUT,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,
        num_train_epochs=2,
        learning_rate=2e-4,
        logging_steps=10,
        save_strategy="epoch",
        bf16=True,
        optim="paged_adamw_32bit",
        lr_scheduler_type="cosine",
        warmup_ratio=0.05
    )

    trainer = Trainer(model=model, args=args, train_dataset=tds, data_collator=collator)
    trainer.train()
    model.save_pretrained(OUT)
    tok.save_pretrained(OUT)

if __name__ == "__main__":
    main()
