#!/bin/bash

# Configuration
THRESHOLD=$1
RETENTION_ENABLED=$2
RETENTION_DAYS=$3
LOG_FILE="/var/log/vistaiot_cleanup.log"

if [ -z "$THRESHOLD" ]; then
    THRESHOLD=85
fi

# Log Retention Cleanup (Runs regardless of disk usage if enabled)
if [ "$RETENTION_ENABLED" == "1" ] && [ ! -z "$RETENTION_DAYS" ]; then
    echo "$(date): Running Log Retention Policy (Keep $RETENTION_DAYS days)" >> $LOG_FILE
    # Find and delete logs older than X days
    find /var/log -type f -name "*.log" -mtime +$RETENTION_DAYS -delete
    find /var/log -type f -name "*.gz" -mtime +$RETENTION_DAYS -delete
    find /var/log -type f -name "*.1" -mtime +$RETENTION_DAYS -delete
    echo "$(date): Log retention cleanup complete." >> $LOG_FILE
fi

# Get current usage percentage of root partition
USAGE=$(df / | grep / | awk '{ print $5 }' | sed 's/%//g')

echo "$(date): Checking Disk Usage: ${USAGE}% (Threshold: ${THRESHOLD}%)" >> $LOG_FILE

if [ "$USAGE" -gt "$THRESHOLD" ]; then
    echo "$(date): Threshold exceeded. Starting aggressive cleanup..." >> $LOG_FILE
    
    # 1. Vacuum Journal
    journalctl --vacuum-size=50M
    
    # 2. Clean APT
    apt-get clean
    apt-get autoremove -y
    
    # 3. Clean Old Logs (Aggressive fallback)
    find /var/log -type f -name '*.gz' -delete
    find /var/log -type f -name '*.1' -delete
    
    # 4. Truncate large logs (>50MB)
    find /var/log -type f -size +50M -name '*.log' -exec truncate -s 0 {} \;
    
    NEW_USAGE=$(df / | grep / | awk '{ print $5 }' | sed 's/%//g')
    echo "$(date): Cleanup Complete. New Usage: ${NEW_USAGE}%" >> $LOG_FILE
else
    echo "$(date): Usage below threshold. No further action taken." >> $LOG_FILE
fi
