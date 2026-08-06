#!/usr/bin/env python3
"""สรุป token usage + cost estimate ของ workflow run หนึ่งอัน

Usage:
    python3 usage_report.py <transcript_dir>

<transcript_dir> = โฟลเดอร์ wf_<runId> ที่มี journal.jsonl และ agent-*.jsonl
(path นี้อยู่ใน tool result ของ Workflow / task notification)

อ่านทุก agent-*.jsonl → เก็บ event assistant ที่มี message.usage →
dedup ด้วย message.id (streaming เขียน usage ซ้ำหลายบรรทัดต่อ message เดียว
เอาบรรทัดสุดท้ายของแต่ละ id) → aggregate per-agent และ per-model →
คูณตาราง pricing → พิมพ์ตาราง markdown
"""

import glob
import json
import os
import re
import sys

# ราคา USD ต่อ 1M tokens: (input, cache write 5m, cache read, output)
# อัปเดตมือเมื่อ Anthropic เปลี่ยนราคา — https://docs.anthropic.com/en/docs/about-claude/pricing
PRICING = {
    "claude-fable-5":  (10.00, 12.50, 1.00, 50.00),
    "claude-opus-5":   (5.00, 6.25, 0.50, 25.00),
    "claude-opus-4":   (15.00, 18.75, 1.50, 75.00),   # opus 4.x
    "claude-sonnet-5": (3.00, 3.75, 0.30, 15.00),     # intro ถึง 2026-08-31 = 2/10
    "claude-sonnet-4": (3.00, 3.75, 0.30, 15.00),
    "claude-haiku-4":  (1.00, 1.25, 0.10, 5.00),
}


def price_for(model: str):
    for prefix, p in PRICING.items():
        if model.startswith(prefix):
            return p
    return None


LABEL_RE = re.compile(r"^\[([a-z][0-9]:[^\]\n]{1,40})\]")


def collect(path: str):
    """ต่อไฟล์ agent: dedup ด้วย message.id, คืน (label, dict per-model)

    label มาจาก tag `[s2:ชื่องาน]` ที่ convention ของ skill บังคับให้ขึ้นต้น prompt
    ถ้าไม่มี (run ที่ไม่ได้ผ่าน skill นี้) fallback เป็นต้น prompt
    tool_calls = จำนวน tool_use block · turns = จำนวน assistant message
    (นับจากบรรทัดสุดท้ายของแต่ละ message.id เพราะ streaming เขียนซ้ำ)
    """
    seen = {}  # message.id -> (model, usage, n_tool_use)
    label = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            m = o.get("message")
            if not isinstance(m, dict):
                continue
            if label is None and o.get("type") == "user":
                c = m.get("content")
                text = c if isinstance(c, str) else next(
                    (b.get("text", "") for b in c or [] if isinstance(b, dict)
                     and b.get("type") == "text"), "")
                mt = LABEL_RE.match(text)
                label = mt.group(1) if mt else (text.strip().split("\n")[0][:40] or "?")
            if m.get("usage") and m.get("id"):
                content = m.get("content") or []
                n_tools = sum(1 for b in content if isinstance(b, dict)
                              and b.get("type") == "tool_use")
                seen[m["id"]] = (m.get("model", "unknown"), m["usage"], n_tools)
    agg = {}
    for model, u, n_tools in seen.values():
        c = agg.setdefault(model, {"turns": 0, "tools": 0, "in": 0, "cw": 0, "cr": 0, "out": 0})
        c["turns"] += 1
        c["tools"] += n_tools
        c["in"] += u.get("input_tokens", 0)
        c["cw"] += u.get("cache_creation_input_tokens", 0)
        c["cr"] += u.get("cache_read_input_tokens", 0)
        c["out"] += u.get("output_tokens", 0)
    return label or "?", agg


def cost(model: str, c: dict):
    p = price_for(model)
    if p is None:
        return None
    return (c["in"] * p[0] + c["cw"] * p[1] + c["cr"] * p[2] + c["out"] * p[3]) / 1e6


def fmt_tok(n: int) -> str:
    return f"{n/1000:.1f}k" if n >= 1000 else str(n)


def main():
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    d = sys.argv[1]

    files = sorted(glob.glob(os.path.join(d, "agent-*.jsonl")))
    if not files:
        print(f"ไม่พบ agent-*.jsonl ใน {d}", file=sys.stderr)
        sys.exit(1)

    total = {}
    rows = []
    unknown_models = set()
    for path in files:
        label, agg = collect(path)
        for model, c in agg.items():
            usd = cost(model, c)
            if usd is None:
                unknown_models.add(model)
            rows.append((label, model, c, usd))
            t = total.setdefault(model, {"turns": 0, "tools": 0, "in": 0, "cw": 0, "cr": 0, "out": 0})
            for k in t:
                t[k] += c[k]

    header = "| agent | model | turns | tools | input | cache write | cache read | output | est. cost |"
    sep = "|---|---|--:|--:|--:|--:|--:|--:|--:|"
    print(header)
    print(sep)
    for label, model, c, usd in rows:
        cost_s = f"${usd:.2f}" if usd is not None else "?"
        print(f"| {label} | {model} | {c['turns']} | {c['tools']} | {fmt_tok(c['in'])} "
              f"| {fmt_tok(c['cw'])} | {fmt_tok(c['cr'])} | {fmt_tok(c['out'])} | {cost_s} |")

    grand = 0.0
    complete = True
    print(sep)
    for model, c in sorted(total.items()):
        usd = cost(model, c)
        if usd is None:
            complete = False
            cost_s = "?"
        else:
            grand += usd
            cost_s = f"${usd:.2f}"
        print(f"| **total** | {model} | {c['turns']} | {c['tools']} | {fmt_tok(c['in'])} "
              f"| {fmt_tok(c['cw'])} | {fmt_tok(c['cr'])} | {fmt_tok(c['out'])} | {cost_s} |")

    suffix = "" if complete else " (ไม่รวม model ที่ไม่รู้ราคา)"
    print(f"\n**Estimated total: ${grand:.2f}**{suffix}")
    if unknown_models:
        print(f"\n⚠️ model ที่ไม่มีในตาราง PRICING: {', '.join(sorted(unknown_models))} "
              f"— เพิ่มราคาใน usage_report.py")


if __name__ == "__main__":
    main()
