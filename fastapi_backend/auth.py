"""
NetSurf Authentication & Security Module
Handles bcrypt password hashing, JWT access token generation,
and secure refresh token verification & rotation.
"""

import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Tuple
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import settings
from .database import (
    get_user_by_id,
    store_refresh_token,
    get_refresh_token,
    revoke_refresh_token,
    revoke_all_user_tokens
)

# HTTP Bearer scheme
security_bearer = HTTPBearer(auto_error=False)  # get_current_user raises a proper 401
optional_security_bearer = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt with a secure random salt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def hash_token(token: str) -> str:
    """Generates a SHA-256 hash of a token for secure database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_access_token(user_id: str, email: str, name: str, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a short-lived signed JWT access token."""
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4())
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(user_id: str, expires_delta: Optional[timedelta] = None) -> Tuple[str, str, str]:
    """
    Creates a cryptographically signed refresh token and persists its hash in the database.
    Returns (token_str, token_id, expires_at_iso).
    """
    token_id = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    payload = {
        "sub": user_id,
        "jti": token_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    expires_at_iso = expire.isoformat()
    store_refresh_token(token_id, user_id, hash_token(token), expires_at_iso)
    return token, token_id, expires_at_iso

def decode_token(token: str) -> Dict[str, Any]:
    """Decodes and validates a JWT token signature and expiration."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"Token expired\""}
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature or payload",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""}
        )

def verify_and_rotate_refresh_token(refresh_token: str) -> Tuple[str, str, Dict[str, Any]]:
    """
    Verifies a refresh token against signature, expiry, and database revocation.
    Implements single-use rotation with reuse detection.
    Returns (new_access_token, new_refresh_token, user_dict).
    """
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Provided token is not a refresh token"
        )

    user_id = payload.get("sub")
    token_id = payload.get("jti")
    if not user_id or not token_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")

    db_token = get_refresh_token(token_id)
    if not db_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token not found")

    # Reuse detection: if a revoked token is used, invalidate all sessions for the user!
    if db_token["revoked"]:
        revoke_all_user_tokens(user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Revoked refresh token reuse detected. All sessions terminated for security."
        )

    # Verify hash match
    if db_token["token_hash"] != hash_token(refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token hash mismatch")

    # Verify user exists
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account not found")

    # Single-use rotation: issue new refresh token, mark old as revoked with pointer to new
    new_token, new_token_id, _ = create_refresh_token(user_id)
    revoke_refresh_token(token_id, replaced_by=new_token_id)

    # Issue new access token
    new_access_token = create_access_token(user_id, user["email"], user["name"])
    return new_access_token, new_token, user

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)) -> Dict[str, Any]:
    """FastAPI dependency to extract and validate the authenticated user from the Bearer token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"}
        )
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not an access token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    user = get_user_by_id(payload.get("sub"))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "created_at": user["created_at"]
    }

def get_optional_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security_bearer)) -> Optional[Dict[str, Any]]:
    """Optional dependency for endpoints that support both authenticated and unauthenticated modes."""
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            return None
        user = get_user_by_id(payload.get("sub"))
        if not user:
            return None
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "created_at": user["created_at"]
        }
    except HTTPException:
        return None
