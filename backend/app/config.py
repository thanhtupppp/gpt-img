from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIECS_", extra="ignore")

    app_env: str = "development"
    service_name: str = "piecs-gateway"
    api_version: str = "v1"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_token: str = ""
    bridge_token: str = ""
    secret_encryption_key: str = ""
    database_path: str = "data/piecs-gateway.sqlite3"
    asset_s3_endpoint: str = ""
    asset_s3_bucket: str = ""
    asset_s3_region: str = "auto"
    asset_s3_access_key: str = ""
    asset_s3_secret_key: str = ""
    worker_max_concurrency: int = 4
    oidc_issuer: str = ""
    oidc_audience: str = ""
    oidc_jwks_url: str = ""
    oidc_algorithms: str = "RS256"
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def validate_security_settings(self) -> None:
        if self.app_env.lower() == "production" and "*" in self.allowed_origins:
            raise ValueError("Wildcard CORS origins are forbidden in production.")
        if not 1 <= self.worker_max_concurrency <= 4:
            raise ValueError("PIECS_WORKER_MAX_CONCURRENCY must be between 1 and 4.")
        if self.rate_limit_requests < 1 or self.rate_limit_window_seconds < 1:
            raise ValueError("PIECS_RATE_LIMIT_REQUESTS and PIECS_RATE_LIMIT_WINDOW_SECONDS must be positive.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_security_settings()
    return settings
