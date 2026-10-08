import os

from pydantic import BaseModel, SecretStr


class Settings(BaseModel):
    service_name: str = "sentinelintel-agent-runtime"
    version: str = "0.1.0"
    research_enabled: bool = os.getenv("AGENT_RESEARCH_ENABLED", "false").lower() in {"1", "true"}
    research_network_enabled: bool = os.getenv("AGENT_RESEARCH_NETWORK_ENABLED", "false").lower() in {"1", "true"}
    internal_token: SecretStr | None = SecretStr(os.environ["AGENT_INTERNAL_TOKEN"]) if os.getenv("AGENT_INTERNAL_TOKEN") else None


settings = Settings()
