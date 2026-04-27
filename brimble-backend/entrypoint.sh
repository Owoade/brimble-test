#!/bin/sh

DATA_DIR="/root/data"

DEFAULT_DIR="/root/defaults"

# Ensure directory exists

mkdir -p "$DATA_DIR"

touch brimble.db

# If volume is empty, copy defaults

if [ -z "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then

  echo "Initializing volume with default data..."

  cp -r "$DEFAULT_DIR"/* "$DATA_DIR"/

else

  echo "Volume already has data, skipping init."

fi

exec "$@"