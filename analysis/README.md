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

Produces `analysis/study_data.csv` — one row per `answer_submitted`, with `sv` and
`task_type` parsed from the `taskId` (`T_{Modality}_{SV}_{TaskType}`), joined to the
matching `task_start` time, `page_load` (modality/order), and a completion flag.
Browser-reload duplicates are collapsed to the **last** attempt per `(participant, taskId)`.

## 2. Analyse (`analyze.R`)

```bash
Rscript analysis/analyze.R
```

Edit the `CFG` block at the top to set the RT floor, exclusion rules, and the
N thresholds that gate the optional 2-way ANOVA / GLMM. Outputs summaries and
figures to `analysis/output/`.

**Defaults reflect the pilot design** (1 trial per sv×task_type cell): no within-cell
trimming, RT floor 1 s, RT kept for correct *and* incorrect trials, primary tests
Friedman + Wilcoxon (Holm) with bootstrap CIs; RM-ANOVA secondary; 2-way ANOVA and
binomial GLMM auto-run only once N ≥ 25.

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
