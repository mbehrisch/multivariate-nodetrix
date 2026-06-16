// ============================================================
//  gen_synthetic.mjs — fake but realistic pilot data for dry-running analyze.R
//
//  Writes analysis/study_data_synthetic.csv in the EXACT column shape produced by
//  export_firestore.mjs, so you can exercise the whole R pipeline before any real
//  participant exists. The data carries a planted effect (richer encoding → higher
//  accuracy, faster RT) plus per-participant variation, and optionally injects a
//  few "messy" participants to exercise the cleaning/exclusion paths.
//
//  Usage:
//    node analysis/gen_synthetic.mjs
//    STUDY_CSV=analysis/study_data_synthetic.csv Rscript analysis/analyze.R
// ============================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Config ────────────────────────────────────────────────────
const CFG = {
  out:            fileURLToPath(new URL('./study_data_synthetic.csv', import.meta.url)),
  outRatings:     fileURLToPath(new URL('./study_ratings_synthetic.csv', import.meta.url)),
  nParticipants:  40,   // your Prolific target
  nIncomplete:    2,    // participants who quit early (no study_complete) → should be dropped
  nBelowChance:   1,    // participant guessing randomly → flagged below-chance
  nFastGuessTrials: 5,  // trials below the 1 s RT floor scattered in → flagged & removed from RT
  seed:           7,
};

const SV_LEVELS   = ['SV0', 'SV1', 'SV2', 'SV3'];
const TYPE_LEVELS = ['TE1', 'TS4', 'TB1', 'TA2'];
const LATIN = { 1: ['SV0','SV1','SV2','SV3'], 2: ['SV1','SV2','SV3','SV0'],
                3: ['SV2','SV3','SV0','SV1'], 4: ['SV3','SV0','SV1','SV2'] };
const MC_TYPES = new Set(['TE1', 'TA2']);                 // multiple-choice
const MC_OPTIONS = { TE1: ['France','China','Germany','Other'], TA2: ['1','2','3','4'] };
const NODE_ANSWERS = { TS4: ['BOD','LYS','NCE'], TB1: ['BRU','LYS','NTE','ATL'] };

// Planted effects -------------------------------------------------
// Accuracy on the logit scale: base + sv + task_type + participant intercept.
const ACC_BASE   = 0.4;                                    // logit(~0.6)
const ACC_SV     = { SV0: 0.0, SV1: 0.6, SV2: 0.7, SV3: 1.4 };
const ACC_TYPE   = { TE1: 0.0, TS4: -0.3, TB1: -0.5, TA2: 0.1 };
// RT (ms): base * exp(participant) * sv_factor * type_factor * lognormal noise.
const RT_BASE    = 9000;
const RT_SV      = { SV0: 1.40, SV1: 1.05, SV2: 1.00, SV3: 0.85 };
const RT_TYPE    = { TE1: 1.0, TS4: 1.3, TB1: 1.4, TA2: 0.9 };

// ── Tiny seeded RNG (mulberry32) + Gaussian ──────────────────
let _s = CFG.seed >>> 0;
const rand = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (mu = 0, sd = 1) =>
  mu + sd * Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
const plogis = x => 1 / (1 + Math.exp(-x));
const pick = arr => arr[Math.floor(rand() * arr.length)];

// ── Build rows ────────────────────────────────────────────────
const rows = [];
const ratingRows = [];   // end-of-study condition ratings (completers only)
let fastGuessLeft = CFG.nFastGuessTrials;
// Planted mean readability/preference per encoding (richer → higher)
const RATE_SV = { SV0: 2.4, SV1: 3.6, SV2: 3.4, SV3: 4.3 };
const t0 = Date.now() - 1000 * 60 * 60 * 24; // ~yesterday

for (let p = 1; p <= CFG.nParticipants; p++) {
  const pid        = `P${String(p).padStart(3, '0')}`;
  const order      = ((p - 1) % 4) + 1;            // even spread over the 4 Latin orders
  const accU       = gauss(0, 0.5);                // participant accuracy intercept
  const rtU        = gauss(0, 0.15);               // participant RT intercept (multiplicative)
  const rateU      = gauss(0, 0.5);                // participant subjective-rating intercept
  const incomplete = p <= CFG.nIncomplete;
  const belowChance = p > CFG.nIncomplete && p <= CFG.nIncomplete + CFG.nBelowChance;

  let clock = t0 + p * 1000 * 60 * 7;              // each participant a bit later
  const svSeq = LATIN[order];
  let taskCounter = 0;

  for (const sv of svSeq) {
    for (const type of TYPE_LEVELS) {
      taskCounter++;
      // Simulate quitting early: incomplete participants stop after 8 tasks
      if (incomplete && taskCounter > 8) continue;

      const isMC = MC_TYPES.has(type);
      // Accuracy
      let pCorrect = belowChance
        ? 0.25                                         // random guessing
        : plogis(ACC_BASE + ACC_SV[sv] + ACC_TYPE[type] + accU);
      const correct = rand() < pCorrect;

      // RT (ms): planted effect + noise, floored at 1500 ms normally
      let rt = RT_BASE * Math.exp(rtU) * RT_SV[sv] * RT_TYPE[type] * Math.exp(gauss(0, 0.25));
      rt = Math.max(1500, Math.round(rt));
      // Inject a few impossible fast-guesses to exercise the floor filter
      if (fastGuessLeft > 0 && rand() < 0.03) { rt = 300 + Math.round(rand() * 400); fastGuessLeft--; }

      const startMs = clock;
      const ansMs   = startMs + rt;
      clock = ansMs + 1500 + Math.round(rand() * 2500);  // gap to next task

      const selected = isMC
        ? (correct ? MC_OPTIONS[type][0] : pick(MC_OPTIONS[type].slice(1)))
        : NODE_ANSWERS[type].join('|');

      // Confidence (1–5): higher when correct and with richer encodings.
      const confBump = { SV0: -0.4, SV1: 0.2, SV2: 0.2, SV3: 0.5 }[sv];
      let confidence = (correct ? 4.0 : 2.5) + confBump + (belowChance ? -0.8 : 0) + gauss(0, 0.8);
      confidence = Math.max(1, Math.min(5, Math.round(confidence)));

      rows.push({
        participant:    pid,
        order,
        modality:       'categorical',
        sv,
        task_type:      type,
        task_id:        `T_Cat_${sv}_${type}`,
        answer_type:    isMC ? 'multiple-choice' : 'select-nodes',
        selected_answer: selected,
        is_correct:     correct ? 'TRUE' : 'FALSE',
        confidence,
        rt_logged_ms:   rt,
        rt_derived_ms:  rt + Math.round(gauss(0, 40)),     // ~matches logged (tests cross-check)
        n_highlights:   Math.round(2 + rand() * 6),
        task_start_iso: new Date(startMs).toISOString(),
        answer_iso:     new Date(ansMs).toISOString(),
        completed:      incomplete ? 'false' : 'true',
      });
    }
  }

  // End-of-study condition ratings — only completers submit these.
  if (!incomplete) {
    const clampR = x => Math.max(1, Math.min(5, Math.round(x)));
    for (const sv of SV_LEVELS) {
      ratingRows.push({
        participant: pid,
        modality:    'categorical',
        sv,
        readability: clampR(RATE_SV[sv] + rateU + gauss(0, 0.6)),
        preference:  clampR(RATE_SV[sv] * 0.95 + rateU + gauss(0, 0.6)),
      });
    }
  }
}

// ── Write CSV ─────────────────────────────────────────────────
const csvCell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = Object.keys(rows[0]);
const csv = [header.join(',')]
  .concat(rows.map(r => header.map(h => csvCell(r[h])).join(',')))
  .join('\n');
writeFileSync(CFG.out, csv + '\n', 'utf8');
console.log(`Wrote ${rows.length} rows for ${CFG.nParticipants} participants → ${CFG.out}`);
console.log(`  ${CFG.nIncomplete} incomplete, ${CFG.nBelowChance} below-chance, ` +
            `${CFG.nFastGuessTrials - fastGuessLeft} fast-guess trials injected.`);

// Second file: condition ratings (matches export_firestore.mjs → study_ratings.csv)
const rHeader = ['participant', 'modality', 'sv', 'readability', 'preference'];
const rCsv = [rHeader.join(',')]
  .concat(ratingRows.map(r => rHeader.map(h => csvCell(r[h])).join(',')))
  .join('\n');
writeFileSync(CFG.outRatings, rCsv + '\n', 'utf8');
console.log(`Wrote ${ratingRows.length} condition-rating rows → ${CFG.outRatings}`);
