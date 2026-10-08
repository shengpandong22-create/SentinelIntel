import json
import logging
from uuid import UUID

logger = logging.getLogger("sentinelintel.agent")


def trace_event(event: str, trace_id: UUID, **fields: object) -> None:
    logger.info(json.dumps({"event": event, "trace_id": str(trace_id), **fields}, separators=(",", ":"), sort_keys=True))
