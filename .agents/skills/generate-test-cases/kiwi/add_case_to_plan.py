#!/usr/bin/env python3
"""
Link a test case to a test plan in Kiwi TCMS.

Usage:
    python add_case_to_plan.py --plan 10 --case 42
"""

import argparse
import json

from kiwi_client import get_rpc


def main():
    parser = argparse.ArgumentParser(description="Add a test case to a test plan")
    parser.add_argument("--plan", required=True, type=int, help="TestPlan PK")
    parser.add_argument("--case", required=True, type=int, help="TestCase PK")
    args = parser.parse_args()

    rpc = get_rpc()
    result = rpc.TestPlan.add_case(args.plan, args.case)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

