import asyncio
import logging
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import models
from app.core.store import GlobalDataStore

class UserTagService:
    """Service to manage USER tags initialization"""
    
    def __init__(self):
        self.store = GlobalDataStore()

    async def start(self):
        """Initialize all USER tags with their initial values"""
        try:
            db: Session = SessionLocal()
            user_tags = db.query(models.Tag).filter(
                models.Tag.type == "USER", 
                models.Tag.enabled == True
            ).all()
            
            count = 0
            for tag in user_tags:
                if tag.initial_value is not None:
                    await self.store.update_tag(tag.tag_id, tag.initial_value)
                    count += 1
            
            logging.info(f"Initialized {count} USER tags with initial values")
            db.close()
        except Exception as e:
            logging.error(f"Error initializing USER tags: {e}")
