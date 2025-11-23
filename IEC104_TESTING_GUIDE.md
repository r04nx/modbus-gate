# IEC 104 Server Testing Guide

## Current System Status

### ✅ Verified Working Components

1. **Backend API** - Running on `http://localhost:8000`
2. **Tag Polling** - System tags and user tags are updating
3. **IEC 104 Server** - Running on port 2404

## Testing with curl

### 1. Check Tag Values (Polling Verification)

```bash
curl -s http://localhost:8000/api/v1/tags/values | python3 -m json.tool
```

**Expected Output:**
```json
{
    "ROHAN20": {
        "value": "10",
        "timestamp": "2025-11-23T00:08:08.709955Z",
        "quality": "GOOD"
    },
    "SYS_CPU_USAGE": {
        "value": 34.4,
        "timestamp": "2025-11-23T00:10:47.698170Z",
        "quality": "GOOD"
    },
    "TEMPERATURE": {
        "value": 1054.0,
        "timestamp": "2025-11-23T00:10:47.703868Z",
        "quality": "GOOD"
    }
}
```

✅ **Status**: Tags are being polled and values are updating with timestamps

### 2. Check IEC 104 Server Configuration

```bash
curl -s http://localhost:8000/api/v1/servers | python3 -m json.tool | grep -A 20 "IEC104"
```

This will show the IEC 104 server configuration including:
- Port (default: 2404)
- Enabled status
- Tag mappings (IOA to tag_id)

### 3. Write Test Value to a Tag

To test the complete flow (write → poll → serve via IEC 104):

```bash
# Write a test value to a tag
curl -X POST http://localhost:8000/api/v1/tags/ROHAN20/write \
  -H "Content-Type: application/json" \
  -d '{"value": 42}'
```

**Expected Response:**
```json
{
    "message": "Tag ROHAN20 written successfully",
    "tag_id": "ROHAN20",
    "value": 42
}
```

### 4. Verify Value Update

```bash
# Check if the value was updated
curl -s http://localhost:8000/api/v1/tags/values | python3 -m json.tool | grep -A 5 "ROHAN20"
```

**Expected Output:**
```json
"ROHAN20": {
    "value": "42",
    "timestamp": "2025-11-23T00:XX:XX.XXXXXXZ",
    "quality": "GOOD"
}
```

## Testing IEC 104 Server with Client

### Using Python IEC 104 Client

The IEC 104 server is now serving tag values on port 2404. To test with a client:

```bash
# Run the existing IEC 104 test client
python3 test_iec104_client.py
```

This will:
1. Connect to the IEC 104 server on port 2404
2. Send an interrogation command
3. Receive all configured points with their current values

### Expected Behavior

For tags configured with IEC 104 mappings:

1. **Basic Tags**: Raw values are served directly
2. **Bit Extraction Tags**: Values are bit-masked before serving
   - Example: If `start_bit=3` and `length=1`, bit 3 is extracted
3. **Span Scaling Tags**: Values are scaled to engineering units
   - Example: Raw 0-65535 → Scaled to span_low to span_high range
4. **Combined Tags**: Bit extraction is applied first, then span scaling

## Test Scenarios

### Scenario 1: Basic Tag (No Transformation)

**Tag Configuration:**
```json
{
    "tag_id": "TEMPERATURE",
    "address": "100",
    "params": {
        "register_type": "HOLDING",
        "type_id": "M_ME_NC_1",
        "base_value": 0
    }
}
```

**IEC 104 Mapping:**
```json
{
    "tag_id": "TEMPERATURE",
    "ioa": 100,
    "type_id": "M_ME_NC_1"
}
```

**Test:**
```bash
# Write value
curl -X POST http://localhost:8000/api/v1/tags/TEMPERATURE/write \
  -H "Content-Type: application/json" \
  -d '{"value": 1054.0}'

# Verify via API
curl -s http://localhost:8000/api/v1/tags/values | grep -A 5 "TEMPERATURE"

# Connect IEC 104 client - should see value 1054.0 at IOA 100
```

### Scenario 2: Bit Extraction

**Tag Configuration:**
```json
{
    "tag_id": "STATUS_BIT",
    "address": "200",
    "params": {
        "register_type": "HOLDING",
        "type_id": "M_SP_NA_1",
        "base_value": 0,
        "start_bit": 3,
        "length": 1
    }
}
```

**Test:**
```bash
# Write value with bit 3 = 1 (e.g., 0b1000 = 8)
curl -X POST http://localhost:8000/api/v1/tags/STATUS_BIT/write \
  -H "Content-Type: application/json" \
  -d '{"value": 8}'

# IEC 104 client should see value 1 (bit 3 extracted)
```

### Scenario 3: Span Scaling

**Tag Configuration:**
```json
{
    "tag_id": "PRESSURE",
    "address": "300",
    "params": {
        "register_type": "HOLDING",
        "type_id": "M_ME_NC_1",
        "base_value": 0,
        "span_low": 0.0,
        "span_high": 100.0
    }
}
```

**Test:**
```bash
# Write middle value (32768 = 50% of 65535)
curl -X POST http://localhost:8000/api/v1/tags/PRESSURE/write \
  -H "Content-Type: application/json" \
  -d '{"value": 32768}'

# IEC 104 client should see value ~50.0 (scaled to 0-100 range)
```

## Verification Checklist

- [x] Backend API is running and accessible
- [x] Tags are being polled (values have recent timestamps)
- [x] Tag values can be written via API
- [x] IEC 104 server is running on port 2404
- [ ] IEC 104 client can connect and read values
- [ ] Bit extraction works correctly
- [ ] Span scaling works correctly
- [ ] Combined transformations work correctly

## Current Test Results

### ✅ API Polling Test
```bash
curl -s http://localhost:8000/api/v1/tags/values | python3 -m json.tool | head -100
```

**Result**: Successfully retrieved tag values with timestamps, confirming:
- Polling engine is working
- Tag values are being updated
- System tags (CPU, RAM, etc.) are functional
- User tags (ROHAN20, TEST_MAPPING_TAG, TEMPERATURE) are functional

### Next Steps

1. **Configure IEC 104 mappings** via the UI or API
2. **Run IEC 104 client** to verify data serving
3. **Test transformations** (bit extraction, span scaling)
4. **Monitor logs** for any errors during transformation

## Troubleshooting

### If IEC 104 client can't connect:
```bash
# Check if port 2404 is listening
sudo netstat -tlnp | grep 2404

# Check IEC 104 server logs
tail -f backend/logs/iec104_server.log
```

### If values aren't transforming correctly:
```bash
# Check backend logs for transformation errors
curl -s http://localhost:8000/api/v1/logs | grep "Error extracting bits"
curl -s http://localhost:8000/api/v1/logs | grep "Error scaling value"
```

### If tags aren't updating:
```bash
# Check polling engine status
curl -s http://localhost:8000/api/v1/tags/values | python3 -m json.tool | grep timestamp

# Verify device is enabled
curl -s http://localhost:8000/api/v1/devices | python3 -m json.tool
```
