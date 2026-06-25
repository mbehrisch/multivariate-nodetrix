# Pilot analysis

Two steps: export Firestore → CSV, then analyse in R.

## 1. Export (`export_firestore.mjs`)

Needs a **service-account key** (the client config in `code/study.js` will not work for server-side reads).

1. Firebase console → Project settings → Service accounts → **Generate new private key**.
2. Save it as `analysis/serviceAccount.json` (git-ignored).
3. Run:

```bash
npm i -D firebase-admin
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/analysis/serviceAccount.json"
node analysis/export_firestore.mjs
```

Produces three files:

- **`study_data.csv`** — one row per `answer_submitted`, with `sv` and `task_type`
  parsed from the `taskId` (`T_{Modality}_{SV}_{TaskType}`), joined to the matching
  `task_start` time, `page_load` (modality/order), and a completion flag.
  Browser-reload duplicates are collapsed to the **last** attempt per `(participant, taskId)`.
- **`study_ratings.csv`** — end-of-study condition ratings (one row per participant × SV).
- **`study_participants.csv`** — one row per participant for the **Prolific approve/reject**
  decision: `completed`, `n_answered`/`missing_tasks` (of 16), `n_correct`/`n_graded`
  (TS4 tasks are ungraded → excluded from accuracy), `accuracy`, `mean_confidence`,
  `total_time_min`, `median_rt_s`, `max_rt_s` + `slowest_task` (spot who got stuck on one
  question), and `n_fast_answers` (answers under `FAST_RT_MS`, default 2 s — spot clickers).
  The same table is also printed to the console via `console.table`.

Test/preview PIDs are dropped from all three outputs via `EXCLUDE_PIDS` (edit it at the
top of the script to add your own test PIDs).

> Reading the summary for approve/reject: **incomplete** (`completed=false`, high
> `missing_tasks`) or many `n_fast_answers` with chance-level `accuracy` are legitimate
> reasons to reject. A high `max_rt_s` alone is **not** — someone slow on one question
> still did the work; approve them and exclude that trial in analysis if needed.

## 2. Analyse (`analyze.R`)

```bash
Rscript analysis/analyze.R
```

Outputs summaries and figures to `analysis/output/`.

**Defaults reflect the pilot design** (1 trial per sv×task_type cell): no within-cell
trimming, RT floor 1 s, RT kept for correct *and* incorrect trials, primary tests
Friedman + Wilcoxon (Holm) with bootstrap CIs; RM-ANOVA secondary; 2-way ANOVA and
binomial GLMM auto-run only once N ≥ 25.

### Running it from RStudio

Open `analysis/analyze.R` in RStudio and **Source** it (Ctrl/Cmd+Shift+S), or run
line-by-line. The script `setwd()`s to the `analysis/` folder itself, so it works
regardless of your RStudio working directory. To analyse a different file from the
console, set the env var before sourcing: `Sys.setenv(STUDY_CSV = "study_data_synthetic.csv")`.
Re-run after **every** change to the `CFG` block (no need to re-export — that's only
needed when the Firestore data changes).

### The `CFG` knobs (top of `analyze.R`) — what each does

| Setting | Effect |
|---|---|
| `csv` / `ratings_csv` | Input files. Overridable via the `STUDY_CSV` / `STUDY_RATINGS_CSV` env vars. |
| `exclude_preview` | Drop local `PREVIEW` sessions. Keep `TRUE` for real analysis. |
| `require_complete` | `TRUE` = keep only finishers (16 tasks **and** completed). `FALSE` = keep everyone, including drop-outs. |
| `n_expected_tasks` | Tasks a complete session must have (16 = 4 SV × 4 task types). |
| `recovered_complete` | PIDs counted as completed despite a lost `study_complete` write (redirect race condition). They must still have all 16 tasks. **Set to `character(0)` for a sensitivity run** (drops them → see if effects hold), then restore. |
| `rt_floor_ms` | Answers faster than this (default 1000 ms) are dropped from the **RT** analysis only (still count for accuracy). |
| `rt_ceiling_ms` | `NA` = no upper cap. Set e.g. `120000` to drop trials over 2 min from RT. |
| `chance_exclude` | `TRUE` = drop participants at/below chance accuracy (MC tasks). `FALSE` = only flag them. |
| `glmm_min_n` / `twoway_min_n` | The binomial GLMM and 2-way RM-ANOVA auto-run only at/above this N (default 25). |
| `boot_R` | Bootstrap resamples for the CIs (default 2000). |
| `seed` | RNG seed for reproducible bootstrap CIs. |

**To drop a specific participant entirely** (e.g. a bad-faith submission), add their
PID to `EXCLUDE_PIDS` at the top of `export_firestore.mjs` and re-export — that removes
them from all three CSVs consistently, which is cleaner than filtering in R.

## Interpreting the output

Everything is written to `analysis/output/` (figures + summary CSVs); the full
statistical detail is printed to the **console**, so read it there (or in RStudio).

**Console, top to bottom:**

- `Loaded N trials, K participant(s)` / `Dropped (incomplete): ...` / `Analysis N = ...`
  — the cleaning log. `Analysis N` is the set entering the tests.
- **Friedman test** (primary, per DV): `chi-squared`, `df`, `p-value`, then
  `Kendall's W` (effect size: ~.1 small, ~.3 medium, ~.5 large). Significant *p*
  means the four encodings differ on that measure.
  - The `(n=...)` in the header is the number of participants **in that specific
    test**. It can be **lower than `Analysis N`**: a participant missing a value in
    any one condition is dropped from that test (Friedman needs complete blocks).
    Report this per-test `n`, not the global N. (e.g. confidence often runs on a
    slightly smaller n than accuracy.)
  - **Pairwise comparisons** below it = Wilcoxon signed-rank, Holm-corrected.
    Read which condition pairs differ. On accuracy these are *approximate* (the
    {0,.25,.5,.75,1} values produce many ties → normal approximation).
- **RM-ANOVA** (secondary): a parametric cross-check. Look at the `sv` row F/`Pr(>F)`
  and `partial eta^2`. Agreement with Friedman strengthens the conclusion.
- **2-way RM-ANOVA** (`sv * task_type`, runs at N ≥ 25): the `sv:task_type` row tests
  whether the encoding effect depends on task type.
- **GLMM** (`is_correct ~ sv + (1|participant)`, runs at N ≥ 25): the principled
  binary model. Check the fixed-effect estimates and the `emmeans` back-transformed
  per-condition probabilities. **Glance for a `boundary (singular) fit` or
  convergence warning** — if present, treat the GLMM as unreliable for this N.
- **Mean confidence by correctness** — a calibration check (confidence should be
  higher on correct trials).

**Summary CSVs** (`summary_accuracy.csv`, `summary_rt.csv`, `summary_confidence.csv`,
`summary_rating_*.csv`): per-condition `mean`, `median`, `se`, and bootstrap CI
(`ci_lo`/`ci_hi`). Use these for results tables.

**Figures**: the two **thesis-ready combined panels** are `objective_by_sv.png`
(a: accuracy mean+CI, b: response time) and `subjective_by_sv.png` (a: confidence,
b: readability & preference) — these need the `patchwork` package
(`install.packages("patchwork")`; the script skips them gracefully if absent).
The individual plots are also written: `accuracy_by_sv.png` (mean + 95% bootstrap
CI point-range — *not* a boxplot, since the {0,.25,.5,.75,1} values make a boxplot
degenerate), `rt_by_sv.png`, `confidence_by_sv.png`, `ratings_by_sv.png`, plus
`accuracy_spaghetti.png` (per-participant lines), `interaction_rt.png`
(encoding × task type), `rt_by_correctness.png`, and `rt_validation.png`
(logged vs derived RT sanity check).

**Two interpretation caveats baked into the data:**

- **RT includes the confidence rating.** `responseTimeMs` runs from task render to
  Submit, and the confidence buttons sit in the same panel, so RT is "time per trial
  incl. rating", not pure solving time. It is comparable across conditions, but adjust
  absolute-RT wording.
- For reproducible bootstrap CIs, **Source the whole script once** rather than running
  blocks out of order (the seed is set once at the top).

## Dry-run with synthetic data (`gen_synthetic.mjs`)

Before any real participant exists, generate fake-but-realistic data (planted
encoding effect, per-participant variation, plus a couple of incomplete /
below-chance / fast-guess cases to exercise the cleaning paths):

```bash
node analysis/gen_synthetic.mjs                                  # → analysis/study_data_synthetic.csv
STUDY_CSV=analysis/study_data_synthetic.csv Rscript analysis/analyze.R
```

`analyze.R` reads `STUDY_CSV` (env var) if set, else `CFG$csv`. Tune N and the messy-case
counts in the `CFG` block of `gen_synthetic.mjs`.

The optional binomial GLMM needs `lme4` (`install.packages("lme4")`); it auto-skips if absent.

With only real `PREVIEW` data you have 1 participant, so group-level stats can't run, but
the **export** and CSV shape are testable (set `exclude_preview = FALSE` in `CFG`).
