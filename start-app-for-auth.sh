#!/bin/bash

echo "Starting eKROWN Classroom AI Assistant for authentication..."

# Kill any existing npm processes first
echo "Stopping any existing processes..."
pkill -f "npm run start"
sleep 2

# Navigate to the app directory
cd "$(dirname "$0")"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the app in background
echo "Starting Electron app..."
npm run start &

# Wait for the app to initialize
sleep 5

echo "App should now be ready to receive authentication callbacks!"
echo ""
echo "📋 Now you can:"
echo "   1. Click the email confirmation link"
echo "   2. Click 'Open Desktop App' when prompted"
echo "   3. Or paste the protocol URL in your browser"
echo ""
echo "🔗 Example protocol URL format:"
echo "   ekrown-classroom://auth/callback#access_token=...&refresh_token=..."
echo ""

# Keep the script running so the app stays active
echo "Press Ctrl+C to stop the app..."
wait