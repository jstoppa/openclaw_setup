#!/bin/bash
# Chrome wrapper that injects anti-detection flags.
# OpenClaw calls this instead of Chrome directly.
# Only adds flags NOT already passed by OpenClaw's launchOpenClawChrome().

REAL_CHROME="/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"

exec "$REAL_CHROME" \
    --user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Safari/537.36" \
    --window-size=1920,1080 \
    --lang=en-US,en \
    --disable-infobars \
    --force-color-profile=srgb \
    --hide-scrollbars \
    --disable-notifications \
    --disable-popup-blocking \
    --disable-extensions \
    --disable-plugins \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-breakpad \
    --disable-component-extensions-with-background-pages \
    --disable-ipc-flooding-protection \
    --disable-renderer-backgrounding \
    --metrics-recording-only \
    --disable-features=AutomationControlled,EnableAutomation \
    --enable-features=NetworkService,NetworkServiceInProcess \
    --disable-domain-reliability \
    --disable-hang-monitor \
    "$@"
