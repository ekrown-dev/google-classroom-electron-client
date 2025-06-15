#!/bin/bash

# Test script to simulate authentication callback

echo "Testing authentication callback..."
echo "Make sure the app is running first!"
echo ""

# Test URL (replace with actual tokens if you have them)
test_url="ekrown-classroom://auth/callback#access_token=test_token&token_type=bearer&expires_in=3600&refresh_token=test_refresh&type=recovery"

echo "Simulating authentication callback with URL:"
echo "$test_url"
echo ""

# On Linux, use xdg-open to trigger the custom protocol
if command -v xdg-open >/dev/null 2>&1; then
    echo "Opening URL with xdg-open..."
    xdg-open "$test_url"
elif command -v open >/dev/null 2>&1; then
    echo "Opening URL with open (macOS)..."
    open "$test_url"
else
    echo "Cannot find a way to open URLs. Please open this URL manually:"
    echo "$test_url"
fi

echo ""
echo "The app should now receive the authentication callback."
echo "Check the app logs for authentication status updates."
echo ""

sleep 3

echo "Testing complete. Check the running app for authentication status."