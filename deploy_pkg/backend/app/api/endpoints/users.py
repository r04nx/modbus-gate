"""
User Management API Endpoints

Provides endpoints for:
- User CRUD operations (superroot only)
- Session management
- Password reset
- Active session listing
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ...core.database import get_db
from ...core.auth import (
    get_current_user,
    get_current_superroot,
    create_session,
    terminate_session,
    cleanup_expired_sessions
)
from ...models.user import User, Session as UserSession, UserRole


router = APIRouter()


# Pydantic models
class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.ROOT


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None


class UserResponse(BaseModel):
    id: int
    username: str
    role: UserRole
    created_at: Optional[datetime]
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: int
    user_id: int
    username: str
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True


class PasswordReset(BaseModel):
    new_password: str


# User CRUD endpoints
@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current user."""
    return current_user

@router.get("/", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """List all users (superroot only)."""
    users = db.query(User).all()
    return users


@router.post("/", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Create a new user (superroot only)."""
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Create new user
    new_user = User(
        username=user_data.username,
        role=user_data.role
    )
    new_user.set_password(user_data.password)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Get a specific user by ID (superroot only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Update a user (superroot only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields
    if user_data.username is not None:
        # Check if new username is already taken
        existing = db.query(User).filter(
            User.username == user_data.username,
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )
        user.username = user_data.username
    
    if user_data.password is not None:
        user.set_password(user_data.password)
    
    if user_data.role is not None:
        user.role = user_data.role
    
    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Delete a user (superroot only)."""
    # Prevent deleting yourself
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    db.delete(user)
    db.commit()
    
    return {"success": True, "message": f"User {user.username} deleted"}


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    password_data: PasswordReset,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Reset a user's password (superroot only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.set_password(password_data.new_password)
    db.commit()
    
    return {"success": True, "message": "Password reset successfully"}


# Session management endpoints
@router.get("/sessions/active", response_model=List[SessionResponse])
def list_active_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all active sessions."""
    # Cleanup expired sessions first
    cleanup_expired_sessions(db)
    
    # Get all active sessions
    sessions = db.query(UserSession).join(User).all()
    
    # Add username to response
    result = []
    for session in sessions:
        result.append({
            "id": session.id,
            "user_id": session.user_id,
            "username": session.user.username,
            "ip_address": session.ip_address,
            "user_agent": session.user_agent,
            "created_at": session.created_at,
            "expires_at": session.expires_at
        })
    
    return result


@router.delete("/sessions/{session_id}")
def terminate_user_session(
    session_id: int,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Terminate a specific session (superroot only)."""
    success = terminate_session(session_id, db)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return {"success": True, "message": "Session terminated"}


@router.post("/sessions/cleanup")
def cleanup_sessions(
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Remove all expired sessions."""
    count = cleanup_expired_sessions(db)
    return {"success": True, "message": f"Cleaned up {count} expired sessions"}
