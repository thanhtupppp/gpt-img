import pytest

from app.config import Settings


def test_allowed_origins_are_parsed_as_exact_origins():
    settings = Settings(cors_origins="https://studio.example.com, http://localhost:5173")

    assert settings.allowed_origins == [
        "https://studio.example.com",
        "http://localhost:5173",
    ]


def test_wildcard_cors_is_rejected_in_production():
    settings = Settings(app_env="production", cors_origins="*")

    with pytest.raises(ValueError, match="Wildcard CORS"):
        settings.validate_security_settings()


def test_exact_cors_origins_are_allowed_in_production():
    settings = Settings(
        app_env="production",
        cors_origins="https://studio.example.com",
    )

    settings.validate_security_settings()
