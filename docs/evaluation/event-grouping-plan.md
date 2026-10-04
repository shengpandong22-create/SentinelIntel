# Phase 2 — Security Event Grouping Benchmark: Baseline Audit & Design

Status: **BASELINE_AUDIT_AND_BENCHMARK_DESIGN** — design for owner review. No benchmark data, no
harness and no production grouping change has been made.

Phase 2 goal (Migration Spec §11): *先判断 AIHOT grouping 在安防场景到底哪里不够* — establish an
event-relation benchmark, measure the current baseline, and name the failing security hard cases.
**Measure first; do not optimize before evidence.** Migration Spec §11 is explicit that only after this
report shows a problem may grouping prompts or recall be changed.

## How to read this document

Every claim is tagged:

- **REPO_VERIFIED** — read out of the source in this repository, with a file and line reference.
- **LOCAL_OBSERVED** — observed in this local environment only. It is **not** evidence about production
  and must not be read as one.
- **INFERENCE** — a conclusion drawn from the tagged facts above; the reasoning is given.
- **PROPOSED** — a design decision for owner review.

### Revision note

This revision answers an independent Phase 2 **design** audit. Its ten findings are addressed in place,
and each affected section states what changed and why. Nothing else was re-designed. In particular this
revision **generated no benchmark data, wrote no harness, and changed no production grouping code**;
the owner decisions that were open in the first version are now settled and are recorded in §12.

---

## 1. Git state

**REPO_VERIFIED**

The **audit starting HEAD** is the tree this audit read. It is deliberately recorded as the base commit
rather than as any later documentation commit, so that the number in this document cannot be confused
with the commit that carries the document:

```text
audit starting HEAD : 225e0f6473de8ac2b827c1ce34d4888a2111ac54   (branch point; = main = the Phase 1 tip)
branch              : phase/2-security-event-grouping
worktree            : clean at the start of the audit
main                : 225e0f6473de8ac2b827c1ce34d4888a2111ac54
tag                 : sentinelintel-phase1 → 225e0f6473de8ac2b827c1ce34d4888a2111ac54
```

Documentation commits are **not** part of the audit target. For the record, in order:

```text
17b69af  docs: audit the grouping baseline and design the Phase 2 event-relation benchmark
7a8485f  docs: revise the Phase 2 benchmark design after the independent design audit
<this commit>  docs: finalize the Phase 2 benchmark contract
```

**LOCAL_OBSERVED at revision time**: `git status --short` is empty, and `HEAD` is the last of those
commits. A reader who wants the audited tree should check out `225e0f6`, not the documentation tip.

`sentinelintel-phase1` is an **annotated** tag: `git rev-parse sentinelintel-phase1` prints the tag object
`1cd4f06550b458f726c5cd122970c2f879a1ba8d`, and its peeled commit
(`git rev-parse 'sentinelintel-phase1^{}'`) is `225e0f6`. That matches the brief's stated `main` and HEAD.
No discrepancy, so nothing was reset or rebased.

---

## 2. Repo-verified existing grouping architecture

**REPO_VERIFIED** — `packages/backend/src/events/group.ts` (865 lines) and
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

**REPO_VERIFIED** — all constants live in `group.ts` and are **module-private (not exported)**:

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

**REPO_VERIFIED — the recall path is *selected* by `embeddingsAvailable()`**
(`packages/backend/src/providers/embeddings.ts:30`), which requires *all* of: `config.modelCallsEnabled`,
an `EMBEDDING_API_KEY` **or** `DASHSCOPE_API_KEY`, and `EMBEDDINGS_ENABLED !== 'false'`. When it is
false, `recallFacts` takes the lexical branch (`group.ts:208–213`); when it is true, the cosine branch
(`group.ts:214–229`). That predicate is the repo fact.

**LOCAL_OBSERVED — embeddings are OFF in this environment.** `.env` here has
`MODEL_CALLS_ENABLED = true` but no `EMBEDDING_*` key and no `DASHSCOPE_API_KEY`, so
`embeddingsAvailable()` is false and recall takes the **lexical fallback** on this machine.

**NOT REPO-PROVEN — that production runs the embedding path.** The repository does **not** establish
that any deployed environment has an embedding credential configured. The earlier revision of this
document asserted "production runs the embedding path"; that was an inference from a local observation
and is withdrawn here. The correct statement is conditional: *if* a deployment has an embedding
credential (and model calls on, and `EMBEDDINGS_ENABLED` not `false`), recall uses the cosine branch;
otherwise it uses the lexical one.

**INFERENCE:** a recall measurement taken in this environment therefore measures the **lexical**
implementation, which may or may not be the one a given deployment runs. This is the single most
important constraint on the benchmark design, and it is why the recall stage must report **which branch
ran** as part of its result rather than reporting a bare recall number. Whether the benchmark should
target the embedding branch (and therefore needs either an authorized paid embedding pass or a replay of
real vectors) is an owner decision — see §12.

---

## 4. Current relation pipeline

**REPO_VERIFIED**

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

Schema robustness (**REPO_VERIFIED**): `RelationSchema = z.enum(RELATIONS).catch("UNRELATED")`
(`relate.ts:53`) — a malformed relation silently becomes `UNRELATED`; `confidence` falls back to `0.5`;
`decisions` falls back to `[]`, which then makes **every** candidate `UNRELATED` via `verdictsByFact`
(`relate.ts:114`). A benchmark must count these fallbacks, or a harness failure will be scored as model
disagreement.

### 4.3 Same-occurrence path

**REPO_VERIFIED** (`group.ts:667–701`)

```text
sameOccurrence(cands, verdicts)      sort: confidence desc, then recall score desc
  for each pick:
    score >= CONFIRM_BELOW_COSINE (0.85) → attach to that fact       (no second call)
    else → confirmMerge (PAIR_SYSTEM, groupReview model)
        review SAME_OCCURRENCE         → attach to that fact
        review SAME_STORY & is root    → new fact in that story
```

### 4.4 Same-story path, and how development chaining is prevented

**REPO_VERIFIED** — two independent guards:

1. `storyForDevelopment` (`relate.ts:126`) keeps only candidates with `storyRoot === true` and relation
   `SAME_STORY`, then takes the highest recall score. A development therefore attaches to the **fact that
   started the story**, never to another development.
2. `storyRoot` is computed in SQL by `rootFactOf` (`group.ts:93`) as the fact whose earliest **trusted**
   report came first — ordered by `coalesce(publications.published_at, discovered_at)`, so fact-id order
   is irrelevant, and a story whose facts all lost their reports has no root.

The `CandidateView.storyRoot` flag is documented as "developments attach only here (no chaining through
developments)" (`relate.ts:35`).

### 4.5 Story consolidation

**REPO_VERIFIED** (`group.ts:740–751`, `consolidate` at `group.ts:490`)

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

**REPO_VERIFIED** (`linkRelatedStories`, `group.ts:537`) — stories that stay apart although reports keep
tying them get a `story_links` row when at least `RELATED_MIN_REPORTS = 2` distinct reports, inside the
recall window, each firmly tied (`>= 0.8`) to a fact of the other story, none of them a roundup, and
neither story started by one. Links are only added; a merged story drops out where they are read.

### 4.7 Manual override protection

**REPO_VERIFIED** — six layers, any one of which is enough to lose a model's answer:

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

**REPO_VERIFIED — there is no positive "attach this report to that fact, manually" function.** The admin
surface offers `detachFromFact` and `mergeStories` (`admin/content.ts:183, 209`) only; `INSERT INTO
fact_articles` appears in production grouping and tests, never with `manual = true`.

### 4.8 Signal path

**REPO_VERIFIED** — `groupSignal` (`group.ts:832`), reached when `signalOnly` or
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

**REPO_VERIFIED** — `relate.ts` cites two measurements:

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

**REPO_VERIFIED — classification: (c) no event benchmark harness exists anywhere in the repository.**

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

**REPO_VERIFIED** — it is a production operational tool, so it must never be used as an offline evaluator:

- writes real membership: enqueues `force: true` group jobs (`:91–92`) that run the real
  `groupArticle` → `fact_articles` / `facts` / `stories` / `story_signals` / `grouping_decisions`;
- merges stories itself (`:129–141`) into the most-voted successor, writing `stories.merged_into` and
  `story_aliases`;
- writes `regroup_pending` (`:89`) and cancels jobs (`:59`);
- calls `warmRecallWindow` (**paid embeddings**, `:87`) and `consolidate` (**paid judge**, `:199`);
- `--dry-run` only suppresses the merge write — `group.ts:514` still calls both models.

It has no gold set, computes no metric, and cannot run offline.

### 6.2 What IS reusable

**REPO_VERIFIED / INFERENCE**

| piece | reusable as |
|---|---|
| `relate.ts` exports — `PAIR_SYSTEM`, `pairUser`, `PairSchema`, `BATCH_SYSTEM`, `batchUser`, `BatchSchema`, `verdictsByFact`, `sameOccurrence`, `storyForDevelopment`, `looksLikeRoundup`, `firmlyTied`, `TIE_MIN_CONFIDENCE`, `STORY_REVIEW_MIN_CONFIDENCE`, `lexicalSimilarity`, `reportText`, `RELATE_PROMPT_VERSION` | the harness can build the **exact production prompt, schema and pure decision rules** without touching production code |
| `group.ts` exports — `groupArticle`, `consolidate`, `linkRelatedStories`, `warmRecallWindow`, `GROUP_PROMPT_VERSION` | the end-to-end stage can drive the real pipeline |
| `tests/setup.ts` — `stub()`, `Reply`, `tag()`, `gate()` | a local HTTP stub standing in for every provider; the pattern `tests/events.test.ts` uses |
| `grouping_decisions.candidates` (JSONB: id, score, relation, confidence) | **the recall set is persisted by production code** (`group.ts:711–713, 336–338`) — a zero-cost way to observe what was actually recalled |
| `embeddings` table (`kind`, `ref_id`, `model`, `text_hash`, `vector`) | **REPO_VERIFIED in `tests/embeddings.test.ts:11–15`**: vectors can be pre-seeded and `ensureEmbeddings` reads them back with no provider call, so the **vector** recall path can be exercised offline and deterministically |
| `tests/events.test.ts` / `signals.test.ts` | the fixture pattern (source + analysis row + publication + fact) to copy |

**REPO_VERIFIED — not reusable:** the recall constants themselves. `RECALL_DAYS`, `RECALL_MIN_COSINE`,
`RECALL_TOP_FACTS`, `CONFIRM_BELOW_COSINE`, `SIGNAL_*` and `REMATCH_HOURS`/`WAIT_HOURS` are
**module-private**; the private `judgeBatch` / `confirmMerge` / `judgeSignal` / `judgeStories` /
`recallFacts` cannot be imported. This shapes the harness (see §9).

---

## 7. Proposed benchmark

**PROPOSED.**

### 7.1 Primary form: the production **batch** judge over a frozen candidate set

**The primary classifier under evaluation is `judgeBatch`** — `BATCH_SYSTEM` (`group-batch.md`), the
`modelFor("group")` model and `BatchSchema` (`group.ts:279–285`). That is the call that actually decides
the relation for each candidate fact in production, so it is the only thing whose accuracy Stage B may
report as the primary number.

**Diagnostic, not primary: `PAIR_SYSTEM` / the review model.** `confirmMerge`
(`group.ts:288–294`, `PAIR_SYSTEM`, `modelFor("groupReview")`) runs **only** when a candidate the batch
judge called `SAME_OCCURRENCE` came in below `CONFIRM_BELOW_COSINE = 0.85` — it is a low-similarity
merge *confirmation*. `judgeStories` (`group.ts:453–459`) uses the same pair prompt twice for
story-root consolidation. Both are measured in a **separate diagnostic table** (§8.2) and are **never
averaged into the primary confusion matrix**. The earlier revision of this document made the pair path
the primary benchmark; that was wrong for exactly this reason, and is corrected here.

**Consequences for the gold's shape.** Because the batch judge reads the whole candidate set in one
prompt, the gold must be a **query + candidate-set** gold, not a flat pair list:

| unit | what it is |
|---|---|
| **case** (the gold unit) | one `query` report + a **frozen, recorded candidate set**; each candidate in the set carries its own gold relation |
| **annotation unit** | the (query, candidate) pair — the annotator never has to judge a whole set at once |

So there is **one gold artifact**, shaped as cases with per-candidate labels. A pair-level view is a
*projection* of it, not a second gold. That keeps the brief's "do not maintain two gold sets"
constraint satisfied while still measuring the production call.

**REPO_VERIFIED — why the set must be frozen rather than assembled per run.** `batchUser` renders every
candidate into one prompt (`relate.ts:95–100`), `maxTokens` scales with the count
(`200 + 90 × candidates`, `group.ts:282`), the answer is one JSON document mapped by position
(`C1`, `C2`, …), and a candidate the model skipped silently becomes `UNRELATED`
(`verdictsByFact`, `relate.ts:107–115`). The answer therefore depends on the composition of the set, so:

- each case's candidate set is **part of the gold**, not something the harness chooses freely;
- the same set is sent to every baseline (B0 and B1 in §10), so the comparison is like-for-like;
- a case whose set changes is a **new case with a new `caseId`**, never an in-place edit.

**PROPOSED — set composition.** Per case: the gold-related candidate(s) from the same event family,
plus a fixed number of **distractors** drawn deterministically (seeded, recorded) from a frozen
distractor pool of near-miss material (same vendor, same product family, same month). Distractors are
what make the batch answer non-trivial: with a single candidate the task collapses back to a pair
question. The distractor count and the seed are recorded in `meta` on every report.

**Stage A and Stage B share the same cases.** Stage A asks whether the gold-related candidate was in the
**retrieved** set (`grouping_decisions.candidates`); Stage B feeds the **gold** set to the batch judge.
Run both, and the gap between them is the recall loss — one gold, three measurements (§8).

### 7.2 Relation labels: exactly the production taxonomy

**PROPOSED** — `SAME_OCCURRENCE` | `SAME_STORY` | `UNRELATED` | `ROUNDUP`. No new gold relation
(`SAME_CVE`, `PATCH`, `FOLLOW_UP`, `SIMILAR` are all forbidden). Security-specific differences are
expressed as `samplingContext.samplingStratum`, never by changing the ontology.

### 7.3 Schema (`datasets/event-relations/dev.jsonl` and `holdout.jsonl`)

**PROPOSED** — one JSON object per line. Each line is a **case**, and the case matches the *input shape
of the production batch judge*: one query report plus an ordered candidate set.

**Annotation is candidate-level, not case-level.** The gold relation is a property of one
(query, candidate) pair, so it — and everything that justifies it — lives on the candidate. A case-level
`humanAdjudicated` flag may **not** stand in for several candidate labels that were never separately
adjudicated.

```jsonc
{
  "caseId": "EVREL-VULN-0007",                  // stable: the query + this exact candidate set
  "split": "development",                       // development | holdout — RECORDED, never re-derived (§7.6)
  "samplingStratum": "disclosure-vs-vendor-confirmation",

  "query": {                                    // matches batchUser(query, cands) — the report being decided
    "reportId": "RPT-0007-A",                   // stable report identity, unique across the whole dataset
    "title": "…",
    "summary": "…",                             // an excerpt; the harness slices it like production
    "sourceName": "…",
    "firstParty": false,
    "publishedAt": "2026-09-30T12:00:00Z",      // real provenance; the prompt prints this (describeReport)
    "ingestedAt":  "2026-09-30T14:05:00Z",      // real provenance; the recall window keys on this
    "frame": { "subject": "…", "action": "…", "object": "…", "occurredAt": "2026-09-30" },

    "splitGroupId": "sg-cve-2026-76504",        // PER REPORT. anti-leakage unit ONLY, not an identity
    "identity": {                               // PER REPORT. real identity, audit + Stage C only
      "eventKey": "cve-2026-76504",             //   the one happening this report is about
      "storyKey": "story-2026-09-30-cve-2026-76504"  //   the story thread it belongs to
    }
  },

  "candidates": [                               // order IS the C1..Cn order of the batch prompt
    {
      "reportId": "RPT-0007-B",                 // the gold-related candidate
      "title": "…", "summary": "…", "sourceName": "…", "firstParty": true,
      "publishedAt": "2026-09-29T08:00:00Z",
      "ingestedAt":  "2026-09-29T09:10:00Z",
      "frame": { "subject": "…", "action": "…", "object": "…", "occurredAt": "2026-09-29" },
      "factTitle": "…",                         // production sends the candidate fact's title
      "members": 3,                             // production sends the fact's member count

      "splitGroupId": "sg-cve-2026-76504",      // PER REPORT
      "identity": {                             // PER REPORT
        "eventKey": "cve-2026-76504",           //   same occurrence as the query ⇒ same eventKey
        "storyKey": "story-2026-09-30-cve-2026-76504"
      },

      "gold": { "relation": "SAME_OCCURRENCE" },// one of the four production relations
      "expectedInRecall": true,                 // stage A: should production recall have offered this?

      "annotation": {                           // PER CANDIDATE — the label's own provenance
        "status": "decisive",                   // decisive | disputed | insufficient
        "labelSource": "model-reviewed",        // human | model-proposed | model-reviewed
        "humanAdjudicated": false,              // must be true for every decisive holdout label (§7.7)
        "labeller": "…",
        "confidence": "medium",                 // high | medium | low
        "adjudicator": null,                    // required whenever humanAdjudicated is true
        "sourceUrls": ["https://…", "https://…"],
        "note": "one line: why this particular pair got this relation"
      }
    },
    {
      "reportId": "RPT-0007-X",                 // a frozen distractor
      "isDistractor": true,
      "factTitle": "…", "members": 1,
      "title": "…", "summary": "…", "sourceName": "…", "firstParty": false,
      "publishedAt": "2026-09-30T06:00:00Z", "ingestedAt": "2026-09-30T07:00:00Z",
      "splitGroupId": "sg-cve-2026-76504",
      "identity": { "eventKey": "cve-2026-71204", "storyKey": "story-2026-08-…" },
      "gold": { "relation": "UNRELATED" },
      "expectedInRecall": false,
      "annotation": { "status": "decisive", "labelSource": "model-reviewed",
                      "humanAdjudicated": false, "labeller": "…", "confidence": "high",
                      "adjudicator": null, "sourceUrls": ["https://…"], "note": "…" }
    }
  ],

  "construction": {                             // OPTIONAL, case-level, NOT a label. audit metadata only
    "assembledAt": "2026-10-04",
    "assembledBy": "…",
    "distractorSeed": 42,
    "note": "how this candidate set was drawn"
  }
}
```

Note the shape change from the previous revision: `splitGroupId` and `identity` moved from the case to
**each report**, and `annotation` moved from the case to **each candidate**. Reasons, and the findings
they answer:

- **Annotation must be candidate-level (contract correction).** One case holds several candidate labels,
  and they can legitimately differ in provenance, confidence and adjudication — a case can hold one
  adjudicated label and one model-only one. A single case-level `humanAdjudicated` would then be a claim
  about labels nobody adjudicated. It is therefore removed: the flag exists only per candidate.
- **Identity must be report-level (contract correction).** `identity.eventKey` / `identity.storyKey`
  describe *one report's* real-world identity, and Stage C compares two reports. A case-level identity
  could not express "same story, different event" — it would have to be a single value for both sides,
  which is exactly the distinction Stage C is built on (§8.3).
- **`splitGroupId` is per report, because a case may touch several leakage groups.** Its only job is
  leakage control: a case may assemble reports from two different groups as long as **both groups landed
  in the same split**, which is a constraint the validator checks rather than something the case can
  declare (§7.6).
- **`splitGroupId` is separate from `identity`.** Three reasons: (a) the anti-leakage unit may
  legitimately be *broader* than one event — a vendor's monthly advisory campaign or a whole policy
  lifecycle must not straddle splits even though it spans several events; (b) if the leakage key were the
  event key the two would be forced to coincide, and a change to either would silently change the other;
  (c) `splitGroupId` is opaque, so it carries no label hint if it reaches a debug log, while `identity` is
  never sent anywhere.
- **Stable report identity.** Every report carries a dataset-wide-unique `reportId`. Without it, a report
  that appears in several cases (normal: the same advisory is the query in one case and a candidate in
  another) cannot be tracked, and "no report straddles the split" cannot be asserted.
- **Explicit query/candidate direction.** `batchUser(query, cands)` is directional: the prompt says
  "新报道" for one side and "候选 C1…" for the others (`relate.ts:95–100`). The harness must never
  transpose them.
- **Ingestion order is a validation rule, not a convention.** The query is the later arrival (production
  decides on the report being ingested), so the validator asserts `query.ingestedAt >= candidate.ingestedAt`
  for every candidate, inside `RECALL_DAYS = 14` — **REPO_VERIFIED**: `recallPool` filters on
  `articles.discovered_at` (`group.ts:109`), and the file comment notes the window is "keyed on discovery,
  so an old page found today still meets its peers" (`group.ts:34`).
- **Two time fields per report, because production uses two.** `publishedAt` is what the prompt prints;
  `ingestedAt` is what the recall window uses. Both hold **real provenance** — the time-rebasing needed to
  keep the benchmark alive happens in the fixture, not in the dataset (§7.8).
- **`factTitle` and `members` are recorded** because `batchUser` sends them (`relate.ts:97`); the
  oracle-candidate stage must supply them.
- **`annotation.status`, not a fifth relation.** The vocabulary stays exactly the four production
  relations. But a non-decisive label may **not** sit in the frozen benchmark at all (§7.7) — the
  benchmark files are decisive-only.
- **Both source URLs are kept** per candidate. Phase 1's benchmark lost URL traceability in 50 rows
  (§L item 10 of `docs/evaluation/selection.md`); this schema keeps every pair re-verifiable.
- **`summary` is an excerpt, not a verbatim archive.** The harness slices it to production's lengths
  (`reportText` → 300 chars, `describeReport` → 360 chars).
- **No similarity field in the gold.** Cosine is a property of a run, not of the gold.

### 7.3.1 Relation ↔ identity consistency (mechanically validated)

Because identity is now per report, `gold.relation` and the two identity pairs must agree. The validator
asserts, for every candidate:

| `gold.relation` | required `eventKey` | required `storyKey` |
|---|---|---|
| `SAME_OCCURRENCE` | **equal** to the query's | **equal** to the query's |
| `SAME_STORY` | **different** from the query's | **equal** to the query's |
| `UNRELATED` | (unconstrained) | **different** from the query's |
| `ROUNDUP` | (unconstrained) | (unconstrained — see §8.3) |

This is the same mapping Stage C uses to build gold-connected components (§8.3), so a violation here
would make the relation metric and the story metric describe different ground truths.

### 7.4 Hard-case strata

**PROPOSED** — the eight the Migration Spec §11 names, plus eight additions, each tied to a specific
mechanism in the code. **16 strata.**

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

| # | stratum | intended gold | justification |
|---|---|---|---|
| 9 | `same-cve-cross-source-different-url` | `SAME_OCCURRENCE` | two outlets covering one advisory, **at different URLs**, so the deterministic `same-url` shortcut does **not** fire and the batch judge has to decide. This is the "repeat coverage" rule of `group-definitions.md:1`, and after this revision it is the **only** `SAME_OCCURRENCE`-by-repeat stratum in the primary set |
| 10 | `advisory-republished-by-cert` | `SAME_OCCURRENCE` | a CERT republishing a vendor advisory is a *repeat* of one happening, but the source and the wording change (low cosine) |
| 11 | `advisory-revision-vs-republication` | `SAME_STORY` | the exact boundary the prompt draws between "重复报道" and "同一份公告的修订" (`group-definitions.md:1, 8`); the two are near-identical in text. This stratum **is** the "advisory scope/status revision" case — line 8 names "范围更正、状态更新" explicitly — so no separate stratum was added for it |
| 12 | `roundup-containing-one-event` | `ROUNDUP` | `looksLikeRoundup` requires **every** candidate to be ROUNDUP (`relate.ts:131`), so a digest plus one strong candidate is the false-split trap |
| 13 | `multiple-cves-in-one-advisory` | **`UNRELATED`** | **corrected from the first revision**, which had this as `SAME_OCCURRENCE` — see the note below |
| 14 | `same-product-family-different-cve` | `UNRELATED` | a sibling-model CVE is the highest-cosine `UNRELATED` case |
| 15 | `procurement-correction-or-cancellation` | `SAME_STORY` | **new in this revision**, taking part of the 16 cases freed by the same-URL stratum. `group-definitions.md:9` puts the whole procurement chain in one story — "同一次采购从招标、开标、澄清到中标、成交、终止" — so a correction notice ("澄清") or a cancellation ("终止") against the original notice is a later stage of the same project, not a new happening |
| 16 | `policy-amendment-or-implementation-date` | `SAME_STORY` | **new in this revision**, taking the rest. `group-definitions.md:10` names the policy/standard chain directly — "征求意见稿 → 正式发布 → 修订 → 明确的实施日期" — so an amendment or an announced implementation date is a later stage of the same document. Distinct from stratum 8 (`policy-draft-vs-final`), which covers the *consultation→issue* step of that chain |

**Correction — stratum 13 (audit finding).** The first revision labelled
`multi-cve-in-one-vendor-advisory` as `SAME_OCCURRENCE`, with the reasoning that one advisory is one
happening. That reasoning mixes up two different things the prompt keeps apart. **REPO_VERIFIED**, from
`industry/prompts/group-definitions.md`:

- line 1 (`SAME_OCCURRENCE`) — one advisory's *scope* is one happening: *"同一厂商在同一份公告里一并给出的
  多个受影响产品线、多个型号、多个固件分支，以及这次公告里的受影响范围、修复版本、缓解措施、CVSS 分数，
  都算同一次发生"* → several products/models **inside one advisory** are one happening.
- line 14 (`UNRELATED`) — different *vulnerability identifiers* are two things: *"同一厂商的不同 CVE：
  同一厂商或同一产品的两个不同漏洞编号，属于两件事，即使同一天发布、出现在同一份月度补丁汇总里"*.

So the stratum is renamed `multiple-cves-in-one-advisory` and its gold is **`UNRELATED`**: the pair
compares two reports covering **different CVEs** out of the same vendor advisory (or the same monthly
patch roundup). What the two reports share is the vendor, the date and the wording — which is precisely
the highest-cosine false-merge trap, and the reason the stratum is worth keeping. The "several affected
products in one advisory" case is *not* a separate stratum: it is the same happening described twice,
already covered by strata 9 and 10.

**Demoted out of the primary set — `literal-same-url-duplicate` (contract correction).** The previous
revision spent 16 of the 240 primary cases on "the same URL collected twice". The repository says that
case is largely **unreachable through normal ingestion**:

- **REPO_VERIFIED** — `identityKeyFor(m)` falls back to `identityKeyForUrl(m.url)`, which returns
  `url:${normalizeUrl(url)}` (`packages/backend/src/content/materials.ts:114–120`,
  `packages/backend/src/lib/url.ts:48–55`).
- **REPO_VERIFIED** — `articles.identity_key` is `text NOT NULL UNIQUE`
  (`database/migrations/0001_core.sql:63`), and `upsertMaterial` inserts with
  `ON CONFLICT (identity_key) DO NOTHING RETURNING id` (`materials.ts:141–149`).

So the same normalised URL is folded into **one** article on the way in. The `same-url` guard inside
`decide()` (`group.ts:663–666`) still exists and still matters for the paths that bypass that constraint,
but nothing in the repository shows it carries 6.7% of the security relation workload.

**Therefore:** `literal-same-url-duplicate` leaves the primary 240-case benchmark and becomes a
**deterministic diagnostic / integration-test track** — a fast fixture that asserts the shortcut fires,
kept in the fixture tests of §9 rather than in the relation-class allocation. Its 16 cases went to
strata 15 and 16 (§7.5).

**Two further suggestions were declined, on purpose.** "Advisory scope/status revision" is **already**
stratum 11 (`group-definitions.md:8` names "范围更正、状态更新" directly), so adding it would duplicate a
stratum. "Same procurement project, different lot" was declined because `group-definitions.md` does
**not** settle it: line 9 puts the whole procurement chain in one story, while line 13's `UNRELATED`
list is about "不同的项目" and never mentions lots. Labelling it would mean guessing, and §7.7 now forbids
non-decisive labels in the frozen benchmark — so inventing a stratum whose gold is arguable would
manufacture exactly the excluded cases the contract forbids.

**INFERENCE:** 16 strata is the point where every named risk is covered once, the mechanisms the earlier
revisions conflated are separated (advisory *scope* vs advisory *revision*; the `same-url` shortcut vs
the judge's own decision), and no stratum is added whose gold the definitions do not decide. The brief's
remaining optional extras (a separate CVE-update stratum, same-project different lot) stay out for that
same reason.

### 7.5 Size and split

**Owner-settled: 240 total / 180 development / 60 holdout.** The first revision's *quotas* are
withdrawn, because as written they could not all hold at once.

**Why the old quota set is withdrawn (arithmetic, not opinion).** The first revision said, together:
a per-stratum target of **12–20 pairs**, a holdout of **60 of 240**, and a **per-class holdout floor of
≥ 12**. A case belongs to exactly one stratum and to exactly one relation class, and several classes live
in very few strata — `ROUNDUP` in exactly one. For `ROUNDUP` to reach 12 holdout cases out of a single
stratum, either

- that stratum holds ≥48 pairs (12 holdout at the nominal 25% share) — **over the 20 cap**, or
- that stratum holds ≤20 pairs and ≥12 of them are holdout — a **60% holdout rate** for that stratum,
  against a global rate of 25%.

So the three quotas are mutually under-determined: at least one has to give, and which one gives was
never stated. The replacement is a **fixed table** instead — no band, no rate — so nothing is left to
interpretation.

**PROPOSED allocation — 16 primary strata.** The only invariants kept are the ones a validator can check
mechanically:

| invariant | value |
|---|---|
| total | **240** |
| development / holdout | **180 / 60** |
| minimum cases per stratum in the holdout | **≥ 3** (the smallest cell in the table below is exactly 3) |
| minimum cases per relation class in the holdout | **≥ 9** (`ROUNDUP`), replacing the withdrawn ≥12 |
| split unit | **`splitGroupId`**, assigned **globally** during construction and then frozen (§7.6) |

Per class: `SAME_STORY` 96 (dev 69 / holdout 27) · `SAME_OCCURRENCE` 46 (34 / 12) ·
`UNRELATED` 64 (52 / 12) · `ROUNDUP` 34 (25 / 9) — **240 (180 / 60)**.

| # | stratum | class | total | dev | holdout |
|---|---|---|---|---|---|
| 1 | `disclosure-vs-vendor-confirmation` | SAME_STORY | 16 | 13 | 3 |
| 2 | `disclosure-vs-patch` | SAME_STORY | 14 | 11 | 3 |
| 3 | `poc-vs-disclosure` | SAME_STORY | 10 | 7 | 3 |
| 4 | `same-cve-multi-vendor-product` | SAME_STORY | 14 | 11 | 3 |
| 5 | `same-vendor-different-cve` | UNRELATED | 22 | 19 | 3 |
| 6 | `same-model-different-vulnerability` | UNRELATED | 14 | 11 | 3 |
| 7 | `procurement-notice-vs-award` | SAME_STORY | 10 | 7 | 3 |
| 8 | `policy-draft-vs-final` | SAME_STORY | 8 | 5 | 3 |
| 9 | `same-cve-cross-source-different-url` | SAME_OCCURRENCE | 30 | 21 | 9 |
| 10 | `advisory-republished-by-cert` | SAME_OCCURRENCE | 16 | 13 | 3 |
| 11 | `advisory-revision-vs-republication` | SAME_STORY | 6 | 3 | 3 |
| 12 | `roundup-containing-one-event` | ROUNDUP | 34 | 25 | 9 |
| 13 | `multiple-cves-in-one-advisory` | UNRELATED | 14 | 11 | 3 |
| 14 | `same-product-family-different-cve` | UNRELATED | 14 | 11 | 3 |
| 15 | `procurement-correction-or-cancellation` | SAME_STORY | 8 | 5 | 3 |
| 16 | `policy-amendment-or-implementation-date` | SAME_STORY | 10 | 7 | 3 |
| | **total** | | **240** | **180** | **60** |

Column sums: totals
`16+14+10+14+22+14+10+8+30+16+6+34+14+14+8+10 = 240`; development
`13+11+7+11+19+11+7+5+21+13+3+25+11+11+5+7 = 180`; holdout
`(14 × 3) + 9 + 9 = 60`.

**What changed from the previous revision, and why.** `literal-same-url-duplicate` left the primary set
(§7.4) and its 16 cases were redistributed to two security-relevant strata. The table above is the whole
allocation; there is no leftover.

**PROPOSED — the validator checks this table, it does not trust it.** Before evaluating, it re-derives
the class totals, the stratum totals and the split totals from the frozen file and **fails loudly** if
any differs from the table. A dataset that drifts silently is how a benchmark stops measuring what its
document says it measures.

**INFERENCE — a stated consequence of the per-stratum floor.** With 16 strata and ≥3 holdout cases each,
45 of the 60 holdout cases are spoken for by that floor alone, and the nine `SAME_STORY` strata take 27
of them. The holdout is therefore **class-unbalanced by construction** (27 / 12 / 12 / 9). That is a
deliberate trade — per-stratum coverage in the holdout, class-level conclusions in the report — and it is
written down here rather than discovered later. Even so, the class-level numbers are wide: a 12-case
class has an accuracy standard error around ±0.13 and `ROUNDUP`'s 9 cases around ±0.16, so per-stratum
conclusions stay on development (180 cases). 240 keeps the paid cost at ~240 batch calls per
relation-stage run — the same order as Phase 1's 200-case benchmark.

### 7.6 Anti-leakage and the split assignment

**PROPOSED.** The anti-leakage unit is **`splitGroupId`**, per report, and it is deliberately *not* the
same field as `identity.eventKey` / `identity.storyKey` (§7.3 explains why the two are kept apart).

**The assignment is GLOBAL and happens once, during dataset construction — not in the harness.** The
previous revision described taking whole `splitGroupId` groups stratum by stratum, greedily, until each
stratum's holdout quota was met. That algorithm is **withdrawn**: a `splitGroupId` may span several strata
(one vendor's monthly advisory campaign puts reports into strata 2, 5 and 13), so taking it whole into one
stratum's holdout immediately changes another stratum's count, and the greedy pass can end up unable to
hit the fixed table at all.

The rule is now:

1. **Assign splits globally at `splitGroupId` level**, once, over the whole dataset — a single constrained
   allocation, not a per-stratum sweep. Group boundaries are hard; the per-stratum and per-class counts of
   §7.5 are the targets the allocation must hit.
2. **If the group-level allocation cannot reach the §7.5 table, adjust the case selection before freeze**
   — swap a case, choose a different report from the same stratum, or drop a group. **Never split a
   `splitGroupId` to make a quota**, and never move a single report of a group to the other side.
3. **The frozen dataset records the split explicitly.** Every case carries `split`
   (`development` | `holdout`); it is data, not something the harness computes.
4. **The validator does not re-decide the split.** It only checks the frozen file:

   | check | why it is the check |
   |---|---|
   | no `splitGroupId` crosses the split | the leakage rule itself |
   | no `reportId` crosses the split | a report appears in several *cases* (the same advisory is the query in one and a candidate in another), so a case-random split would leak it — only checkable because `reportId` is stable (§7.3) |
   | every case's reports all share one split | a case may touch several `splitGroupId`s; they must have landed on the same side |
   | every `caseId` appears exactly once | no duplicate rows |
   | total / development / holdout counts = **240 / 180 / 60** | the frozen totals |
   | per-class and per-stratum counts match §7.5's table | the frozen allocation, re-derived not trusted |
   | query `ingestedAt >=` every candidate's, within `RECALL_DAYS = 14` | ingestion order (§7.3) |
   | `gold.relation` is one of the four production relations | no fifth label (§7.3) |
   | relation ↔ identity consistency | §7.3.1 |
   | every `annotation.status` is `decisive` | the frozen benchmark is decisive-only (§7.7) |
   | every decisive holdout candidate has `annotation.humanAdjudicated = true` | the owner's decision (§12.1), now checked per **candidate**, not per case |

5. **What must never be split across development and holdout:** the same CVE, the same vendor advisory
   (including its later revisions), the same procurement project, and the same policy lifecycle. That is
   exactly what `splitGroupId` encodes — and it is *broader* than a single event, which is why it cannot
   be the `eventKey`.

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

**PROPOSED process — how a pair that nobody can settle is handled (audit finding).**

`gold.relation` takes **exactly one of the four production relations**. There is **no fifth
`AMBIGUOUS` relation**, and none may be invented: adding one would change the label vocabulary the
benchmark is supposed to measure the system against, and would make the confusion matrix no longer a
confusion over the production taxonomy.

Unsettled pairs are expressed as **annotation state on the candidate, not as a label**:

| `annotation.status` | meaning | where the row may live |
|---|---|---|
| `decisive` | the annotator, and where required the adjudicator, agree on one relation | **the frozen benchmark** |
| `disputed` | two reasonable labels exist and no adjudication has settled them | the review pool only |
| `insufficient` | the material does not carry enough information to decide either way | the review pool only |

**The frozen benchmark is decisive-only (contract correction).** `datasets/event-relations/dev.jsonl` and
`datasets/event-relations/holdout.jsonl` may contain **only** candidates whose
`annotation.status === "decisive"`. A `disputed` or `insufficient` candidate may **not** stay in a formal
case — and it may not be present-but-uncounted either. `judgeBatch` answers the *whole* candidate list in
one prompt (§7.1), so an unsettled candidate sitting in the list can still change the answers for the
**other** candidates. Keeping it in and excluding only its own metric would corrupt the neighbouring
cells.

Unsettled material goes to a separate **review pool / annotation queue**. It is genuinely useful — it is
the evidence that the annotation protocol has a hard boundary — but it is not part of the 240, and it is
not shipped in the benchmark files.

**PROPOSED process — the steps, and who does what (owner decisions in §12):**

1. **Development may be labelled by a model** (`labelSource: model-proposed`) and reviewed by a model
   (`model-reviewed`). Any development candidate whose `SAME_OCCURRENCE` vs `SAME_STORY` boundary is
   disputed or low-confidence must be human-adjudicated — `annotation.humanAdjudicated = true` **on that
   candidate**, with an `adjudicator` recorded.
2. **Every candidate-level gold label that enters the holdout's decisive relation metrics must be
   human-adjudicated.** This is the holdout constraint (contract correction), and it is **per candidate**:
   a holdout case holds several candidates and each carries its own `humanAdjudicated` and `adjudicator`.
   The validator asserts it per candidate (§7.6), never per case. A holdout with even one non-adjudicated
   decisive label cannot be frozen.
3. **Neither set may be called human gold unless it actually is.** The report prints the `labelSource`
   breakdown **per candidate** for the split it ran. A development set that is mostly `model-reviewed` is
   **not** human-labelled gold, and the document, the report and the run label must say so. (Phase 1's
   accepted deviation was exactly this point — `docs/evaluation/selection.md` §B.)
4. **Provenance is recorded per candidate**: `labelSource`, `labeller`, `confidence`, `humanAdjudicated`,
   `adjudicator`, `sourceUrls`, `note`. Case-level `construction` metadata is optional and is never a
   label (§7.3).

### 7.8 Benchmark time rebasing (contract)

**REPO_VERIFIED — why this is needed.** Production recall is bounded by wall-clock time: `recallPool`
selects candidates with `articles.discovered_at > now() - RECALL_DAYS` (`group.ts:109`,
`RECALL_DAYS = 14`). If the fixture wrote the dataset's real historical `ingestedAt` values straight into
the scratch database, **the benchmark would expire about 14 days after the material was collected**: a
rerun a month later would recall an empty candidate set and measure nothing.

**The dataset keeps real provenance.** `publishedAt` and `ingestedAt` in `datasets/event-relations/*.jsonl`
are the real values, unchanged, so every label stays auditable against its sources.

**The fixture rebases time.** When loading a case into the scratch database the harness maps the real
timestamps onto an evaluation anchor:

```text
discoveryTimeShift    = evaluationTimeAnchor   - datasetReferenceTime
fixture.discovered_at = dataset.ingestedAt     + discoveryTimeShift
fixture.published_at  = dataset.publishedAt    + discoveryTimeShift
```

- **Both** timestamps shift by the **same** delta, so every real interval survives: ingestion order, the
  query-vs-candidate gap, each report's `discovered_at - published_at` distance, and the ordinal sequence
  inside a `splitGroupId`.
- **`evaluationTimeAnchor` is chosen relative to run time, not as a fixed calendar date** — e.g.
  `runStart - a small epsilon` — so the fixture is always inside the `RECALL_DAYS` window and a rerun in a
  later month reproduces the same numbers. A fixed date would re-introduce the expiry.
- The report's `meta` records **both** `evaluationTimeAnchor` and `discoveryTimeShift`, so any result can
  be re-derived and any accidental dependence on the real calendar is visible.
- The anchor must also keep `published_at` from landing in the future: source times more than
  `FUTURE_TOLERANCE_MS = 3600 * 1000` ahead are not trusted (`materials.ts:64`), which
  `anchor = runStart - ε` satisfies since `published_at <= ingested_at <= anchor`.

**How the fixture avoids being short-circuited by `isHistorical()`.** **REPO_VERIFIED:**

```js
// packages/backend/src/content/materials.ts:91-93
export function isHistorical(a) {
  return a.backfill && (!a.published_at || a.discovered_at.getTime() - a.published_at.getTime() > STALE_ON_DISCOVERY_MS);
}
```

with `STALE_ON_DISCOVERY_MS = 48 * 3600 * 1000` (`materials.ts:62`, commented "must not be wider than the
72 h the v1 contract states"). A historical report founds no event: `groupArticle` returns
`verdict: "historical"` before it ever recalls or judges (`group.ts:625–629`), and `content.ts:119` only
enqueues grouping when `!row.historical`. So a fixture that pulled `discovered_at` into the present while
leaving `published_at` in the real past would make `discovered_at - published_at` enormous and, for any
`backfill = true` row, turn **every case** into `historical` — silently emptying Stage C.

The fixture therefore does **two** things, and both are required:

1. **shift `published_at` by the same delta as `discovered_at`** (above), so
   `discovered_at - published_at` is exactly what the dataset says; and
2. **insert fixture rows with `backfill = false`**, because a benchmark report is news, not a new source's
   first backfill import.

Either alone leaves a hole — `backfill = false` with an unshifted `published_at` would still contradict
the anchor — so the validator asserts the invariant directly: for every report, the fixture's
`discovered_at - published_at` equals the dataset's value.

**Stage A and Stage C must not read wall-clock time directly.** They may see time only through the anchor
and the shift, so the same frozen dataset produces the same numbers in any month.

**PROPOSED, recorded per run:** `evaluationTimeAnchor` = the run's start time minus a small epsilon, so
the newest report sits just before "now" and every other report is earlier; `datasetReferenceTime` is the
dataset's own reference instant (its newest `ingestedAt`), fixed once at freeze.

---

## 8. Proposed metrics

**PROPOSED.** Three stages, so that a miss can be attributed to recall, to the judge, or to the
deterministic policy. Reporting only one aggregate F1 is explicitly rejected: it cannot distinguish the
three bottlenecks.

### 8.1 Stage A — candidate recall

- **candidate recall@K**, `K = RECALL_TOP_FACTS = 10`: for each case, for every candidate marked
  `expectedInRecall: true`, was that candidate's fact in the set production recall offered for the query?
- **missed-candidate rate** = 1 − recall@K, broken down **by stratum** (this is where "which security hard
  cases fail" gets answered) and **by recall branch**.
- **recall-branch indicator** per case, because the two similarity implementations are not comparable:
  `same-url` shortcut · reply/quote boost · embedding branch · lexical fallback. The branch is decided by
  `embeddingsAvailable()` and **must be reported**, since the repo does not prove which branch a given
  deployment runs (§3).
- **INFERENCE:** stage A can be measured with **zero model calls and zero cost** by driving
  `groupArticle()` on a scratch `*_ci` database with a stubbed provider and reading the recall set out of
  `grouping_decisions.candidates` (`group.ts:711–713`). Caveat, from §3: without an embedding credential
  this measures the **lexical** branch, and with pre-seeded vectors (`tests/embeddings.test.ts` proves
  this works) it measures the **embedding** branch under **given** vectors — neither is a real
  embedder's semantics. It measures the recall *policy* and gives a deterministic regression guard; a
  deployment-representative recall number needs that deployment's embedder.

### 8.2 Stage B — relation classification

**The primary number is the production batch judge's accuracy**: `judgeBatch`
(`BATCH_SYSTEM` = `group-batch.md`, the `modelFor("group")` model, `BatchSchema`) answering each case's
**frozen candidate set**. Metrics, computed over each candidate in every **decisive** case:

- **4 × 4 confusion matrix** over `SAME_OCCURRENCE` / `SAME_STORY` / `UNRELATED` / `ROUNDUP`.
- **per-class precision, recall, F1** and **macro F1** (Tech Design §15.2).
- **`SAME_OCCURRENCE` precision / recall** and **`SAME_STORY` precision / recall** on their own (both the
  Tech Design and the Migration Spec §11 name them explicitly).
- **distractor cells reported separately.** The matrix is printed twice: once over gold-related candidates
  only, once including distractors — a judge that gets every real candidate right but marks distractors
  `SAME_STORY` is a different, worse system, and one aggregate number would hide that.
- **schema-fallback counters**, because they masquerade as model errors: how often a relation fell back to
  `UNRELATED`, a confidence to `0.5`, or `decisions` to `[]` (`relate.ts:53–59`).
- **token and latency per case**, and the `RELATE_PROMPT_VERSION` of the run.

**Nothing is excluded at run time, because the frozen benchmark is decisive-only.** Every candidate in
`dev.jsonl` / `holdout.jsonl` has `annotation.status === "decisive"` (§7.7); `disputed` and `insufficient`
material lives in the review pool and never reaches the matrix, because an unsettled candidate in a batch
prompt can move the answers for its neighbours. There is no fifth relation label and no run-time exclusion
step to get wrong. The report instead prints the **`labelSource` breakdown per candidate** — how many
labels were human-adjudicated versus model-reviewed — so provenance stays visible.

**Diagnostic table — the pair judge, reported separately and never merged into the primary matrix.**
`PAIR_SYSTEM` / `modelFor("groupReview")` is measured on the subset where **production would actually
call it**, i.e. the candidates the batch judge called `SAME_OCCURRENCE` whose recall similarity is below
`CONFIRM_BELOW_COSINE = 0.85` (`group.ts:674–689`), plus the story-root consolidation pairs
(`judgeStories`, `group.ts:453`). Its purpose is to answer "does the confirmation step agree with the
first judge, and does it admit or reject the low-similarity merges?" — it is a **diagnostic**, and it
answers a different question from the primary table. Averaging the two into one F1 would hide which of
the two steps is losing the merges.

### 8.3 Stage C — end-to-end story metrics

- **pairwise merge precision / recall** over gold-connected components. Both sides are defined
  explicitly, because this stage runs the **real pipeline** (recall → batch judge → confirm → `same-url`
  shortcut → consolidation) on a scratch database seeded in ingestion order. The gold side is defined by
  the **per-report identity** (§7.3), not by `gold.relation`:
  - *gold same story* — the two reports carry the **same `identity.storyKey`**.
  - *predicted same story* — the two reports end up under the same live `stories.id` after the run,
    following `merged_into`.
  - precision = (# pairs both sides call one story AND gold says one story) / (# pairs both sides call one
    story); recall = the same numerator over (# gold-one-story pairs).

  The relation vocabulary maps onto identity exactly as §7.3.1 asserts — that mapping is what keeps the
  relation metric and the story metric describing **one** ground truth:

  | `gold.relation` | `eventKey` | `storyKey` |
  |---|---|---|
  | `SAME_OCCURRENCE` | same | same |
  | `SAME_STORY` | **different** | same |
  | `UNRELATED` | (any) | **different** |
  | `ROUNDUP` | (any) | (any) |

  `ROUNDUP` is deliberately **unconstrained**, and a `ROUNDUP` pair must **not** be auto-treated as one
  story: a digest that lists another event as one entry among many is its own report in its own story —
  the relation only records that one side is a digest. Making `ROUNDUP` imply membership would silently
  merge every roundup into every event it mentions.
- **false-merge list** = predicted same, gold not — the Migration Spec's *false merge examples*, each with
  the two `reportId`s and the verdict that attached them.
- **false split list** = gold same, predicted not — the Migration Spec's *false split examples*, each with
  the reason it did not attach (recall miss / `UNRELATED` verdict / below-threshold similarity with a
  failed confirmation).
- **verdict distribution** over the real `GroupResult.verdict` vocabulary — `same-fact`, `same-url`,
  `new-fact-in-story`, `new-story`, `roundup`, `kept`, `standalone`, `manual`, `skipped`, `historical`
  (`group.ts:571–588`). The signal verdicts are out of scope (§4.8) and are reported as `0`.
- **counts of the deterministic gates that fired:** `confirmMerge` invoked because the candidate was below
  `CONFIRM_BELOW_COSINE`; the `same-url` shortcut; `looksLikeRoundup`; schema fallbacks.
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
| fixture time rebasing | required by the recall and end-to-end stages. `discovered_at` and `published_at` shift by one common `discoveryTimeShift` so the fixture lands inside the `RECALL_DAYS = 14` window, `backfill = false` on every fixture row, and each report's `discovered_at - published_at` is asserted equal to the dataset's (§7.8). Without this the benchmark expires ~14 days after collection, and a `backfill` row would be short-circuited by `isHistorical()` into `verdict: "historical"` before recall or judging ever runs |
| deterministic diagnostic track | the `same-url` shortcut is **not** a primary stratum (§7.4). It gets a small deterministic fixture test that ingests the same normalised URL twice and asserts the shortcut fires — kept beside the grouping fixture tests, not inside the 240 |
| pre-flight validation | before any stage runs, the validator described in §7.6 and §7.3.1 is executed over the frozen file and **must pass** (totals, split isolation, decisive-only, per-candidate holdout adjudication, relation↔identity consistency). A dataset that fails validation does not run |
| report | `.data/eval/event-grouping-<split>-<n>-<ts>.json`: meta (split, n, seed, `RELATE_PROMPT_VERSION`, `GROUP_PROMPT_VERSION`, recall branch, model ids, **`evaluationTimeAnchor`**, **`discoveryTimeShift`**, and the `labelSource` counts per candidate), per-case rows (caseId, stratum, gold, predicted, confidence, recall score, whether the review model was called, fallbacks), the confusion matrix (with and without distractors), per-class and macro metrics, stage-A recall, stage-C merge P/R with the false-merge/false-split lists, token and latency totals |
| SelectBench | **not used for the primary result — corrected.** The first revision said SelectBench "cannot hold a 4-class relation matrix without new columns". That overstates it: `gold` and `decision` are plain text (`CaseIn` in `packages/backend/src/admin/selectbench.ts:12–13`), so the columns could physically store `SAME_STORY`. What is binary selection-specific is everything around them — `importSelectBenchRun` requires each model's `summary` and copies it verbatim into `selectbench_runs.summary`, deriving `sample_size` from `meta.n` (`selectbench.ts:32–41`); the admin outcome filter hardcodes `'fp' THEN decision='select' AND gold='reject'`, `'fn' … 'select'`/`'reject'`, `'tp'`, `'tn'`, `'either' THEN gold='either'`, `'error' THEN decision IS NULL` (`selectbench.ts:87–96`); `score` is the selection 0–100 score; `relevance` is pass/block; and the run browser is a "same cases, outcome filter, disagreement count" selection comparison. Reusing it would therefore mean new columns **and** new summary/outcome semantics. Phase 2 writes its own JSON report in `.data/eval/`; a grouping view in the admin UI is a **deferred UI enhancement**, not a Phase 2 blocker |

### 9.1 The evaluation seam — settled by the owner, not yet implemented

**REPO_VERIFIED:** `judgeBatch`, `confirmMerge`, `judgeSignal` and `judgeStories` are **private**
(`group.ts:279, 288, 296, 453`), and the recall constants are private too. The harness therefore cannot
call the thing it is supposed to measure.

**Owner decision (§12): a minimal non-runtime evaluation seam is allowed, and its target must be the
production batch judge.** Concretely, what the seam may and may not be:

| allowed | forbidden |
|---|---|
| exporting an already-private function unchanged | any change to `BATCH_SYSTEM`, `PAIR_SYSTEM` or the `group-*.md` prompts |
| adding a thin exported wrapper that calls the existing private `judgeBatch` with the same arguments, so the harness exercises production's own call | any change to a model choice, temperature, `maxTokens`, receipt/retry behaviour or `attemptTag` |
| the same for the pair judge, **for the §8.2 diagnostic table only** | any new code path that production itself takes, any change to `decide()`'s routing, any change to a threshold |
| exporting the recall constants for the report's `meta` | any change to recall logic |

The seam's **primary** target is `judgeBatch` (`BATCH_SYSTEM`, the `modelFor("group")` model,
`BatchSchema`) — the production decision engine (§7.1). Exposing the pair judge is for the diagnostic
table only.

**NOT IMPLEMENTED in this round.** This revision is documentation only: no export was added, no wrapper
was written, no harness exists. The seam is recorded here as an approved design constraint for the
implementation phase, so that the implementation cannot quietly widen it.

## 10. Baseline variants and ablation

**PROPOSED**

| variant | what it is | what it isolates |
|---|---|---|
| **B0** | current production grouping, exactly as-is: recall → batch judge → `confirmMerge` → deterministic rules, run over a scratch database seeded in ingestion order | the baseline the phase must report (stage A + stage B + stage C) |
| **B1** | **oracle candidate set**: the frozen gold candidate set of §7.3 is handed to the **production batch judge**, bypassing recall | recall loss — the difference between B1 and B0 on the batch judge's matrix is attributable to recall alone |
| **B2** *(optional)* | recall branch comparison: embedding branch (pre-seeded vectors) vs lexical fallback | the recall *policy*, free and deterministic; only worth running if B1 shows recall is the bottleneck |

Both baseline sets are **recorded**: B0 records the set production recall returned (and it comes from
`grouping_decisions.candidates`, §8.1), B1 uses the frozen set from the gold. That is the one place the
two runs legitimately differ — everywhere else the same cases, the same candidate order and the same
settings are used, so the difference is attributable.

The **pair judge is not a baseline**: it is a diagnostic on the subset where production calls it (§8.2),
and it is never reported as an alternative primary classifier.

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
- and, specifically for this revision round: **no production grouping source modification at all**
  (`packages/backend/src/events/*`) — not even the approved evaluation seam of §9.1 was added — and no
  benchmark data and no harness.
- **No grouping result may be optimised toward the benchmark once it is built.** The Migration Spec's
  gate is one-directional: the report may lead to a later, separately-scoped prompt or recall change; the
  benchmark may not be tuned to make a change look good.

The list above constrains changes to **grouping behaviour**. It does not forbid building the benchmark:
once this design passes review, the schema, the validator, the §9.1 evaluation seam, the offline harness,
the fixture tests and the **development** candidate construction may all proceed — none of them changes
what production does, and none of them needs paid authorization (§12.2).

Migration Spec §11 states the gate directly: *只有此报告证明有问题，才允许改 grouping prompt/recall。*

---

## 12. Owner decisions

### 12.1 Settled (these are now constraints, not questions)

| decision | effect on this design |
|---|---|
| **240 total / 180 development / 60 holdout** | §7.5's fixed allocation table |
| **Signal relations do not enter the primary benchmark** | §4.8; the signal verdicts are reported as `0` in stage C |
| **A minimal non-runtime evaluation seam is allowed, targeting the production batch judge** | §9.1 — the seam may expose `judgeBatch`, and may **not** touch prompts, models, thresholds or routing |
| **No paid evaluation is authorized yet** | the relation and end-to-end stages cannot be run; only the free recall stage could be. No run is scheduled by this document |
| **All 60 holdout cases must be human-adjudicated** | `annotation.humanAdjudicated = true` on every holdout case, asserted by the harness (§7.6 rule 4) and printed in the report |
| **Development may be model-proposed / model-reviewed, but disputed or low-confidence `SAME_OCCURRENCE` vs `SAME_STORY` cases must be human-adjudicated** | §7.7 steps 1–2 |
| **Non-human development labels must never be called human gold** | §7.7 step 3; the report prints the `labelSource` breakdown for the split it ran |

### 12.2 Still open — and exactly what each item blocks

**Neither open item blocks benchmark implementation.** Each blocks one specific *execution* step. The
earlier revisions of this document said these "block implementation", which was wrong and is corrected
here:

| open item | blocks | does **not** block |
|---|---|---|
| **Who adjudicates the holdout, and when** — no adjudicator is assigned yet | **holdout finalization / freeze**: the 60 holdout cases cannot be frozen until every decisive holdout candidate label is human-adjudicated (§7.7 step 2) | schema implementation · the validator · the evaluation seam · the offline harness · fixture tests · **development candidate construction** · development annotation |
| **Paid model authorization** — none granted | **paid baseline execution**: the relation (`judgeBatch`) and end-to-end stages call paid models, so no scored run can happen | all of the above, plus the **free recall stage** (zero model calls) and the rest of §9's plumbing |

So the order is: design review → **implementation can start immediately** (schema, validator, seam,
offline harness, fixture tests, development construction) → holdout freeze once an adjudicator exists →
paid scoring once authorization exists. The two blockers gate *when the benchmark can be scored*, not
whether it can be **built**.

Two further items are implementation-time choices the design constrains but deliberately does not
pre-empt:

1. **Which recall branch the recall stage targets.** With no paid authorization this environment can only
   measure the **lexical** branch; the **embedding** branch needs an authorized paid embedding pass or a
   replay of real vectors. §8.1 requires the stage to *report which branch ran*, so a lexical-only number
   is never presented as the production recall figure.
2. **Whether a local embedding endpoint may be used as a test double.** A local `bge`-style endpoint runs
   in this environment, but it is **not** the production embedding model, its API compatibility is
   **unverified**, and a result through it would be a test double rather than a measurement. If it is ever
   used, `meta` must say so.
3. **The concrete distractor settings** — how many distractors per case and which seed — since the batch
   answer depends on the set (§7.1). They must be frozen and recorded in `meta`; the values are chosen
   with the implementation.

---

## 13. Verification

**REPO_VERIFIED** — the audit round and both correction rounds changed documentation only.

```text
git diff --check   → clean, exit 0
npm run typecheck  → pass, exit 0
```

No TypeScript was modified in any round, so the two grouping suites were run in the **audit** round as
baseline evidence — they are the only current evidence that the grouping pipeline behaves as documented.
They are **not** re-run by this revision, which touched no code:

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

This correction round fixes the **contract** details an implementation would otherwise get wrong:

- annotation provenance is **candidate-level**, so a case-level flag can no longer cover labels that were
  never separately adjudicated, and the holdout rule is per candidate;
- identity (`eventKey` / `storyKey`) and the anti-leakage `splitGroupId` are **per report**, so Stage C
  can express "different event, same story" and the validator can check relation↔identity consistency;
- the split is assigned **globally at `splitGroupId` level during construction and frozen**; the harness
  only validates, and a quota is never met by splitting a leakage group;
- the benchmark is **time-rebased in the fixture** (`evaluationTimeAnchor` + `discoveryTimeShift`,
  `backfill = false`, interval-preserving) so it does not expire after 14 days and is not short-circuited
  by `isHistorical()`;
- `literal-same-url-duplicate` left the primary set — the repo folds identical URLs into one article
  before grouping ever runs — and its 16 cases went to two procurement/policy strata;
- the frozen benchmark is **decisive-only**, because an unsettled candidate in a batch prompt can change
  the answers for its neighbours;
- the two open owner items block **holdout freeze** and **paid execution**, **not** implementation.

The primary classifier remains the production **batch** judge (`BATCH_SYSTEM`, `modelFor("group")`), with
`PAIR_SYSTEM`/`groupReview` as a diagnostic only; the vocabulary remains exactly the four production
relations; signals remain out of the primary benchmark; SelectBench keeps its accurate description; and
`REPO_VERIFIED` stays distinct from `LOCAL_OBSERVED`.

No benchmark data was generated, no harness was written, no evaluation seam was added, no production
grouping code, threshold or prompt was touched, no paid evaluation was run, and Phase 3 has not started.
