#!/bin/bash

# Test script to simulate a complete auth callback with real tokens

echo "🧪 Testing auth callback with sample tokens..."

# Create a realistic auth callback URL
AUTH_URL="ekrown-classroom://auth/callback#access_token=eyJhbGciOiJIUzI1NiIsImtpZCI6Ild3bVN5djRwZmxJdGgxMzIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xlZnNtb3NoaXJydXJuaHVpcnlpLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0MWY5NGNlNS05ODFjLTQyZWQtOGZjNi1hMmMzOTA1M2VhZTEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ5NTYyNjk1LCJpYXQiOjE3NDk1NTkwOTUsImVtYWlsIjoiZGVlbi5vYmFzYUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiZGVlbi5vYmFzYUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyc3RfbmFtZSI6ImRlZW4iLCJsYXN0X25hbWUiOiJrcm93biIsIm9yZ2FuaXphdGlvbiI6IiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNDFmOTRjZTUtOTgxYy00MmVkLThmYzYtYTJjMzkwNTNlYWUxIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoib3RwIiwidGltZXN0YW1wIjoxNzQ5NTU5MDk1fV0sInNlc3Npb25faWQiOiIzMGEzNjk1Mi00MTRjLTRkNzUtOWNmMC02YzZmODhmZjNiMmYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.LI7OIRTCadG9bA4n5wJ-FMDhUhHUR6v3j74S0&expires_at=1749562695&expires_in=3600&refresh_token=udfs7alkweeh&token_type=bearer&type=signup"

echo "🔗 Auth URL: $AUTH_URL"
echo ""

echo "📋 Testing protocol handler methods:"
echo ""

echo "1️⃣ Testing with xdg-open..."
timeout 10 xdg-open "$AUTH_URL"
echo ""

echo "2️⃣ Testing with gtk-launch..."
timeout 10 gtk-launch ekrown-classroom.desktop "$AUTH_URL"
echo ""

echo "3️⃣ Testing direct script execution..."
timeout 10 /home/ekrown/google-classroom-electron-client/handle-protocol.sh "$AUTH_URL"
echo ""

echo "✅ Testing complete. Check the running app for authentication status."