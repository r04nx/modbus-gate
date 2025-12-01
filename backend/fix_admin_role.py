import sys
import os

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.core.database import SessionLocal
from app.models.user import User, UserRole

def reset_admin_password():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        if user:
            print(f"User 'admin' found.")
            print("Resetting password to 'admin'...")
            user.set_password("admin")
            db.commit()
            print("✅ Password reset successfully.")
        else:
            print("❌ User 'admin' not found.")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_admin_password()
