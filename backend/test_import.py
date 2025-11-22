import sys
import os

# Add current directory to path
sys.path.append(os.getcwd())

try:
    print("Attempting to import TagWriterService...")
    from app.services.tag_writer import TagWriterService
    print("Import successful!")
    
    print("Attempting to instantiate TagWriterService...")
    service = TagWriterService()
    print("Instantiation successful!")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
