from pydantic import BaseModel


class Settings(BaseModel):
    service_name: str = "sentinelintel-agent-runtime"
    version: str = "0.1.0"


settings = Settings()
