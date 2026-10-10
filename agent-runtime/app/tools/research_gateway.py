from time import monotonic

import httpx

from app.config import settings
from app.schemas.research import ResearchTaskRequest, ResearchToolResponse
from app.schemas.tracking import TrackingTaskRequest
from app.schemas.impact import ImpactTaskRequest


class ResearchGatewayError(Exception):
    pass


class ResearchGatewayClient:
    async def invoke(self, task: ResearchTaskRequest | TrackingTaskRequest | ImpactTaskRequest, tool: str, input_data: dict[str, object]) -> ResearchToolResponse:
        token = settings.internal_token.get_secret_value() if settings.internal_token is not None else ""
        if not token:
            raise ResearchGatewayError("agent internal token is not configured")
        started = monotonic()
        try:
            async with httpx.AsyncClient(timeout=min(task.limits.deadline_ms / 1_000, 30.0)) as client:
                response = await client.post(
                    f"{settings.gateway_url}/api/internal/agent/tools/{tool}",
                    headers={
                        "authorization": f"Bearer {token}",
                        "x-run-capability": task.tool_capability.get_secret_value(),
                        "x-trace-id": str(task.trace_id),
                    },
                    json={
                        "trace_id": str(task.trace_id),
                        "run_id": str(task.run_id),
                        "input": input_data,
                    },
                )
        except httpx.HTTPError as error:
            raise ResearchGatewayError(f"tool gateway request failed: {type(error).__name__}") from error
        if response.status_code != 200:
            raise ResearchGatewayError(f"tool gateway rejected request with HTTP {response.status_code}")
        try:
            result = ResearchToolResponse.model_validate(response.json())
        except (ValueError, TypeError) as error:
            raise ResearchGatewayError("tool gateway returned an invalid response") from error
        if result.trace_id != task.trace_id or result.run_id != task.run_id or result.tool != tool:
            raise ResearchGatewayError("tool gateway response identity mismatch")
        # Gateway latency is authoritative; this only makes local transport overhead observable in a debugger.
        _transport_latency_ms = round((monotonic() - started) * 1_000)
        return result


research_gateway = ResearchGatewayClient()
