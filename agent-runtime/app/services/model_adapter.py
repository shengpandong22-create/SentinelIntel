from typing import Protocol
from uuid import UUID


class ModelAdapter(Protocol):
    name: str

    async def complete(self, prompt: str, trace_id: UUID) -> str: ...


class TestModelAdapter:
    name = "test-stub"

    async def complete(self, prompt: str, trace_id: UUID) -> str:
        del trace_id
        return prompt
