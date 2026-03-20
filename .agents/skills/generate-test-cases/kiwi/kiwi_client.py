"""
Shared Kiwi TCMS connection module.

Loads credentials from a .env file in the same directory as this script.

Required .env variables:
    KIWI_BASE_URL=https://your-kiwi-instance
    KIWI_USERNAME=your-username
    KIWI_PASSWORD=your-password

Usage:
    from kiwi_client import get_rpc
    rpc = get_rpc()
    result = rpc.Product.filter({"name": "Dobybot"})
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from tcms_api import TCMS

# Load .env from the same directory as this script (kiwi/)
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)


def get_rpc():
    """Return an XML-RPC proxy connected to Kiwi TCMS.

    Reads KIWI_BASE_URL, KIWI_USERNAME, KIWI_PASSWORD from .env file.
    """
    base_url = os.environ.get("KIWI_BASE_URL", "").rstrip("/")
    username = os.environ.get("KIWI_USERNAME")
    password = os.environ.get("KIWI_PASSWORD")

    if not all([base_url, username, password]):
        missing = [k for k in ("KIWI_BASE_URL", "KIWI_USERNAME", "KIWI_PASSWORD")
                   if not os.environ.get(k)]
        raise RuntimeError(
            f"Missing environment variables: {', '.join(missing)}. "
            f"Set them in {_env_path}"
        )

    url = f"{base_url}/xml-rpc/"
    return TCMS(url, username, password).exec

