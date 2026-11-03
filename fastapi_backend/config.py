import os
from pydantic import BaseModel
from typing import Optional, List
from dotenv import load_dotenv

# Load root .env or backend/.env
load_dotenv()
if not os.getenv("GEMINI_API_KEY") and os.path.exists("backend/.env"):
    load_dotenv("backend/.env")

class Settings(BaseModel):
    APP_NAME: str = "Netsurf"
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    MAX_STEPS: int = int(os.getenv("MAX_STEPS", "15"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "2"))
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Database path (defaults to unified netsurf.db)
    DB_PATH: str = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "netsurf.db"))
    
    # JWT & Auth Security Settings
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "netsurf-super-secret-jwt-key-change-in-production-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    
    # Strict CORS origins for extension & local tooling (avoids wildcard with credentials)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    ALLOWED_ORIGIN_REGEX: str = r"^(chrome-extension://.*|http://(localhost|127\.0\.0\.1)(:\d+)?)$"

settings = Settings()
