#!/bin/bash

set -e

TARGET_DIR="$HOME/owoade_brimble"

SOURCE_DIR="./defaults"

mkdir -p "$TARGET_DIR"

if [ -d "$SOURCE_DIR" ]; then

    cp -rn "$SOURCE_DIR"/. "$TARGET_DIR"/

fi


mkdir -p "$TARGET_DIR/db"


DB_FILE="$TARGET_DIR/db/brimble.db"

if [ ! -f "$DB_FILE" ]; then

    touch "$DB_FILE"

fi

echo "Setup complete at $TARGET_DIR"

docker compose up -d

