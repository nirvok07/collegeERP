#!/usr/bin/env python3
"""Start the College ERP backend dev server (npm run dev)."""
import subprocess
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent


def main() -> int:
    return subprocess.call(["npm", "run", "dev"], cwd=SERVER_DIR)


if __name__ == "__main__":
    sys.exit(main())
