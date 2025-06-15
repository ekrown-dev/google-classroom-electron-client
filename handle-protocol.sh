#!/bin/bash

# Protocol handler script for ekrown-classroom:// URLs
URL="$1"

echo "Received protocol URL: $URL"

# Change to app directory
cd "/home/ekrown/google-classroom-electron-client"

# Check if the app is already running
APP_PID=$(pgrep -f "google-classroom-electron-client")

if [ -n "$APP_PID" ]; then
    echo "App is already running (PID: $APP_PID)"
    echo "Launching second instance to pass URL to main app..."
    # Launch second instance with the protocol URL
    # This will trigger the 'second-instance' event in the main app
    npm run electron:dev "$URL" &
    # Give it a moment to pass the URL, then it will quit automatically
    sleep 2
    echo "URL passed to running app"
else
    echo "App is not running, starting it with protocol URL..."
    # Start the app with the protocol URL as argument
    npm run electron:dev "$URL" &
    echo "App started with protocol URL"
fi

# Also log the URL for debugging
echo "Protocol URL logged at: $(date)"
echo "$URL" >> /tmp/ekrown-auth-urls.log