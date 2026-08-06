#!/bin/bash
set -e

cd "$(dirname "$0")/web"

echo "Deploying..."
DEPLOY_URL=$(vercel deploy --prod --archive=tgz 2>&1 | grep "^Production:" | tail -1 | sed 's/\x1b\[[0-9;]*m//g' | awk '{print $2}')

echo "Deployed to: $DEPLOY_URL"
echo "Updating pulse-fc.app alias..."
vercel alias set "$DEPLOY_URL" pulse-fc.app

echo "Done — pulse-fc.app is live."
