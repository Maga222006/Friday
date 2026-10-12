#!/bin/sh
# Restarts Aegra (friday-api) when config.yaml changes, so saved models / MCP servers apply
# without a manual restart. A config that doesn't load is not applied: Aegra keeps running
# with the previous one and the reason is logged (docker compose logs config-reload).
# The project folder is mounted (not the single file), so edits that replace the file are seen too.
CONFIG=/friday/config.yaml
API=friday-api
WEB=friday-web

applied=$(sha1sum "$CONFIG" 2>/dev/null)
inode=$(stat -c %i "$CONFIG" 2>/dev/null)
while sleep 5; do
  now=$(sha1sum "$CONFIG" 2>/dev/null) || continue
  [ "$now" = "$applied" ] && continue
  sleep 2; [ "$(sha1sum "$CONFIG" 2>/dev/null)" = "$now" ] || continue   # still being written
  [ "$(docker inspect -f '{{.State.Running}}' "$API" 2>/dev/null)" = true ] || continue

  # load the new file the way Aegra will (it's piped in: the container's own single-file mount
  # still shows the old file if an editor replaced it instead of writing into it)
  if out=$(docker exec -i "$API" python -c "import sys, os, yaml
from friday.config import Config
Config.model_validate(yaml.safe_load(os.path.expandvars(sys.stdin.read())))" < "$CONFIG" 2>&1); then
    echo "$(date -u +%FT%TZ) config.yaml changed: restarting $API"
    docker restart "$API" >/dev/null
    # replaced file: the web container's mount (⚙ Config editor) still points at the old one
    if [ "$(stat -c %i "$CONFIG")" != "$inode" ]; then
      inode=$(stat -c %i "$CONFIG")
      echo "$(date -u +%FT%TZ) config.yaml was replaced: restarting $WEB"
      docker restart "$WEB" >/dev/null
    fi
  else
    echo "$(date -u +%FT%TZ) config.yaml changed but doesn't load, keeping the running config:"
    echo "$out" | grep -v "^[[:space:]]*$" | tail -3
  fi
  applied=$now
done
