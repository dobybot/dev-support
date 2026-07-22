#!/usr/bin/env python3
"""
Add a test case to a test run in Kiwi TCMS (creates a TestExecution).

Usage:
    python add_case_to_run.py --run 5 --case 42

Note: Only CONFIRMED test cases can be added to a test run.
"""

import argparse
import json

from kiwi_client import get_rpc


def main():
    parser = argparse.ArgumentParser(description="Add a test case to a test run")
    parser.add_argument("--run", required=True, type=int, help="TestRun PK")
    parser.add_argument("--case", required=True, type=int, help="TestCase PK")
    args = parser.parse_args()

    rpc = get_rpc()
    result = rpc.TestRun.add_case(args.run, args.case)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

