import requests
import time
import json

API_BASE = "http://localhost:8000/api/v1"
AUTH = ("admin", "admin")

def test_buffering():
    print("1. Checking initial status...")
    res = requests.get(f"{API_BASE}/buffering/status", auth=AUTH)
    print(f"Status: {res.json()}")
    
    print("\n2. Starting manual buffering...")
    res = requests.post(f"{API_BASE}/buffering/manual/start", auth=AUTH)
    print(f"Response: {res.json()}")
    
    print("\n3. Waiting 5 seconds...")
    time.sleep(5)
    
    print("\n4. Stopping manual buffering...")
    res = requests.post(f"{API_BASE}/buffering/manual/stop", auth=AUTH)
    print(f"Response: {res.json()}")
    
    print("\n5. Querying buffered data...")
    res = requests.get(f"{API_BASE}/buffering/data?limit=100", auth=AUTH)
    data = res.json()
    print(f"Retrieved {len(data)} records")
    if len(data) > 0:
        print(f"Sample: {data[0]}")
    else:
        print("No data found!")

if __name__ == "__main__":
    test_buffering()
