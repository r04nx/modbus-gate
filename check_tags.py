import asyncio
import sys
import os

# Add backend to path
sys.path.append('/opt/modbus-gate/backend')

from app.core.store import GlobalDataStore

async def check_tags():
    store = GlobalDataStore()
    tags = await store.get_all_tags()
    print("Tags in GlobalDataStore:")
    for tag_id, tag_val in tags.items():
        print(f"{tag_id}: {tag_val.value}")

if __name__ == "__main__":
    asyncio.run(check_tags())
