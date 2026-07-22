#!/usr/bin/env python3
"""
Create a test plan in Kiwi TCMS.

Usage:
    python create_testplan.py \
      --name "Document Upload" \
      --product 1 \
      --version 5 \
      --type 1 \
      --text "Test plan for document upload feature"
"""

import argparse
import json

from kiwi_client import get_rpc


def main():
    parser = argparse.ArgumentParser(description="Create a Kiwi TCMS test plan")
    parser.add_argument("--name", required=True, help="Test plan name")
    parser.add_argument("--product", required=True, type=int, help="Product PK")
    parser.add_argument("--version", required=True, type=int, help="Product version PK")
    parser.add_argument("--type", required=True, type=int, help="PlanType PK")
    parser.add_argument("--text", default="", help="Test plan document text")
    args = parser.parse_args()

    values = {
        "name": args.name,
        "product": args.product,
        "product_version": args.version,
        "type": args.type,
        "text": args.text,
    }

    rpc = get_rpc()
    result = rpc.TestPlan.create(values)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
