from dataclasses import dataclass
from typing import Protocol, TypeVar
from uuid import UUID

from pydantic import BaseModel

InputT = TypeVar("InputT", bound=BaseModel, contravariant=True)
OutputT = TypeVar("OutputT", bound=BaseModel, covariant=True)


@dataclass(frozen=True)
class ToolContext:
    trace_id: UUID


class Tool(Protocol[InputT, OutputT]):
    name: str
    side_effects: bool

    async def invoke(self, value: InputT, context: ToolContext) -> OutputT: ...
