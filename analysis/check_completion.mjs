// ============================================================
//  check_completion.mjs — read-only diagnostic
//
//  Scans every event document at sessions/{pid}/events and, per participant,
//  reports whether condition_ratings and study_complete were written. Tells us
//  whether the "missing final writes" issue is structural or a one-off.
//
//  Usage:
//    GOOGLE_APPLICATION_CREDENTIALS=analysis/serviceAccount.json node analysis/check_completion.mjs
// ============================================================

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || new URL('./serviceAccount.json', import.meta.url);
const EXCLUDE  = new Set(['PREVIEW', 'UNKNOWN', 'TESTPID1', 'balancetest01']);

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) });
const db = getFirestore();

const snap = await db.collectionGroup('events').get();
console.log(`Scanned ${snap.size} event documents.\n`);

// pid -> Set of event names + counts
const byPid = new Map();
snap.forEach(doc => {
    const ev  = doc.data();
    const pid = ev.prolificPid ?? 'UNKNOWN';
    if (!byPid.has(pid)) byPid.set(pid, { events: [], answers: 0 });
    const rec = byPid.get(pid);
    rec.events.push(ev.event);
    if (ev.event === 'answer_submitted') rec.answers++;
});

const rows = [];
for (const [pid, rec] of byPid) {
    if (EXCLUDE.has(pid)) continue;
    const set = new Set(rec.events);
    rows.push({
        participant:  pid,
        n_answers:    rec.answers,
        page_load:    set.has('page_load'),
        ratings:      set.has('condition_ratings'),
        complete:     set.has('study_complete'),
    });
}
rows.sort((a, b) => String(a.participant).localeCompare(String(b.participant)));

// Treat anyone who actually started answering as a "participant" for the scope check.
const participants  = rows.filter(r => r.n_answers > 0 || r.page_load);
const missRatings   = participants.filter(r => !r.ratings);
const missComplete  = participants.filter(r => !r.complete);
const missBoth      = participants.filter(r => !r.ratings && !r.complete);
const missOnlyOne   = participants.filter(r => (!r.ratings) !== (!r.complete));

console.log(`Participants (have answers or page_load): ${participants.length}`);
console.log(`  missing condition_ratings : ${missRatings.length}`);
console.log(`  missing study_complete    : ${missComplete.length}`);
console.log(`  missing BOTH              : ${missBoth.length}`);
console.log(`  missing EXACTLY ONE       : ${missOnlyOne.length}`);

const ids = arr => arr.map(r => `${r.participant}(ans=${r.n_answers})`).join(', ') || '—';
console.log(`\nIDs missing condition_ratings:\n  ${ids(missRatings)}`);
console.log(`\nIDs missing study_complete:\n  ${ids(missComplete)}`);
console.log(`\nIDs missing BOTH:\n  ${ids(missBoth)}`);

console.log('\nFull per-participant table:');
console.table(rows);

process.exit(0);
