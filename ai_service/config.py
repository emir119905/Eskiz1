from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    db_driver: str = "ODBC Driver 17 for SQL Server"
    db_server: str = r"localhost\SQLEXPRESS"
    db_name: str = "Eskiz1DB"
    db_trusted_connection: bool = True
    db_user: Optional[str] = None
    db_password: Optional[str] = None

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]

    @property
    def connection_string(self) -> str:
        if self.db_trusted_connection:
            auth = "Trusted_Connection=yes;"
        else:
            auth = f"UID={self.db_user};PWD={self.db_password};"

        return (
            f"DRIVER={{{self.db_driver}}};"
            f"SERVER={self.db_server};"
            f"DATABASE={self.db_name};"
            f"{auth}"
            "TrustServerCertificate=yes;"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
