#!/usr/bin/env python3
"""
Generic entity filter for Kiwi TCMS.

Usage:
    python lookup.py <Entity> '<json_filter>'

Examples:
    python lookup.py Product '{"name": "Dobybot"}'
    python lookup.py TestPlan '{"name__icontains": "eTax"}'
    python lookup.py User '{"email": "t.thanasopon@gmail.com"}'
    python lookup.py Priority '{}'
    python lookup.py TestCaseStatus '{"name": "CONFIRMED"}'
    python lookup.py Version '{"product__name": "Dobybot", "value": "uat"}'
    python lookup.py Build '{"version__value": "uat", "name": "uat"}'
    python lookup.py PlanType '{"name": "Functional"}'
    python lookup.py Category '{"product__name": "Dobybot", "name": "eTax/Document Upload"}'
    python lookup.py TestCase '{"summary__icontains": "eTax"}'
"""

import json
import sys

from kiwi_client import get_rpc


ENTITY_MAP = {
    "Build": "Build",
    "Category": "Category",
    "Component": "Component",
    "PlanType": "PlanType",
    "Priority": "Priority",
    "Product": "Product",
    "Tag": "Tag",
    "TestCase": "TestCase",
    "TestCaseStatus": "TestCaseStatus",
    "TestExecution": "TestExecution",
    "TestExecutionStatus": "TestExecutionStatus",
    "TestPlan": "TestPlan",
    "TestRun": "TestRun",
    "User": "User",
    "Version": "Version",
}


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <Entity> '<json_filter>'", file=sys.stderr)
        print(f"Entities: {', '.join(sorted(ENTITY_MAP.keys()))}", file=sys.stderr)
        sys.exit(1)

    entity_name = sys.argv[1]
    filter_json = sys.argv[2]

    if entity_name not in ENTITY_MAP:
        print(f"Unknown entity: {entity_name}", file=sys.stderr)
        print(f"Available: {', '.join(sorted(ENTITY_MAP.keys()))}", file=sys.stderr)
        sys.exit(1)

    query = json.loads(filter_json)
    rpc = get_rpc()
    entity = getattr(rpc, ENTITY_MAP[entity_name])
    results = entity.filter(query)

    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

