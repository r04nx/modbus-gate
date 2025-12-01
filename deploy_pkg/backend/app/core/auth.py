"""
Authentication and authorization utilities for the VistaIOT Gateway.

This module provides:
- HTTP Basic Auth implementation
- Role-based access control decorators
- Session management utilities
"""

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session
from typing import Optional
import secrets

from ..core.database import get_db
from ..models.user import User, Session as UserSession, UserRole


# HTTP Basic Auth security scheme
security = HTTPBasic()


def get_current_user(
    credentials: HTTPBasicCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Authenticate user using HTTP Basic Auth.
    
    Args:
        credentials: HTTP Basic Auth credentials
        db: Database session
        
    Returns:
        Authenticated User object
        
    Raises:
        HTTPException: If authentication fails
    """
    # Query user by username
    print(f"DEBUG: Authenticating user: {credentials.username}")
    user = db.query(User).filter(User.username == credentials.username).first()
    
    # Verify user exists and password is correct
    if not user:
        print(f"DEBUG: User {credentials.username} not found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
        
    if not user.verify_password(credentials.password):
        print(f"DEBUG: Password verification failed for {credentials.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
        
    print(f"DEBUG: User {credentials.username} authenticated successfully. Role: {user.role}")

    
    # Update last login timestamp
    user.update_last_login()
    db.commit()
    
    return user


def get_current_superroot(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Verify that the current user has superroot privileges.
    
    Args:
        current_user: Authenticated user
        
    Returns:
        User object if superroot
        
    Raises:
        HTTPException: If user is not superroot
    """
    if current_user.role != UserRole.SUPERROOT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superroot privileges required"
        )
    return current_user


def create_session(
    user: User,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    db: Session = None,
    hours: int = 24
) -> UserSession:
    """
    Create a new session for a user.
    
    Args:
        user: User object
        ip_address: Client IP address
        user_agent: Client user agent string
        db: Database session
        hours: Session expiry in hours (default: 24)
        
    Returns:
        Created Session object
    """
    session = UserSession(
        user_id=user.id,
        token=UserSession.generate_token(),
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=UserSession.calculate_expiry(hours)
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session


def get_session_by_token(token: str, db: Session) -> Optional[UserSession]:
    """
    Retrieve a session by its token.
    
    Args:
        token: Session token
        db: Database session
        
    Returns:
        Session object if found and not expired, None otherwise
    """
    session = db.query(UserSession).filter(UserSession.token == token).first()
    
    if not session or session.is_expired():
        return None
    
    return session


def terminate_session(session_id: int, db: Session) -> bool:
    """
    Terminate a session by ID.
    
    Args:
        session_id: Session ID to terminate
        db: Database session
        
    Returns:
        True if session was terminated, False if not found
    """
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    
    if not session:
        return False
    
    db.delete(session)
    db.commit()
    
    return True


def cleanup_expired_sessions(db: Session) -> int:
    """
    Remove all expired sessions from the database.
    
    Args:
        db: Database session
        
    Returns:
        Number of sessions deleted
    """
    from datetime import datetime
    
    expired_sessions = db.query(UserSession).filter(
        UserSession.expires_at < datetime.utcnow()
    ).all()
    
    count = len(expired_sessions)
    
    for session in expired_sessions:
        db.delete(session)
    
    db.commit()
    
    return count
