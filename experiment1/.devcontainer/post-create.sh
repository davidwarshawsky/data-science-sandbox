#!/bin/bash
set -e

# Create venv if not exists
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

# Activate and install
source .venv/bin/activate
pip install -r requirements.txt

# Create initial hashes (if input exists)
echo "Calculating input hashes..."
# This would be where we do the "Black Box" logic start
