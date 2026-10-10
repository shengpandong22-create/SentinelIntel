import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.impact import ImpactProposal, ImpactTaskRequest

# Shared cross-runtime fixture: the TypeScript test parses the same file, proving both runtimes accept
# and reject the same shapes.
FIXTURE = json.loads((Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "impact" / "task.json").read_text(encoding="utf-8"))


def proposal_payload() -> dict[str, object]:
    payload = json.loads(json.dumps(FIXTURE["proposal"]))
    payload["tool_trace"] = []  # type: ignore[index]
    return payload


def task_payload() -> dict[str, object]:
    payload = json.loads(json.dumps(FIXTURE["task"]))
    payload["trace_id"] = str(uuid4())
    payload["run_id"] = str(uuid4())
    payload["tool_capability"] = "x" * 32
    return payload


def test_both_runtimes_share_one_impact_fixture_and_accept_it() -> None:
    task = ImpactTaskRequest.model_validate(task_payload())
    assert task.source_parameters.cve_id == "CVE-2026-10001"
    proposal = ImpactProposal.model_validate(proposal_payload())
    assert len(proposal.impact_rows) == 1


def test_poc_status_is_unknown_only_in_phase_6() -> None:
    payload = proposal_payload()
    payload["exploit_status"] = {"poc": "reported", "known_exploited": "unknown"}  # type: ignore[index]
    with pytest.raises(ValidationError, match="poc"):
        ImpactProposal.model_validate(payload)


def test_known_exploited_requires_kev_evidence_and_stays_consistent_with_it() -> None:
    without_evidence = proposal_payload()
    without_evidence["known_exploited_evidence_ids"] = []  # type: ignore[index]
    with pytest.raises(ValidationError, match="lacks KEV evidence"):
        ImpactProposal.model_validate(without_evidence)

    evidence_without_yes = proposal_payload()
    evidence_without_yes["exploit_status"] = {"poc": "unknown", "known_exploited": "unknown"}  # type: ignore[index]
    with pytest.raises(ValidationError, match="without yes"):
        ImpactProposal.model_validate(evidence_without_yes)


def test_duplicate_rows_and_empty_proposals_are_rejected() -> None:
    duplicated = proposal_payload()
    duplicated["impact_rows"] = [  # type: ignore[index]
        duplicated["impact_rows"][0],
        duplicated["impact_rows"][0],
    ]
    with pytest.raises(ValidationError, match="duplicate impact row"):
        ImpactProposal.model_validate(duplicated)

    empty = proposal_payload()
    empty["impact_rows"] = []  # type: ignore[index]
    empty["unknowns"] = []  # type: ignore[index]
    with pytest.raises(ValidationError, match="without impact rows"):
        ImpactProposal.model_validate(empty)


def test_task_rejects_unsupported_evidence_observations_and_bad_cve() -> None:
    payload = task_payload()
    payload["evidence"][0]["observations"] = ["generic_search"]  # type: ignore[index]
    with pytest.raises(ValidationError):
        ImpactTaskRequest.model_validate(payload)
