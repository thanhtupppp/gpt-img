from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIECS_", extra="ignore")

    app_env: str = "development"
    service_name: str = "piecs-gateway"
    api_version: str = "v1"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_token: str = ""
    secret_encryption_key: str = ""
    database_path: str = "data/piecs-gateway.sqlite3"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def validate_security_settings(self) -> None:
        if self.app_env.lower() == "production" and "*" in self.allowed_origins:
            raise ValueError("Wildcard CORS origins are forbidden in production.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_security_settings()
    return settings
