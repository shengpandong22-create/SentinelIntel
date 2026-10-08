import asyncio
from typing import TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.schemas.tasks import TestBehavior, TestTaskResult
from app.services import TestModelAdapter
from app.tools import EchoTool, ToolContext
from app.tools.test_tool import EchoInput


class AgentTaskError(Exception):
    def __init__(self, code: str, message: str, retryable: bool, trace_id: UUID):
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.trace_id = trace_id


class TestState(TypedDict, total=False):
    trace_id: UUID
    input: str
    behavior: TestBehavior
    delay_ms: int
    result: TestTaskResult


async def execute(state: TestState) -> dict[str, TestTaskResult]:
    trace_id = state["trace_id"]
    behavior = state["behavior"]
    if behavior == "delay":
        await asyncio.sleep(state["delay_ms"] / 1_000)
    elif behavior == "transient_error":
        raise AgentTaskError("test_transient", "deterministic transient failure", True, trace_id)
    elif behavior == "permanent_error":
        raise AgentTaskError("test_permanent", "deterministic permanent failure", False, trace_id)

    model = TestModelAdapter()
    tool = EchoTool()
    model_text = await model.complete(state["input"], trace_id)
    output = await tool.invoke(EchoInput(text=model_text), ToolContext(trace_id=trace_id))
    return {"result": TestTaskResult(echo=output.text, model=model.name, tools=[tool.name])}


builder = StateGraph(TestState)
builder.add_node("execute", execute)
builder.add_edge(START, "execute")
builder.add_edge("execute", END)
graph = builder.compile()


async def run_test_graph(trace_id: UUID, value: str, behavior: TestBehavior, delay_ms: int) -> TestTaskResult:
    state = await graph.ainvoke({"trace_id": trace_id, "input": value, "behavior": behavior, "delay_ms": delay_ms})
    return state["result"]
