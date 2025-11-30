#!/bin/bash
mkdir -p backend/wheels
pip download \
    --platform manylinux_2_17_aarch64 \
    --python-version 3.13 \
    --only-binary=:all: \
    --dest backend/wheels \
    -r backend/requirements.txt
