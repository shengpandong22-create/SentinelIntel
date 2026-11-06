# Unknown receipt observability hardening

Status: `ACCEPTED_FOR_IMPLEMENTATION`

## Evidence

The bounded two-vote observation stopped when receipt 1156 entered `unknown` after a provider request
timed out at 120 seconds. The existing lifecycle then behaved as designed: `ops.recover` released the
first unknown outcome once after 30 minutes, marked the original attempt failed, requeued the affected
article, and did not bypass the receipt logical key or budget. With model calls disabled, the article
remained in a non-terminal provider wait. This is an unavoidable in-doubt paid request, not evidence
that retry or idempotency logic is broken.

The audit did reproduce one operator-facing defect. `receipts.unknown` always says every unknown paid
request has already been automatically retried once. That statement is false during the first 30-minute
unknown state, including receipt 1156 when the observation stopped. It can cause an operator to mistake
a first in-doubt call for a failed recovery attempt.

## Scope

Only the unknown-receipt operations finding is changed. It must distinguish:

- a first unknown outcome that is waiting for its one permitted automatic release; and
- an unknown outcome after the automatic release and second paid attempt, which requires provider
  console review and an admin decision.

Receipt state transitions, the 30-minute delay, the one-release limit, budgets, logical keys, article
requeue behavior, admin authorization and provider timeouts are unchanged. Selection prompts,
thresholds, the two-vote predicate, sources, Agents and frozen Evaluation data are out of scope.

## Acceptance criteria

1. A first unknown receipt never claims that an automatic retry already happened.
2. A receipt that is unknown after the automatic release is clearly identified as requiring manual
   provider-console verification.
3. A mixed set reports both counts without exposing request content or credentials.
4. Focused tests create both real database shapes and fail against the previous wording.
5. Existing receipt invariants and tests remain green; no paid or network call is made by the tests.
