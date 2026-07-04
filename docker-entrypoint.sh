#!/bin/bash

# If MONGODB_URI is not provided, start the internal MongoDB
if [ -z "$MONGODB_URI" ] || [[ "$MONGODB_URI" == *"localhost"* ]] || [[ "$MONGODB_URI" == *"127.0.0.1"* ]]; then
  echo "No external MongoDB URI detected. Starting internal MongoDB..."
  
  # Ensure the data directory exists and has correct permissions
  mkdir -p /data/db
  
  # Start mongod in the background (forked)
  mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db --bind_ip_all
  
  if [ $? -ne 0 ]; then
    echo "Failed to start internal MongoDB."
    exit 1
  fi
else
  echo "External MongoDB URI detected ($MONGODB_URI). Skipping internal MongoDB startup..."
fi

# Start Node.js backend
echo "Starting Node.js backend..."
cd /app/backend
exec node app.js
