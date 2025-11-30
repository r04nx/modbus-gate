#!/bin/bash

echo "Building Backend (Compiling to Bytecode)..."
# Compile all Python files to .pyc to optimize startup time
python3 -m compileall .

echo "Backend build complete. Bytecode generated in __pycache__ directories."
