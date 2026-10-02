#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 falsify.py
python3 check-evidence.py
