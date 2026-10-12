#!/bin/sh
# Restarts Aegra (friday-api) when config.yaml changes, so saved models / MCP servers apply
# without a manual restart. A config that doesn't load is not applied: Aegra keeps running
# with the previous one and the reason is logged (docker compose logs config-reload).
# The project folder is mounted (not the single file), so edits that replace the file are seen too.
CONFIG=/friday/config.yaml
API=friday-api

applied=$(sha1sum "$CONFIG" 2>/dev/null)
while sleep 5; do
  now=$(sha1sum "$CONFIG" 2>/dev/null) || continue
  [ "$now" = "$applied" ] && continue
  sleep 2; [ "$(sha1sum "$CONFIG" 2>/dev/null)" = "$now" ] || continue   # still being written
  [ "$(docker inspect -f '{{.State.Running}}' "$API" 2>/dev/null)" = true ] || continue

  # load it the way Aegra will, in a separate process inside the running container
  if out=$(docker exec "$API" python -c "import friday.config" 2>&1); then
    echo "$(date -u +%FT%TZ) config.yaml changed: restarting $API"
    docker restart "$API" >/dev/null
  else
    echo "$(date -u +%FT%TZ) config.yaml changed but doesn't load, keeping the running config:"
    echo "$out" | grep -v "^[[:space:]]*$" | tail -3
  fi
  applied=$now
done
