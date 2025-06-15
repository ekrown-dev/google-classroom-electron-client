#!/bin/bash

echo "🚀 Starting eKROWN Classroom AI Assistant for authentication..."

# Kill any existing instances
pkill -f "google-classroom-electron-client" 2>/dev/null || true

# Change to app directory
cd "/home/ekrown/google-classroom-electron-client"

# Start the app in the background
npm run electron:dev &
APP_PID=$!

echo "📱 App starting with PID: $APP_PID"
echo "⏳ Waiting for app to be ready (15 seconds)..."

# Wait for app to start
sleep 15

echo "✅ App should now be ready to receive authentication callbacks!"
echo ""
echo "📋 Now you can:"
echo "   1. Click the email confirmation link"
echo "   2. Click 'Open Desktop App' when prompted"
echo "   3. Or paste the protocol URL in your browser"
echo ""
echo "🔗 Example protocol URL format:"
echo "   ekrown-classroom://auth/callback#access_token=...&refresh_token=..."
echo ""
echo "📱 App PID: $APP_PID (use 'kill $APP_PID' to stop)"

# Wait for user input to keep script running
echo "Press Ctrl+C to stop the app"
wait $APP_PID