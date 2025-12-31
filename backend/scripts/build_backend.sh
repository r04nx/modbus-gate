#!/bin/bash

echo "Building Backend (Compiling to Bytecode)..."
# Ensure we are in project root (parent of scripts dir)
cd "$(dirname "$0")/.."
# Compile all Python files to .pyc to optimize startup time
python3 -m compileall .

echo "Backend build complete. Bytecode generated in __pycache__ directories."
