#!/usr/bin/env python3
"""
Search test cases by tag, summary, or other criteria.

Usage:
    python search_testcases.py --tag "DBT-100"
    python search_testcases.py --summary "eTax"
    python search_testcases.py --tag "DBT-100" --summary "upload"
"""

import argparse
import json

from kiwi_client import get_rpc


def main():
    parser = argparse.ArgumentParser(description="Search Kiwi TCMS test cases")
    parser.add_argument("--id", type=int, help="Filter by Test Case ID (PK)")
    parser.add_argument("--tag", help="Filter by tag name")
    parser.add_argument("--summary", help="Filter by summary (case-insensitive contains)")
    parser.add_argument("--product", type=int, help="Filter by product PK")
    parser.add_argument("--category", type=int, help="Filter by category PK")
    args = parser.parse_args()

    query = {}
    if args.id:
        query["pk"] = args.id
    if args.tag:
        query["tag__name"] = args.tag
    if args.summary:
        query["summary__icontains"] = args.summary
    if args.product:
        query["category__product"] = args.product
    if args.category:
        query["category"] = args.category

    if not query:
        print("Error: at least one filter is required", file=sys.stderr)
        sys.exit(1)

    rpc = get_rpc()
    results = rpc.TestCase.filter(query)

    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    import sys
    main()

