"""
NetSurf Authentication API Routes
Implements:
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET /auth/me
"""

import re
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, field_validator
from typing import Dict, Any, Optional

EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

from .database import (
    get_user_by_email,
    create_user,
    revoke_all_user_tokens,
    get_refresh_token,
    revoke_refresh_token
)
from .auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_and_rotate_refresh_token,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

class RegisterRequest(BaseModel):
    email: str = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    name: Optional[str] = Field(None, max_length=100)
    full_name: Optional[str] = Field(None, max_length=100)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(EMAIL_REGEX, clean):
            raise ValueError("Invalid email address format")
        return clean

class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(EMAIL_REGEX, clean):
            raise ValueError("Invalid email address format")
        return clean

class RefreshRequest(BaseModel):
    refresh_token: str

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: str

class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    """Registers a new user account with secure password hashing and returns authentication tokens."""
    email_clean = req.email.lower().strip()
    
    # Check for duplicate email
    existing = get_user_by_email(email_clean)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash password with bcrypt
    pw_hash = hash_password(req.password)
    user_name = (req.name or req.full_name or email_clean.split("@")[0]).strip()
    if not user_name:
        user_name = "NetSurf User"
    user = create_user(email_clean, user_name, pw_hash)

    # Issue initial access and refresh tokens
    access_token = create_access_token(user["id"], user["email"], user["name"])
    refresh_token, _, _ = create_refresh_token(user["id"])

    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"]
        )
    )

@router.post("/login", response_model=AuthTokenResponse)
def login(req: LoginRequest):
    """Authenticates credentials, returns signed JWT access token and single-use refresh token."""
    email_clean = req.email.lower().strip()
    user = get_user_by_email(email_clean)
    
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    access_token = create_access_token(user["id"], user["email"], user["name"])
    refresh_token, _, _ = create_refresh_token(user["id"])

    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"]
        )
    )

@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh_token(req: RefreshRequest):
    """
    Validates the refresh token and returns a new access token + rotated refresh token.
    Enforces single-use rotation and revokes all user sessions if reuse is detected.
    """
    if not req.refresh_token or not req.refresh_token.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing refresh token")
    
    new_access_token, new_refresh_token, _ = verify_and_rotate_refresh_token(req.refresh_token.strip())

    return RefreshTokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer"
    )

@router.post("/logout")
def logout(req: LogoutRequest = LogoutRequest(), current_user: Dict[str, Any] = Depends(get_current_user)):
    """Revokes the current refresh token or all user sessions upon logout."""
    if req.refresh_token:
        try:
            from .auth import decode_token
            payload = decode_token(req.refresh_token)
            token_id = payload.get("jti")
            if token_id:
                revoke_refresh_token(token_id)
        except Exception:
            # Revoke all tokens for this user if token decoding failed
            revoke_all_user_tokens(current_user["id"])
    else:
        revoke_all_user_tokens(current_user["id"])

    return {"status": "logged_out", "message": "Successfully logged out"}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns profile and identity information for the currently authenticated user."""
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        created_at=current_user["created_at"]
    )
