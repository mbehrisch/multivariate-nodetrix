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
