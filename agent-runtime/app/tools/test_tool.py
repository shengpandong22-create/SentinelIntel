from pydantic import BaseModel

from .base import ToolContext


class EchoInput(BaseModel):
    text: str


class EchoOutput(BaseModel):
    text: str


class EchoTool:
    name = "echo"
    side_effects = False

    async def invoke(self, value: EchoInput, context: ToolContext) -> EchoOutput:
        del context
        return EchoOutput(text=value.text)
