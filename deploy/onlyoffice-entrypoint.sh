#!/bin/sh
# Renders separate JWT secrets for the document server, then hands over to the
# image's own entrypoint. The image only supports one JWT_SECRET for all
# purposes; local-production-linux.json overrides its local.json.
#   inbox/browser: editor configs and CommandService/ConvertService requests
#   outbox:        callbacks the document server sends to the app
set -eu
: "${ONLYOFFICE_INBOX_SECRET:?set ONLYOFFICE_INBOX_SECRET}"
: "${ONLYOFFICE_OUTBOX_SECRET:?set ONLYOFFICE_OUTBOX_SECRET}"
umask 022
cat > /etc/onlyoffice/documentserver/local-production-linux.json <<JSON
{
  "services": {
    "CoAuthoring": {
      "secret": {
        "browser": { "string": "${ONLYOFFICE_INBOX_SECRET}" },
        "inbox": { "string": "${ONLYOFFICE_INBOX_SECRET}" },
        "outbox": { "string": "${ONLYOFFICE_OUTBOX_SECRET}" }
      },
      "autoAssembly": { "enable": true, "interval": "5m", "step": "1m" }
    }
  }
}
JSON
exec /app/ds/run-document-server.sh "$@"
