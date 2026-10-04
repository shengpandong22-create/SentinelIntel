# Phase 2 — Security Event Grouping Benchmark: Baseline Audit & Design

Status: **BASELINE_AUDIT_AND_BENCHMARK_DESIGN** — design for owner review. No benchmark data, no
harness and no production grouping change has been made.

Phase 2 goal (Migration Spec §11): *先判断 AIHOT grouping 在安防场景到底哪里不够* — establish an
event-relation benchmark, measure the current baseline, and name the failing security hard cases.
**Measure first; do not optimize before evidence.** Migration Spec §11 is explicit that only after this
report shows a problem may grouping prompts or recall be changed.

## How to read this document

Every claim is tagged:

- **VERIFIED** — read out of the current source, with a file and line reference.
- **INFERENCE** — a conclusion drawn from verified facts; the reasoning is given.
- **PROPOSED** — a design decision not yet implemented, for owner review.

---

## 1. Git state

**VERIFIED**

```text
branch : phase/2-security-event-grouping
HEAD   : 225e0f6473de8ac2b827c1ce34d4888a2111ac54
status : nothing to commit, working tree clean
main   : 225e0f6473de8ac2b827c1ce34d4888a2111ac54
tag    : sentinelintel-phase1 → 225e0f6473de8ac2b827c1ce34d4888a2111ac54
```

`sentinelintel-phase1` is an **annotated** tag: `git rev-parse sentinelintel-phase1` prints the tag object
`1cd4f06550b458f726c5cd122970c2f879a1ba8d`, and its peeled commit
(`git rev-parse 'sentinelintel-phase1^{}'`) is `225e0f6`. That matches the brief's stated `main` and HEAD.
No discrepancy, so nothing was reset or rebased.

---

## 2. Verified existing grouping architecture

**VERIFIED** — `packages/backend/src/events/group.ts` (865 lines) and
`packages/backend/src/events/relate.ts` (177 lines). Phase 2 did not modify either.

The pipeline is one function, `groupArticle(articleId, opts)` (`group.ts:597`), which calls the private
`decide()` (`group.ts:605`). It runs **serially** (queue concurrency 1, per the file header comment).

### 2.1 Short-circuits, in order

`decide()` returns early in five cases — each one is a reason a benchmark fixture must be built
carefully, because the relation judge is never reached:

| order | condition | verdict | line |
|---|---|---|---|
| 1 | a manual membership, or a `grouping_overrides` "keep standalone" | `manual` | 616–621 |
| 2 | `isHistorical(a)` | `historical` | 625–629 |
| 3 | `opts.signalOnly` or `participation_mode !== 'editorial'` | signal path | 631 |
| 4 | the report already has a live automatic membership | `kept` | 633–638 |
| 5 | no analysis row, or `relevance !== 'pass'` | `standalone` | 640–647 |

**INFERENCE (important for fixture design):** a benchmark report must have an
`analyses` row with `relevance = 'pass'` and a non-historical publication date, and must not already be
grouped, or `groupArticle` will short-circuit and the pair gold will never be exercised. The query text
also comes from that analysis (`an.title_zh`, `an.summary_zh`) and its `output.fact` frame
(`group.ts:642, 648–652`), so the fixture's analysis row determines what the judge actually reads.

### 2.2 The decision, at a glance

```text
same URL as a live member of a fact?          → same-url            (deterministic, no model call)
  else recall candidate facts
       → if candidates exist: batch relation judge
            → SAME_OCCURRENCE pick, high similarity → same-fact            (no review call)
            → SAME_OCCURRENCE pick, low similarity  → second-model review → same-fact
            → SAME_STORY pick that is a story root  → new-fact-in-story
            → a development candidate               → new-fact-in-story
            → every candidate ROUNDUP               → roundup
  else                                        → new-story
then: write fact_articles + story_signals + grouping_decisions under a row lock
then: consolidate stories the report firmly ties together
then: redirect stories it emptied
then: reclaimWaiting (reply/quote) and rematchSignals (recent unattached posts)
```

---

## 3. Current recall pipeline

**VERIFIED** — all constants live in `group.ts` and are **module-private (not exported)**:

| constant | value | line | role |
|---|---|---|---|
| `RECALL_DAYS` | `14` | 35 | the recall window, keyed on `articles.discovered_at` |
| `RECALL_MIN_COSINE` | `0.6` | 36 | minimum similarity for an editorial candidate |
| `RECALL_TOP_FACTS` | `10` | 37 | candidates kept, after sorting by score |
| `CONFIRM_BELOW_COSINE` | `0.85` | 39 | a merge below this similarity needs the review model |
| `SIGNAL_MIN_COSINE` | `0.72` | 41 | minimum similarity for a discussion post |
| `SIGNAL_AUTO_COSINE` | `0.92` | 42 | a post this close attaches with no call at all |
| `SIGNAL_TOP_FACTS` | `4` | 43 | discussion-post candidates kept |
| `RELATED_MIN_REPORTS` | `2` | 523 | reports needed before two separate stories link |
| `REMATCH_HOURS` | `6` | 775 | how far back unattached posts are re-matched |
| `WAIT_HOURS` | `48` | 777 | how long a reply/quote waits for its original |
| lexical floor | `0.25` | 212 | the fallback's minimum (inline, not a named constant) |
| vector cache cap | `30_000` | 147 | in-process vector cache size |

Recall sources, in the order `recallFacts` (`group.ts:200`) assembles them:

1. **Same URL** — not part of recall: `relatedPosts` (`group.ts:396`) finds a live fact holding another
   article with the same `url`, and `decide()` short-circuits to `same-url` with
   `relation: "SAME_OCCURRENCE", confidence: 1` written straight into the decision (`group.ts:663–666,
   714`). Deterministic, no model call.
2. **Reply / quote boost** — `relatedPosts` resolves `x_post.replyTo` and the tweet id inside
   `x_post.quoted.url` to `identity_key = 'x:<id>'`, and those facts are passed as `boost` and scored
   `1` (`group.ts:232`). They are therefore always recalled regardless of similarity.
3. **Embedding recall** — the preferred path (`group.ts:214–229`): cosine between the query text
   (`reportText(title, summary)`, i.e. title + first 300 chars of the summary — `relate.ts:161`) and the
   best report of each pooled fact, keeping facts at `s >= RECALL_MIN_COSINE`.
4. **Lexical fallback** — used when embeddings are unavailable (`group.ts:208–213`):
   `lexicalSimilarity` = shared-character-bigram overlap over `min(|grams|)` (`relate.ts:166`), keeping
   `s >= 0.25`.
5. **Pool** — `recallPool()` (`group.ts:102`): `fact_articles` of `role IN ('primary','report')` whose
   fact's story is not merged, whose article was discovered within `RECALL_DAYS`, and which is
   `trusted` (a manual membership always is; a report waiting in `regroup_pending` is not —
   `group.ts:86`).
6. **Ranking and truncation** — the best report of each fact represents it; facts sorted by score
   descending, `slice(0, RECALL_TOP_FACTS)` (`group.ts:233`).

**VERIFIED — the recall path is decided by `embeddingsAvailable()`**
(`packages/backend/src/providers/embeddings.ts:30`), which requires *all* of: `config.modelCallsEnabled`,
an `EMBEDDING_API_KEY` **or** `DASHSCOPE_API_KEY`, and `EMBEDDINGS_ENABLED !== 'false'`.

**VERIFIED — in the current local environment embeddings are OFF**: `.env` has
`MODEL_CALLS_ENABLED = true` but no `EMBEDDING_*` key and no `DASHSCOPE_API_KEY`, so recall takes the
**lexical fallback** here, while production (with a DashScope key) takes the embedding path.

**INFERENCE:** any recall measurement taken in the current local environment measures a *different
recall implementation* than production runs. This is the single most important constraint on the
benchmark design and is why recall must be evaluated as its own stage with the path stated explicitly.

---

## 4. Current relation pipeline

**VERIFIED**

### 4.1 The four relations, and the business semantics in code

`RELATIONS = ["SAME_OCCURRENCE", "SAME_STORY", "UNRELATED", "ROUNDUP"]` (`relate.ts:17`). The prompt
defines them (`industry/prompts/group-definitions.md`), and `group.ts` consumes them as:

| relation | code semantics |
|---|---|
| `SAME_OCCURRENCE` | the same real-world happening → the report joins that **fact** (`sameOccurrence`, `relate.ts:119`) |
| `SAME_STORY` | a direct development → a **new fact** under that story, and only when the candidate is the story's **root** (`storyForDevelopment`, `relate.ts:126`) |
| `UNRELATED` | no attachment; also the default for a candidate the model skipped (`verdictsByFact`, `relate.ts:114`) |
| `ROUNDUP` | one side is a multi-topic digest; only when **every** candidate is ROUNDUP (`looksLikeRoundup`, `relate.ts:130`) |

The prompt already encodes the eight required security boundaries — disclosure → vendor confirmation,
disclosure → patch, disclosure → PoC/exploitation/KEV, one CVE across vendors, advisory revision,
tender → award, policy draft → final → implementation date, incident → official follow-up — as
`SAME_STORY`, and draws the *repeat-coverage vs revision* line: **repeated coverage of the same advisory
is `SAME_OCCURRENCE`; a new version of that advisory is `SAME_STORY`**
(`group-definitions.md:1, 8`). `UNRELATED` explicitly covers the same vendor / product / model with a
**different** CVE (`group-definitions.md:14–16`).

### 4.2 The three judge entry points

| judge | prompt | model | schema | maxTokens | line |
|---|---|---|---|---|---|
| `judgeBatch` | `BATCH_SYSTEM` (`group-batch.md`) | `modelFor("group")` | `BatchSchema` | `200 + 90 × candidates` | 279–285 |
| `confirmMerge` | `PAIR_SYSTEM` (`group-pair.md`) | `modelFor("groupReview")` | `PairSchema` | `400` | 288–294 |
| `judgeSignal` | `SIGNAL_SYSTEM` (`group-signal.md`) | `modelFor("group")` | `SignalSchema` | `150 + 60 × candidates` | 296–302 |
| `judgeStories` | `PAIR_SYSTEM` | `group` then `groupReview` | `PairSchema` | `400` | 453–459 |

All run at `temperature: 0` and carry `promptVersion: RELATE_PROMPT_VERSION` (`relate.ts:15`), which
hashes the three group prompts. `group-batch.md` **includes** `group-definitions.md` and
`group-method.md` as partials, so the batch prompt is header + 21 definition lines + the method rule +
the output contract.

Schema robustness (**VERIFIED**): `RelationSchema = z.enum(RELATIONS).catch("UNRELATED")`
(`relate.ts:53`) — a malformed relation silently becomes `UNRELATED`; `confidence` falls back to `0.5`;
`decisions` falls back to `[]`, which then makes **every** candidate `UNRELATED` via `verdictsByFact`
(`relate.ts:114`). A benchmark must count these fallbacks, or a harness failure will be scored as model
disagreement.

### 4.3 Same-occurrence path

**VERIFIED** (`group.ts:667–701`)

```text
sameOccurrence(cands, verdicts)      sort: confidence desc, then recall score desc
  for each pick:
    score >= CONFIRM_BELOW_COSINE (0.85) → attach to that fact       (no second call)
    else → confirmMerge (PAIR_SYSTEM, groupReview model)
        review SAME_OCCURRENCE         → attach to that fact
        review SAME_STORY & is root    → new fact in that story
```

### 4.4 Same-story path, and how development chaining is prevented

**VERIFIED** — two independent guards:

1. `storyForDevelopment` (`relate.ts:126`) keeps only candidates with `storyRoot === true` and relation
   `SAME_STORY`, then takes the highest recall score. A development therefore attaches to the **fact that
   started the story**, never to another development.
2. `storyRoot` is computed in SQL by `rootFactOf` (`group.ts:93`) as the fact whose earliest **trusted**
   report came first — ordered by `coalesce(publications.published_at, discovered_at)`, so fact-id order
   is irrelevant, and a story whose facts all lost their reports has no root.

The `CandidateView.storyRoot` flag is documented as "developments attach only here (no chaining through
developments)" (`relate.ts:35`).

### 4.5 Story consolidation

**VERIFIED** (`group.ts:740–751`, `consolidate` at `group.ts:490`)

- After writing the report's own decision, `tied` = its story plus the story of every candidate where
  `firmlyTied(relation, confidence)` (`relate.ts:149`) — i.e. `SAME_OCCURRENCE` or `SAME_STORY` with
  confidence `>= TIE_MIN_CONFIDENCE = 0.8` (`relate.ts:146`).
- With more than one story, `consolidate` resolves each to its live story (following `merged_into` up to
  20 hops), drops stories **started by a roundup** (`group.ts:497, 526`), sorts roots by start time, and
  compares every other root against the earliest one.
- A merge needs **both** models: `judgeStories("group")` must be `firmlyTied` at `0.8`, then
  `judgeStories("groupReview")` reads the pair the other way round and must be `firmlyTied` at
  `STORY_REVIEW_MIN_CONFIDENCE = 0.75` (`relate.ts:158`). The `consolidate` CLI's `--dry-run` prevents
  the merge but **not** the paid calls (`group.ts:514`).

### 4.6 Related-story linking

**VERIFIED** (`linkRelatedStories`, `group.ts:537`) — stories that stay apart although reports keep
tying them get a `story_links` row when at least `RELATED_MIN_REPORTS = 2` distinct reports, inside the
recall window, each firmly tied (`>= 0.8`) to a fact of the other story, none of them a roundup, and
neither story started by one. Links are only added; a merged story drops out where they are read.

### 4.7 Manual override protection

**VERIFIED** — six layers, any one of which is enough to lose a model's answer:

1. `manualDecision` (`group.ts:342`) reads `fact_articles.manual` (a chosen fact) or `grouping_overrides`
   (keep standalone); either wins and returns `verdict: "manual"` (`group.ts:616–621`).
2. It is read **again inside the write transaction's row lock** (`group.ts:718–724`), and
   `detachFromFact` takes the same `FOR UPDATE` lock (`admin/content.ts:186`) — so a human detach during
   the model's answer wins.
3. `resetAutomatic` deletes only `WHERE NOT manual` (`group.ts:368`), so an explicit regroup keeps
   manual memberships.
4. `trusted()` counts a manual membership as evidence **always**, regardless of `regroup_pending`
   (`group.ts:86`).
5. `unattachedSignal` excludes any article with a `grouping_overrides` row from re-matching
   (`group.ts:785`).
6. The only path that removes a manual "keep standalone" is an explicit
   `rerun(step="group")` (`admin/content.ts:165`).

**VERIFIED — there is no positive "attach this report to that fact, manually" function.** The admin
surface offers `detachFromFact` and `mergeStories` (`admin/content.ts:183, 209`) only; `INSERT INTO
fact_articles` appears in production grouping and tests, never with `manual = true`.

### 4.8 Signal path

**VERIFIED** — `groupSignal` (`group.ts:832`), reached when `signalOnly` or
`participation_mode !== 'editorial'`; it **attaches to a story and never creates one**.

```text
replies to / quotes a collected post  → signal-native     (no call, confidence 1)
else recall with SIGNAL_MIN_COSINE 0.72 / SIGNAL_TOP_FACTS 4
     top >= SIGNAL_AUTO_COSINE 0.92   → signal            (no call)
     else judgeSignal → signalTarget  (SAME_OCCURRENCE first, else SAME_STORY with conf >= 0.8)
     no target                        → signal-unmatched  (recorded, so "found nothing" ≠ "never decided")
```

Plus `reclaimWaiting` (a reply/quote whose original just arrived, `WAIT_HOURS = 48`) and
`rematchSignals` (recent unattached posts within `REMATCH_HOURS = 6`, needs embeddings, re-enqueues a
`signalOnly` job; it does **not** judge inline).

**Recommendation (§4H of the brief): keep signal relations OUT of the Phase 2 primary benchmark.**
**INFERENCE**, from three verified facts: the signal path uses a **different prompt** with different
`SAME_STORY` semantics (a reaction, review or listing counts — `group-signal.md:2`), **different
constants** (0.72 / 0.92 / 4), a different verdict vocabulary (`signal-native`), and it never creates a
story. Averaging it into one macro F1 would average two different tasks. The Migration Spec's Phase 2
dataset and all eight of its hard cases are report-vs-report editorial cases. Signals can be a separate,
later track if the owner wants them measured.

---

## 5. Existing evaluation evidence — the "370 labelled pairs" claim

**VERDICT: `NOT_REPRODUCIBLE`.**

**VERIFIED** — `relate.ts` cites two measurements:

- `relate.ts:10` — a three-way question was needed because "a yes/no question with 'prefer no' refused
  half of the true merges (measured 2026-09-28 on 370 labelled pairs)".
- `relate.ts:154–157` — at `0.75`, story-level precision `0.944` / recall `0.962` on "the 370 reference
  pairs (2026-09-29)", against `0.964` / `0.896` at `0.8`, "and on 170 real root pairs the extra merges
  read as right".

Evidence that the labels are gone:

| check | result |
|---|---|
| dataset file in the repo | **NOT FOUND** — `git grep -n "370"` matches only those two comments (plus two Phase 0 audit docs and an unrelated SVG path) |
| `.data/` (git-ignored, present on disk) | **NOT FOUND** — recursion shows only `audit-phase1/`, 8 `eval/selection-*.json`, and three `.mjs` helpers. No pair, label or gold file for events. `.data/gold.jsonl` (the `eval-selection.ts` default) does not exist either |
| git history | `git log --all -S "370"`, `-S "labelled pairs"`, `-S "170 real root pairs"` return only `877d6d5` (the upstream AIHOT import), `1deb090` / `5b916b0` (the Phase 0 audit that quotes the comment), and nothing else. `git log --all -- packages/backend/src/events/relate.ts` returns **only** `877d6d5` — the file has never been touched since import |
| docs recording schema or provenance | **NOT FOUND** |
| independently reproducible | **No** — nothing to run |

**INFERENCE:** the 370/170 pairs were labelled in the upstream AIHOT working tree and never committed.
`docs/00-sentinelintel/03-Phase0-Baseline-Audit.md:171` already recorded this at Phase 0. **These numbers
must not be used as the Phase 2 baseline, and must not be rebuilt or reconstructed by guesswork.** They
are evidence that the problem is real (a two-way question was insufficient), nothing more.

---

## 6. Existing eval tooling

**VERIFIED — classification: (c) no event benchmark harness exists anywhere in the repository.**

| surface | finding |
|---|---|
| `scripts/eval-selection.ts` | **unrelated to events.** It runs `runAnalysis(..., { stages: "selection" })` and scores a binary `select` / `reject` / `either` gold with tp/fp/fn/tn |
| `packages/backend/src/admin/selectbench.ts` | selection-model comparison for the human-selection gold set |
| `apps/web/app/routes/admin/` | only `selectbench.tsx` / `selectbench-run.tsx` |
| `database/migrations/` | no event gold/annotation table |
| `docs/evaluation/` | only `selection.md` (this plan is the second file) |
| `datasets/` | only `selection/` |
| `tests/events.test.ts`, `tests/signals.test.ts` | behaviour/invariant tests with **hardcoded relation answers**; no gold set, no precision/recall, no confusion matrix |
| `scripts/regroup-events.ts` | operational regroup tool — see below |

### 6.1 `scripts/regroup-events.ts` is NOT an evaluator

**VERIFIED** — it is a production operational tool, so it must never be used as an offline evaluator:

- writes real membership: enqueues `force: true` group jobs (`:91–92`) that run the real
  `groupArticle` → `fact_articles` / `facts` / `stories` / `story_signals` / `grouping_decisions`;
- merges stories itself (`:129–141`) into the most-voted successor, writing `stories.merged_into` and
  `story_aliases`;
- writes `regroup_pending` (`:89`) and cancels jobs (`:59`);
- calls `warmRecallWindow` (**paid embeddings**, `:87`) and `consolidate` (**paid judge**, `:199`);
- `--dry-run` only suppresses the merge write — `group.ts:514` still calls both models.

It has no gold set, computes no metric, and cannot run offline.

### 6.2 What IS reusable

**VERIFIED / INFERENCE**

| piece | reusable as |
|---|---|
| `relate.ts` exports — `PAIR_SYSTEM`, `pairUser`, `PairSchema`, `BATCH_SYSTEM`, `batchUser`, `BatchSchema`, `verdictsByFact`, `sameOccurrence`, `storyForDevelopment`, `looksLikeRoundup`, `firmlyTied`, `TIE_MIN_CONFIDENCE`, `STORY_REVIEW_MIN_CONFIDENCE`, `lexicalSimilarity`, `reportText`, `RELATE_PROMPT_VERSION` | the harness can build the **exact production prompt, schema and pure decision rules** without touching production code |
| `group.ts` exports — `groupArticle`, `consolidate`, `linkRelatedStories`, `warmRecallWindow`, `GROUP_PROMPT_VERSION` | the end-to-end stage can drive the real pipeline |
| `tests/setup.ts` — `stub()`, `Reply`, `tag()`, `gate()` | a local HTTP stub standing in for every provider; the pattern `tests/events.test.ts` uses |
| `grouping_decisions.candidates` (JSONB: id, score, relation, confidence) | **the recall set is persisted by production code** (`group.ts:711–713, 336–338`) — a zero-cost way to observe what was actually recalled |
| `embeddings` table (`kind`, `ref_id`, `model`, `text_hash`, `vector`) | **VERIFIED in `tests/embeddings.test.ts:11–15`**: vectors can be pre-seeded and `ensureEmbeddings` reads them back with no provider call, so the **vector** recall path can be exercised offline and deterministically |
| `tests/events.test.ts` / `signals.test.ts` | the fixture pattern (source + analysis row + publication + fact) to copy |

**VERIFIED — not reusable:** the recall constants themselves. `RECALL_DAYS`, `RECALL_MIN_COSINE`,
`RECALL_TOP_FACTS`, `CONFIRM_BELOW_COSINE`, `SIGNAL_*` and `REMATCH_HOURS`/`WAIT_HOURS` are
**module-private**; the private `judgeBatch` / `confirmMerge` / `judgeSignal` / `judgeStories` /
`recallFacts` cannot be imported. This shapes the harness (see §9).

---

## 7. Proposed benchmark

**PROPOSED.**

### 7.1 Primary form: pair-level relation gold — with the reasoning

The brief requires a justified choice between a pair-level benchmark and a query + candidate-set
benchmark. **Proposal: pair-level relation classification is the primary gold**, because:

1. **It maps onto an existing production code path.** `PAIR_SYSTEM` + `pairUser` + `PairSchema` are what
   `confirmMerge` (`group.ts:288`) and `judgeStories` (`group.ts:453`) already send. A pair benchmark
   measures a prompt the production system really uses.
2. **A batch answer is not decomposable.** `batchUser` renders the whole candidate list into one prompt
   and `maxTokens` scales with it (`200 + 90 × candidates`, `group.ts:282`); the model answers all
   candidates in one JSON document, `verdictsByFact` maps by position (`C1`, `C2`, …), and a skipped
   candidate silently becomes `UNRELATED` (`relate.ts:107–115`). Adding or removing one candidate can
   change the answers to the others, so a batch-shaped gold is not stable as a fixed dataset.
3. **Cost and stability.** One call per case either way, but a pair is order-independent, which makes the
   holdout repeatable and makes each error attributable to one pair.

**But a pair gold alone cannot answer the Phase 2 question**, because a production miss can come from
recall or from the judge. So the **same pair gold** is read twice, in two stages (§8): stage A asks "did
recall even offer the gold counterpart?", stage B asks "given the candidate, what did the judge say?".
That is **one gold, two measurements** — not two gold sets.

**INFERENCE:** the pair formulation also loses one property of production: `judgeBatch` sees the
*representative report* of a fact together with `members` and the fact title (`batchUser`,
`relate.ts:95–100`), while `pairUser` sees only the two reports. A pair benchmark therefore measures a
slightly easier task than production grouping. That is deliberate — it is the stage-isolated
measurement the brief asks for — but any end-to-end number must come from the end-to-end stage (§8.3),
not from extrapolating the pair score.

### 7.2 Relation labels: exactly the production taxonomy

**PROPOSED** — `SAME_OCCURRENCE` | `SAME_STORY` | `UNRELATED` | `ROUNDUP`. No new gold relation
(`SAME_CVE`, `PATCH`, `FOLLOW_UP`, `SIMILAR` are all forbidden). Security-specific differences are
expressed as `samplingContext.samplingStratum`, never by changing the ontology.

### 7.3 Schema (`datasets/event-relations/dev.jsonl` and `holdout.jsonl`)

**PROPOSED** — one JSON object per line:

```jsonc
{
  "caseId": "EVREL-VULN-CONFIRM-001",
  "eventFamilyId": "fam-cve-2026-76504",          // anti-leakage key: one real-world thread
  "reportA": {                                     // rendered by reportText()/describeReport()
    "title": "…", "summary": "…",                  // read as strings; the harness slices like production
    "sourceName": "…", "firstParty": false,
    "publishedAt": "2026-09-30T12:00:00Z",
    "frame": { "subject": "…", "action": "…", "object": "…", "occurredAt": "2026-09-30" }
  },
  "reportB": { /* same shape */ },
  "gold": { "relation": "SAME_STORY" },
  "samplingContext": { "split": "development", "samplingStratum": "disclosure-vs-vendor-confirmation" },
  "provenance": {
    "labelSource": "…",                            // decided by the owner (see §12)
    "labeller": "…",
    "confidence": "high",
    "sourceUrls": ["https://…", "https://…"],       // both sides, so a reviewer can re-read the material
    "note": "why this label, one line"
  }
}
```

Deliberate choices:

- **Both source URLs are kept.** Phase 1's benchmark lost URL traceability in 50 rows (§L item 10 of
  `docs/evaluation/selection.md`); this schema makes the pair re-verifiable from the repository.
- **`summary` is stored as text, not a verbatim archive.** Copyright: the harness slices to the same
  lengths production uses (`reportText` → 300 chars; `describeReport` → 360 chars), so a short excerpt is
  sufficient and a full article is unnecessary.
- **`frame` is included** because production sends it (`describeReport`, `relate.ts:85–87`), so the
  harness should send it too.
- **No `score` / `cosine` field in the gold.** Similarity is a property of a run, not of the gold; the
  harness records it in the report instead.
- **`eventFamilyId` is mandatory.** It is what makes the split safe (§7.6).

### 7.4 Hard-case strata

**PROPOSED** — the eight the Migration Spec names, plus six additions, each tied to a verified
false-merge / false-split risk in the current code.

Required by Migration Spec §11:

| # | stratum | intended gold | why it is a hard case |
|---|---|---|---|
| 1 | `disclosure-vs-vendor-confirmation` | `SAME_STORY` | the classic false *split*: two different sources, same vulnerability |
| 2 | `disclosure-vs-patch` | `SAME_STORY` | patch notes rarely repeat the disclosure's wording, so cosine is low |
| 3 | `poc-vs-disclosure` | `SAME_STORY` | a PoC post names the CVE but reports a different happening |
| 4 | `same-cve-multi-vendor-product` | `SAME_STORY` | two vendors, one upstream issue — the highest false-*split* risk |
| 5 | `same-vendor-different-cve` | `UNRELATED` | the highest false-*merge* risk: same vendor, same month, similar wording |
| 6 | `same-model-different-vulnerability` | `UNRELATED` | same product name, different CVE |
| 7 | `procurement-notice-vs-award` | `SAME_STORY` | the same project from tender to award |
| 8 | `policy-draft-vs-final` | `SAME_STORY` | the same document through its stages |

Additions, each justified by a specific mechanism in the code:

| # | stratum | intended gold | justification (**VERIFIED** unless noted) |
|---|---|---|---|
| 9 | `same-cve-duplicate-across-sources` | `SAME_OCCURRENCE` | exercises the `same-url` deterministic shortcut and the "repeat coverage" rule (`group.ts:663`, `group-definitions.md:1`); without it, macro F1 is measured on the hard cases only and the easy class is unrepresented |
| 10 | `advisory-republished-by-cert` | `SAME_OCCURRENCE` | a CERT republishing a vendor advisory is a *repeat* of one happening, but the source and the wording change (low cosine) |
| 11 | `advisory-revision-vs-republication` | `SAME_STORY` | the exact boundary the prompt draws between "重复报道" and "同一份公告的修订" (`group-definitions.md:1, 8`); the two are near-identical in text |
| 12 | `roundup-containing-one-event` | `ROUNDUP` | `looksLikeRoundup` requires **every** candidate to be ROUNDUP (`relate.ts:131`), so a digest plus one strong candidate is the false-split trap |
| 13 | `multi-cve-in-one-vendor-advisory` | `SAME_OCCURRENCE` | the definitions put a vendor's multiple affected product lines inside one advisory in one happening; the false-merge risk is attaching an unrelated CVE from the same roundup |
| 14 | `same-product-family-different-cve` | `UNRELATED` | a sibling-model CVE is the highest-cosine UNRELATED case |

**INFERENCE:** 14 strata is the point where every named risk in §7.4 is covered once; the
brief's optional extras (tender correction, same project's different lot, CVE update vs separate
vulnerability) are deliberately **not** added as separate strata to keep the set finite — they can be
represented as `provenance.note` variants inside strata 7 and 11 if the owner wants them, without
changing the ontology or inflating the strata list.

### 7.5 Size and split

**PROPOSED**

| item | value |
|---|---|
| total pairs | **240** |
| development | **180** (75%) |
| holdout | **60** (25%) |
| per-relation floor in the holdout | **≥ 12** per class |
| per-stratum target | 12–20 pairs, at least 3 per stratum in the holdout |
| split unit | **`eventFamilyId`**, never a pair |

Reasoning (**INFERENCE**, from the verified class counts): four relation classes over a 60-pair holdout
gives 15 per class on average, and a 12/60 cell has an accuracy standard error around ±0.13 — so the
holdout can support *class-level* conclusions but not fine per-stratum claims. That is why the holdout
keeps a per-class floor while per-stratum conclusions stay on development. 240 is inside the brief's
150–300 band and keeps the paid evaluation cost at ~240 calls per run for the relation stage, which is
the same order as Phase 1's 200-case benchmark.

### 7.6 Anti-leakage

**PROPOSED**

1. Every pair carries `eventFamilyId`; **all pairs of a family go to the same split**. Assignment is
   deterministic: families sorted by id, then `i % 4 === 3 → holdout` (the same device Phase 1 used),
   adjusted so the per-class floor holds.
2. Two assertions the harness must run before evaluating, and fail loudly on:
   - **no report appears in both splits** (a report may appear in several pairs, so a pair-random split
     would leak it);
   - **no `eventFamilyId` appears in both splits**.
3. Both reports of a pair are always in the same split, which follows from (1) since both belong to the
   family.
4. The same CVE / procurement project / policy lifecycle must never be split across
   development and holdout — that is exactly what `eventFamilyId` encodes.

### 7.7 Annotation protocol

**PROPOSED.** The annotator's rule is the **production** rule, quoted from
`industry/prompts/group-method.md`: *"如果两篇都是真的，世界上是发生了一件事，还是先后发生了两件有直接关系的事？"*
Aligning to production semantics is what makes the gold a measurement of the system rather than of the
annotator's taste.

Per relation:

| relation | definition | positive criteria | negative boundary | security example | confusing counterexample |
|---|---|---|---|---|---|
| `SAME_OCCURRENCE` | one real-world happening, one time, one set of objects | cross-language rewrites; different outlets emphasising different details; official text and its media coverage; **repeat coverage of the same advisory**; one advisory's several affected product lines; incident duplicates | if the world would count two happenings, it is not this | CISA and a vendor portal both carry the same advisory | an advisory and its **v2 revision** — same document, but a later happening → `SAME_STORY` |
| `SAME_STORY` | not the same happening, but a direct earlier/later relation around one CVE, event, project or document | disclosure → vendor confirmation; disclosure → patch/fixed version; disclosure → PoC/exploitation/KEV; one CVE across vendors; advisory revision or status change; tender → award; policy draft → final → implementation date; incident → official follow-up | a different CVE is never this, however similar the text | vendor confirms a flaw a researcher disclosed last week | two different CVEs in the same monthly patch release → `UNRELATED` |
| `UNRELATED` | different happening, even for the same company/product | different CVEs from one vendor or product; different vulnerabilities in one model; a product's non-security release; merely mentioning the same vendor, product, model, standard or CVE; hardening guides, opinions, marketing, unless they target the candidate disclosure specifically | do not use it for a genuine development | same vendor, two CVEs, published the same day | a PoC post about the disclosed CVE → this is `SAME_STORY`, not UNRELATED |
| `ROUNDUP` | one side is a multi-topic digest | monthly patch roundup, daily/weekly digest, morning briefing, security weekly, where the other side is one entry | use only when **one side** is the digest | a weekly roundup listing one of our benchmark advisories | a digest that is *itself* the only report of one event → still `ROUNDUP` on that pair |

The single most important boundary, with the disclosure lifecycle spelled out, because it is where the
production data will be wrong first:

```text
first disclosure of CVE-X (source 1)        ─┐
a second outlet covering that disclosure    ─┴─ SAME_OCCURRENCE (the same happening, twice)
vendor confirms CVE-X                       ─── SAME_STORY (a later happening in the same story)
patch / fixed version released for CVE-X    ─── SAME_STORY
PoC published, exploitation observed, KEV   ─── SAME_STORY
advisory v2 revises scope or status         ─── SAME_STORY
CVE-Y disclosed by the same vendor, same day ── UNRELATED
hardening guide for the affected product     ─── UNRELATED (unless it targets CVE-X specifically)
```

**PROPOSED process:** label in pairs, one pass; then a second pass by a different reviewer on a sample;
record `provenance.labelSource`, `labeller`, `confidence` and a one-line `note` per row; leave genuinely
ambiguous pairs out of decisive metrics the way Phase 1 used `either` — a `gold.relation` value of
`AMBIGUOUS` excluded from the confusion matrix, rather than forcing a label.

---

## 8. Proposed metrics

**PROPOSED.** Three stages, so that a miss can be attributed to recall, to the judge, or to the
deterministic policy. Reporting only one aggregate F1 is explicitly rejected: it cannot distinguish the
three bottlenecks.

### 8.1 Stage A — candidate recall

- **candidate recall@K**, `K = RECALL_TOP_FACTS = 10`: for each gold pair, was report B's fact in the
  recalled candidate set for report A?
- **missed-candidate rate** = 1 − recall@K, broken down **by stratum** (this is where "which security
  hard cases fail" gets answered).
- **recall-path indicator** per case: `same-url` shortcut, reply/quote boost, embedding path, or lexical
  fallback (`embeddingsAvailable()`), because the two similarity implementations are not comparable.
- **INFERENCE:** stage A can be measured with **zero model calls and zero cost** by driving
  `groupArticle()` on a scratch `*_ci` database with a stubbed provider and reading the recall set out of
  `grouping_decisions.candidates` (`group.ts:711–713`). Caveat, stated in §3: in an environment without
  an embedding credential this measures the **lexical** path, and with pre-seeded vectors
  (`tests/embeddings.test.ts` proves this works) it measures the **vector** path under **given** vectors —
  neither is the production embedder's own semantics. It measures the recall *policy* and gives a
  deterministic regression guard; production-representative recall needs the real embedder.

### 8.2 Stage B — relation classification (primary metric)

- **4 × 4 confusion matrix** over `SAME_OCCURRENCE` / `SAME_STORY` / `UNRELATED` / `ROUNDUP`.
- **per-class precision, recall, F1** and **macro F1** (Tech Design §15.2).
- **`SAME_OCCURRENCE` precision / recall** and **`SAME_STORY` precision / recall** called out on their own
  (both the Tech Design and the Migration Spec name them explicitly).
- **schema-fallback counters**, because they masquerade as model errors: how often a relation fell back
  to `UNRELATED`, a confidence to `0.5`, or `decisions` to `[]` (`relate.ts:53–59`).
- **token and latency per case**, and the `RELATE_PROMPT_VERSION` of the run.

### 8.3 Stage C — end-to-end story metrics

- **pairwise merge precision / recall** over gold-connected components:
  - precision = (# pairs both sides call one story AND gold says one story) / (# pairs both sides call one
    story)
  - recall = (# gold-one-story pairs both sides call one story) / (# gold-one-story pairs)
- **false-merge list** = predicted same, gold not — the Migration Spec's *false merge examples*.
- **false split list** = gold same, predicted not — the Migration Spec's *false split examples*.
- **verdict distribution** (`same-fact` / `new-fact-in-story` / `new-story` / `roundup` / `matched`
  variants) and the counts of the deterministic gates that fired (`confirmMerge` invoked because the
  candidate was below `0.85`; `same-url` shortcut; `looksLikeRoundup`).
- **failure taxonomy by stratum** — the Migration Spec's *security-specific failure taxonomy*.

**INFERENCE — why pairwise merge P/R and not B-cubed, as the one main metric:** the Migration Spec's
acceptance list asks for *story merge errors*, *false merge examples* and *false split examples*, and
pairwise P/R decomposes exactly into those two named error classes, with every error attributable to a
named pair — which is what a taxonomy needs. B-cubed is cluster-size weighted and its per-example error
is not attributable to a pair. **PROPOSED:** implement pairwise P/R only; note B-cubed as a possible,
separate later addition rather than building two cluster metrics now.

---

## 9. Proposed eval harness

**PROPOSED** — nothing has been written.

| item | proposal |
|---|---|
| file | `scripts/eval-event-grouping.ts` (same shape and location as `scripts/eval-selection.ts`) |
| input | `datasets/event-relations/dev.jsonl` / `holdout.jsonl` (or `--gold <path>`) |
| CLI | `--gold`, `--split development\|holdout\|all`, `--n`, `--seed`, `--stage relation\|recall\|end-to-end\|all`, `--label`, `--models`, `--no-import`, `--out` |
| default | `--stage relation`; **refuses to spend money unless paid calls are explicitly enabled** |
| model calls | **relation and end-to-end stages need real calls** (`group` / `groupReview`); the recall stage needs none. Paid calls must require both `MODEL_CALLS_ENABLED` and an explicit opt-in flag, so a run cannot be paid by accident |
| DB writes | **none to production membership.** Relation stage: no writes at all. Recall / end-to-end stages: a scratch database whose name ends `_test` or `_ci` (enforced by `tests/setup.ts`'s invariant), seeded per case, discarded |
| report | `.data/eval/event-grouping-<split>-<n>-<ts>.json`: meta (split, n, seed, `RELATE_PROMPT_VERSION`, `GROUP_PROMPT_VERSION`, recall path, model ids), per-case rows (caseId, stratum, family, gold, predicted, confidence, recall score, whether the review model was called, fallbacks), the confusion matrix, per-class and macro metrics, stage-A recall, stage-C merge P/R with the false-merge/false-split lists, token and latency totals |
| SelectBench | **not used.** VERIFIED: `selectbench_results` is `run_id, model, case_id, title, stratum, gold, decision, score, relevance, category, reason, receipt_id, error` and the admin confusion mapping hardcodes `tp/fp/fn/tn` for binary select/reject (`packages/backend/src/admin/selectbench.ts:89–93`), so it cannot hold a 4-class relation matrix without new columns. Phase 2 gets an independent JSON report; a grouping view in the admin UI is a **deferred UI enhancement**, not a Phase 2 blocker |

### 9.1 The one production-code question the harness cannot avoid

**VERIFIED:** `judgeBatch`, `confirmMerge`, `judgeSignal` and `judgeStories` are **private**, and the
recall constants are private too. So the harness can either

- **(a)** make the pair call itself from `PAIR_SYSTEM` + `pairUser` + `PairSchema` +
  `RELATE_PROMPT_VERSION` (all exported) with the same `temperature: 0, maxTokens: 400` — a few lines
  that **duplicate** production's call wrapper and could drift from it, or
- **(b)** have the owner approve a **non-runtime export** of the existing private pair judge
  (`group.ts:288`'s wrapper, or a small `judgePair` that calls it), which changes no runtime behaviour.

**PROPOSED: ask the owner for (b), do not implement it now.**

## 10. Baseline variants and ablation

**PROPOSED**

| variant | what it is | what it isolates |
|---|---|---|
| **B0** | current production grouping, exactly as-is, on the gold | the baseline the phase must report |
| **B1** | oracle-candidate relation classification: hand the judge the gold counterpart as the only candidate | recall loss, by difference from B0 |
| **B2** *(optional)* | embedding-vector recall vs lexical fallback, with pre-seeded vectors | the recall *policy*, free and deterministic; only worth running if B1 shows recall is the bottleneck |

**Reconciliation with Tech Design §16.** That section's `B0 … B5` are cumulative **architecture**
stages (B0 = AIHOT original, B1 = + security prompts/taxonomy, B2 = + structured entities, …). `B1` there
has **already shipped** in Phase 1, so the running configuration *is* "AIHOT grouping + security
prompts". The B0/B1 above are therefore **measurement variants inside that same running configuration**,
not new architecture stages. Nothing in this plan advances Tech Design's B2 or beyond.

**Deliberately not proposed now:** CrossEncoder, hybrid RRF, query router, GraphRAG — the brief forbids
them, and Tech Design §16 requires a holdout-measured, explainable gain before any of them is kept.

---

## 11. What NOT to implement yet

`MEASURE FIRST. DO NOT OPTIMIZE BEFORE EVIDENCE.` Until the benchmark report exists:

- no grouping algorithm change;
- no grouping threshold change (including `RECALL_*`, `CONFIRM_BELOW_COSINE`, `TIE_MIN_CONFIDENCE`,
  `STORY_REVIEW_MIN_CONFIDENCE`);
- no grouping prompt change (`industry/prompts/group-*.md`);
- no recall-logic change;
- no new Agent;
- no reranker, CrossEncoder, GraphRAG, hybrid retrieval or query router;
- no Python agent runtime;
- no Phase 3;
- and, specifically for this round: **no production grouping source modification at all**
  (`packages/backend/src/events/*`), and no benchmark data generated before the schema and the label
  provenance are approved.

Migration Spec §11 states the gate directly: *只有此报告证明有问题，才允许改 grouping prompt/recall。*

---

## 12. Open owner decisions

1. **Label provenance for Phase 2 gold.** Phase 1's accepted limitation was a `MODEL_REVIEWED` benchmark
   with no independent human adjudication. Phase 2 must decide up front whether the relation gold will be
   human-labelled, model-proposed, or model-reviewed — and who reviews the SAME_OCCURRENCE vs SAME_STORY
   boundary, which is the hardest one. This is the single decision most likely to repeat Phase 1's
   deviation.
2. **Cost authorization.** The relation and end-to-end stages call paid models
   (`group` and `groupReview`); the recall stage is free. A 240-case relation run is ~240 calls per pass.
   Also: which embedding path represents production for stage A, and whether a local embedding endpoint
   may be used as a test double (it would not be production-representative).
3. **Harness plumbing (§9.1):** approve a **non-runtime export** of the existing private pair judge, or
   accept a thin harness-local wrapper that duplicates production's call parameters.
4. **Signal relations:** confirm that discussion-post relations stay out of the Phase 2 primary
   benchmark (§4.8), or ask for them as a separate track.
5. **Size and split:** confirm 240 pairs / 180 dev / 60 holdout with a per-class holdout floor, and the
   `eventFamilyId`-grouped split. And, if 240 is too large for the available annotation effort, whether
   to shrink the number of **strata** rather than the per-stratum counts (fewer cells, each still
   meaningful) — the intended trade is *fewer strata, not thinner cells*.

---

## 13. Verification for this round

**VERIFIED** — this round changed documentation only.

```text
git diff --check   → clean, exit 0
npm run typecheck  → pass, exit 0
```

No TypeScript was modified, so no test was required by the brief's rule. The two grouping suites were
run anyway, as the baseline evidence this phase exists to establish — they are the only current evidence
that the grouping pipeline behaves as documented:

```text
node --test tests/events.test.ts   (fresh DB p2_grouping_ci, 35 migrations)
  → tests 10 / pass 10 / fail 0 / cancelled 0, exit 0, 4.5 s
node --test tests/signals.test.ts  (same DB)
  → tests 3 / pass 3 / fail 0 / cancelled 0, exit 0, 1.9 s
```

Both run against a scratch `*_ci` database with **local HTTP stubs standing in for every provider**
(`tests/setup.ts`'s `stub()`), so they make no paid calls and no network request.

**INFERENCE — what 13 green tests do and do not tell us.** They prove the grouping *invariants* hold:
a manual detach during a model answer wins, a revision keeps its membership without asking again, an
explicit regroup decides again, a waiting report is not evidence for others, a story's root is its
earliest fact that still holds reports, two stories merge only when both models agree, and
report-tied-but-unmerged stories list each other. They say **nothing** about relation accuracy: every
relation answer in those tests is hardcoded by the stub (`tests/events.test.ts:25–41`). That gap is
exactly what the Phase 2 benchmark exists to fill.

---

## 14. Recommendation

```text
READY_FOR_PHASE2_BENCHMARK_IMPLEMENTATION_REVIEW
```

The audit is complete and the design is concrete enough to review: the relation taxonomy is the
production one, the schema is fixed, the strata and the anti-leakage rule are named, and the harness has
a verified reuse path. What blocks implementation is not engineering but the **owner decisions in §12** —
label provenance first, then cost authorization, then the pair-judge export question.

No benchmark data has been generated, no harness has been written, no production grouping code has been
touched, and Phase 3 has not been started.
