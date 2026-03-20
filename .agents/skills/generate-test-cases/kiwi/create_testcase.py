#!/usr/bin/env python3
"""
Create a single test case in Kiwi TCMS.

Usage:
    python create_testcase.py \
      --summary "ทดสอบการอัพโหลดเอกสาร eTax" \
      --product 1 \
      --category 5 \
      --priority 1 \
      --case-status 2 \
      --text "## เงื่อนไขเบื้องต้น..."
"""

import argparse
import json

from kiwi_client import get_rpc


def main():
    parser = argparse.ArgumentParser(description="Create a Kiwi TCMS test case")
    parser.add_argument("--summary", required=True, help="Test case summary")
    parser.add_argument("--product", required=True, type=int, help="Product PK")
    parser.add_argument("--category", required=True, type=int, help="Category PK")
    parser.add_argument("--priority", required=True, type=int, help="Priority PK")
    parser.add_argument("--case-status", required=True, type=int, help="TestCaseStatus PK")
    parser.add_argument("--text", default="", help="Test case body text (Markdown)")
    parser.add_argument("--is-automated", action="store_true", help="Mark as automated")
    parser.add_argument("--notes", default="", help="Additional notes")
    args = parser.parse_args()

    values = {
        "summary": args.summary,
        "product": args.product,
        "category": args.category,
        "priority": args.priority,
        "case_status": args.case_status,
        "is_automated": args.is_automated,
        "text": args.text,
        "notes": args.notes,
    }

    rpc = get_rpc()
    result = rpc.TestCase.create(values)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
