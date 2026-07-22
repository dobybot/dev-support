#!/usr/bin/env python3
"""
Create a test run in Kiwi TCMS.

Usage:
    python create_testrun.py \
      --summary "DBT-100 Fix eTax upload 2026-03-20" \
      --plan 10 \
      --build 3 \
      --manager 1
"""

import argparse
import json

from kiwi_client import get_rpc


def main():
    parser = argparse.ArgumentParser(description="Create a Kiwi TCMS test run")
    parser.add_argument("--summary", required=True, help="Test run summary/name")
    parser.add_argument("--plan", required=True, type=int, help="TestPlan PK")
    parser.add_argument("--build", required=True, type=int, help="Build PK")
    parser.add_argument("--manager", required=True, type=int, help="Manager user PK")
    parser.add_argument("--default-tester", type=int, help="Default tester user PK")
    args = parser.parse_args()

    values = {
        "summary": args.summary,
        "plan": args.plan,
        "build": args.build,
        "manager": args.manager,
    }
    if args.default_tester:
        values["default_tester"] = args.default_tester

    rpc = get_rpc()
    result = rpc.TestRun.create(values)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
