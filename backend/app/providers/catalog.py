from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    name: str
    api_base_url: str
    credential_type: str = "api_key"


# Provider metadata is public configuration, never credential material.
PROVIDERS = {
    "gemini": ProviderDefinition(
        id="gemini",
        name="Google Gemini",
        api_base_url="https://generativelanguage.googleapis.com",
    ),
    "openai": ProviderDefinition(
        id="openai",
        name="OpenAI",
        api_base_url="https://api.openai.com",
    ),
    "anthropic": ProviderDefinition(
        id="anthropic",
        name="Anthropic",
        api_base_url="https://api.anthropic.com",
    ),
}


def public_provider(provider_id: str, credential_configured: bool) -> dict:
    definition = PROVIDERS[provider_id]
    return {**asdict(definition), "credential_configured": credential_configured}
