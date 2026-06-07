// ============================================================
//  study.js — Participant-facing study interface controller
//
//  Architecture note
//  -----------------
//  Importing from main.js triggers its module evaluation:
//    • the <svg> is created inside #graph
//    • globals (appState, svg, …) are exported
//    • an async fetch for sampled_data.json is started
//
//  We set appState.visualizationMode = 'nodeLink' synchronously
//  so that when main.js's fetch resolves and calls
//  buildEverything(), it uses the node-link path instead of the
//  full NodeTrix path.  We then wait for appState.graph to be
//  populated, clear the canvas, and rebuild cleanly for the study.
// ============================================================

// ── Prolific completion URL (replace before going live) ──────
const COMPLETION_URL = 'REPLACE_WITH_PROLIFIC_URL';

// ── Imports ──────────────────────────────────────────────────
import { appState, svg, datasetSpec } from './main.js';
import { buildNodeLinkOnly }          from './building/nl-builder.js';
import { applyForceLayout }           from './building/force-layout.js';
import { setSimulationState }         from './utils.js';

import {
    applyCategoricalColouring,
    applyCategoricalDashing,
    categoricalColorMap,
    categoricalDashMap,
} from './multivariate/categorical-edge.js';

import {
    applyNumericalColouring,
    applyNumericalThickness,
    defineNumericalMapping,
} from './multivariate/numerical-edge.js';

import {
    applyDirectionalGradient,
    applyDirectionalTaper,
    applyDirectionalArrows,
} from './multivariate/directional-edge.js';

import {
    applyEdgeTooltip,
    resetEdgeTooltip,
} from './multivariate/baseline-edge.js';

// ── Firebase ──────────────────────────────────────────────────
import { initializeApp }                        from 'firebase/app';
import { getFirestore, collection, addDoc }     from 'firebase/firestore';

// ── Synchronous setup (before main.js's fetch resolves) ──────
appState.visualizationMode = 'nodeLink';  // keeps buildEverything() in NL-only mode
svg.attr('id', 'study-svg');              // give the SVG the spec'd id

// ── URL parameters ────────────────────────────────────────────
const _p         = new URLSearchParams(window.location.search);
const prolificPid = _p.get('PROLIFIC_PID') || 'PREVIEW';
const studyId     = _p.get('STUDY_ID')     || 'PREVIEW';
const sessionId   = _p.get('SESSION_ID')   || 'PREVIEW';
const condition   = _p.get('condition')    || 'categorical';
// Latin-Square order: 1, 2, 3, or 4.  Defaults to 1 for local testing.
const order       = _p.get('order')        || '1';

const sessionData = {
    prolificPid,
    studyId,
    sessionId,
    condition,
    order,
    startTime: Date.now(),
};

// ── Encoding defaults (used when a task omits "encodings") ───
// Each key matches a task's "condition" value.
// The values list every encoding that is ON by default for that condition.
// "baseline" encoding = edge-hover tooltip (works with any condition).
const DEFAULT_ENCODINGS = {
    baseline:    ['baseline'],
    categorical: ['color', 'dashing'],
    numerical:   ['color', 'thickness'],
    directional: ['gradient', 'taper', 'arrows'],
};

// Return the active encoding list for a task.
// Falls back to DEFAULT_ENCODINGS if the task has no "encodings" field.
function getEncodings(task) {
    return task.encodings || DEFAULT_ENCODINGS[task.condition] || [];
}

// Return the edge-tooltip fields for the current task.
// Checks task.tooltipFields first so any task can override the default.
// Falls back to condition-derived defaults so tasks.json stays lean:
//   directional  → ['route']               (only source → target header)
//   categorical  → ['route', 'country']
//   numerical    → ['route', 'distance']
//   baseline     → ['all']
function getTooltipFields(task) {
    if (task.tooltipFields) return task.tooltipFields;
    switch (task.condition) {
        case 'directional':  return ['route'];
        case 'categorical':  return ['route', 'country'];
        case 'numerical':    return ['route', 'distance'];
        default:             return ['all'];
    }
}

// ── Mutable state ─────────────────────────────────────────────
let tasks            = [];
let currentTaskIndex = 0;
let taskStartTime    = null;
let selectedAnswer   = null;    // IATA string or MC option text (single-select tasks)
let selectedAnswers  = [];      // IATA array for select-nodes tasks
let activeCondition  = null;    // condition currently rendered on the canvas
let activeEncodings  = null;    // serialised encoding list for change-detection
let activeFilter     = null;    // serialised filter spec for change-detection

// ── Firebase initialisation ───────────────────────────────────
const firebaseConfig = {
    apiKey:            'AIzaSyBZxE7j3daMk405fI-HxfaGDCvZS2V-wyU',
    authDomain:        'edge-encoding-study.firebaseapp.com',
    projectId:         'edge-encoding-study',
    storageBucket:     'edge-encoding-study.firebasestorage.app',
    messagingSenderId: '382157431323',
    appId:             '1:382157431323:web:ddd6f62e9344f99bc10ebe',
};
const _firebaseApp = initializeApp(firebaseConfig);
const db           = getFirestore(_firebaseApp);

// ── Logging ───────────────────────────────────────────────────
// Schrijft elk event naar Firestore onder sessions/{prolificPid}/events.
// Mislukte writes gaan naar console.warn — de studie gaat door.
async function logEvent(eventName, data) {
    const payload = {
        event:      eventName,
        prolificPid,
        studyId,
        sessionId,
        order,
        ...data,
        serverTime: new Date().toISOString(),
    };
    console.log('[STUDY]', eventName, payload);   // altijd zichtbaar in DevTools

    try {
        await addDoc(collection(db, 'sessions', prolificPid, 'events'), payload);
    } catch (err) {
        console.warn('[STUDY] Firestore write failed:', err);
    }
}

// ── Wait for main.js to populate appState.graph ───────────────
// main.js loads sampled_data.json asynchronously; we poll via
// requestAnimationFrame so we don't block the browser.
function waitForGraph() {
    return new Promise(resolve => {
        const poll = () => (appState.graph ? resolve() : requestAnimationFrame(poll));
        requestAnimationFrame(poll);
    });
}

// ============================================================
//  Main async initialiser
// ============================================================
async function init() {
    logEvent('page_load', {
        prolificPid: sessionData.prolificPid,
        order:       sessionData.order,   // Latin-Square order (1–4)
        timestamp:   new Date().toISOString(),
    });

    // Load all tasks and wait for the graph in parallel
    const [tasksData] = await Promise.all([
        fetch('data/tasks.json').then(r => r.json()),
        waitForGraph(),
    ]);

    // Select the task list for this participant's Latin-Square order.
    // Falls back to order 1 if the URL parameter is missing or invalid.
    tasks = tasksData.orders?.[order]?.tasks
         ?? tasksData.orders?.['1']?.tasks
         ?? [];

    // ── Save original graph once so filters always start from full data ──
    appState._baseGraph = appState.graph;

    // ── Clear whatever main.js rendered ───────────────────────
    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    // ── Wire up node-selection events from nl-builder.js ─────
    document.addEventListener('study:nodeSelected', onNodeSelected);

    // ── Start task flow (showTask handles first build) ────────
    if (tasks.length > 0) {
        showTask(0);
    } else {
        document.getElementById('task-description').textContent =
            'No tasks found in tasks.json.';
    }
}

// ============================================================
//  Edge encoding dispatcher
// ============================================================
// encodings is an array of string keys, e.g. ['color', 'dashing'].
// Only the listed encodings are applied; the rest are skipped.
// thresholds is an optional array of { value, direction, label } objects from
// the task definition.  Only the numerical legend uses them; other conditions
// ignore the parameter safely.
// tooltipFields controls which attributes appear in edge-hover tooltips when
// "baseline" is in encodings.  Derived by getTooltipFields(task) from the task's
// condition (or overridden per-task via task.tooltipFields in tasks.json).
function applyConditionEncoding(cond, encodings, thresholds = [], tooltipFields = ['all']) {
    const active = new Set(encodings);

    if (cond === 'baseline') {
        // No edge encoding — clear any legend left over from a previous task
        document.getElementById('study-legend').innerHTML =
            '<p class="panel-label" style="color:#999;font-style:italic;">No edge encoding active</p>';

    } else if (cond === 'categorical') {
        if (active.has('color'))   applyCategoricalColouring(datasetSpec.categoricalVar);
        if (active.has('dashing')) applyCategoricalDashing(datasetSpec.categoricalVar);
        renderCategoricalLegend(encodings);

    } else if (cond === 'numerical') {
        if (active.has('color'))     applyNumericalColouring();
        if (active.has('thickness')) applyNumericalThickness();
        renderNumericalLegend(encodings, thresholds);

    } else if (cond === 'directional') {
        if (active.has('gradient')) applyDirectionalGradient();
        if (active.has('taper'))    applyDirectionalTaper();
        if (active.has('arrows'))   applyDirectionalArrows();
        renderDirectionalLegend(encodings);
    }

    // ── Cross-cutting: "baseline" encoding adds edge-hover tooltips ──────────
    // Works alongside any condition — just include "baseline" in the encodings
    // array for the task.  Distinct from the "baseline" condition (SV0), which
    // controls which visual encoding is applied to the edges.
    if (active.has('baseline')) applyEdgeTooltip(tooltipFields);
}

// ── Dataset filter ────────────────────────────────────────────
// Returns either the original graph or a filtered copy, depending on the
// filter spec attached to the task.  The original graph is never mutated.
//
// Supported filter types:
//
//   { "type": "deduplicate" }
//     Reduces a dense bidirectional multigraph to at most one edge per
//     unordered node pair (keeps the first edge encountered per pair in
//     graphology insertion order, which preserves that edge's source/target
//     direction in the visualisation).  Reduces 1 227 → 205 edges for the
//     default dataset, making directional encodings unambiguous.
//
function applyTaskFilter(graph, filter) {
    if (!filter) return graph;

    if (filter.type === 'deduplicate') {
        const g = graph.copy();
        const seen      = new Set();
        const toRemove  = [];

        g.forEachEdge((key, _attrs, source, target) => {
            // Canonical pair key — smaller string ID first so A→B and B→A
            // map to the same entry regardless of iteration direction.
            const pair = source < target
                ? `${source}|${target}`
                : `${target}|${source}`;

            if (seen.has(pair)) {
                toRemove.push(key);   // duplicate direction or parallel edge
            } else {
                seen.add(pair);       // first occurrence: keep it
            }
        });

        toRemove.forEach(k => g.dropEdge(k));
        return g;
    }

    // Unknown filter type — fall back to full graph
    console.warn('[study] Unknown filter type:', filter.type);
    return graph;
}

// Study-specific layout constants (override the defaults from main.js / force-layout.js)
const STUDY_NODE_R       = 15;   // visual radius; main.js nodeSize = 10
const STUDY_CHARGE       = -250; // stronger repulsion → better spread
const STUDY_LINK_DIST    = 70;   // longer edges → nodes further apart

// ── Tear down the canvas and rebuild for a specific task ─────
function rebuildForTask(task) {
    const encodings = getEncodings(task);

    // Apply dataset filter (always derived from the saved original graph so
    // successive tasks don't chain-filter an already-filtered graph).
    appState.graph = applyTaskFilter(appState._baseGraph, task.filter ?? null);

    if (appState.sim) appState.sim.stop();
    svg.selectAll('*').remove();

    const { nodes, links } = buildNodeLinkOnly();
    applyForceLayout(nodes, links);

    // ── Study-specific node size ──────────────────────────────────
    // Overwrite the radius that nl-builder set to nodeSize (10 px).
    // We also store it in appState so directional-edge.js can use the
    // correct value when placing arrowheads at the node circumference.
    appState.studyNodeR = STUDY_NODE_R;
    svg.selectAll('.node')
        .each(d => { d.r = STUDY_NODE_R; })
        .attr('r', STUDY_NODE_R)
        // ── Disable node-hover tooltip (not needed in the study) ──────────────
        // nl-builder.js attaches mouseover/mousemove/mouseleave for node tooltips;
        // null them out so hovering over a node doesn't pop up anything.  Double-
        // click (study:nodeSelected) is still dispatched and handled normally.
        .on('mouseover', null)
        .on('mousemove', null)
        .on('mouseleave', null);

    // Update the running collision force so nodes don't overlap
    if (appState.sim) {
        appState.sim.force('collide').radius(d => d.r + STUDY_NODE_R * 2);
    }

    applyConditionEncoding(task.condition, encodings, task.thresholds ?? [], getTooltipFields(task));

    setSimulationState({
        alphaTarget:    0.01,
        velocityDecay:  0.4,
        chargeStrength: STUDY_CHARGE,
        linkDistance:   STUDY_LINK_DIST,
    });
    setTimeout(() => { if (appState.sim) appState.sim.alphaTarget(0); }, 1500);
}

// ── Find the SVG <circle> element for a given graphology node id ─────────────
function findNodeElement(nodeId) {
    let found = null;
    svg.selectAll('.node').each(function (d) {
        if (d.id === nodeId) found = this;
    });
    return found;
}

// ── Pre-highlight the named starting airport ──────────────────────────────────
// Uses class .node--start (defined in study.html) so the highlight survives
// single-clicks — nl-builder's clearAllHighlights() only removes .node--highlighted.
function highlightStartNode(iata) {
    if (!iata) return;
    // d spreads graph.getNodeAttributes(), so d.IATA is the airport code
    svg.selectAll('.node').each(function (d) {
        if (d.IATA === iata) this.classList.add('node--start');
    });
}

function capitalise(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
//  Task flow
// ============================================================
function showTask(index) {
    currentTaskIndex = index;
    taskStartTime    = Date.now();
    selectedAnswer   = null;
    selectedAnswers  = [];

    const task          = tasks[index];
    const taskEncodings = getEncodings(task);
    // Serialise for cheap comparison (order-insensitive)
    const encodingKey   = [...taskEncodings].sort().join(',');
    const filterKey     = JSON.stringify(task.filter ?? null);

    // ── Rebuild when condition, encodings, OR filter changes ────
    // (also fires on the very first call, when all three are null)
    if (task.condition !== activeCondition ||
        encodingKey    !== activeEncodings ||
        filterKey      !== activeFilter) {
        activeCondition = task.condition;
        activeEncodings = encodingKey;
        activeFilter    = filterKey;
        rebuildForTask(task);
    }

    renderTaskDescription(task);
    renderAnswerArea(task);
    renderProgressBar(index);

    // Clear all highlight classes left by the previous task
    document.querySelectorAll(
        '.node--highlighted, .node--start, .node--answer-selected, .edge--highlighted, .neighbor--highlighted'
    ).forEach(el => el.classList.remove(
        'node--highlighted', 'node--start', 'node--answer-selected',
        'edge--highlighted', 'neighbor--highlighted',
    ));

    // Pre-highlight the named starting airport so participants don't have to search for it
    if (task.startNode) highlightStartNode(task.startNode);

    logEvent('task_start', {
        taskId:          task.id,
        taskDescription: task.description,
        condition:       task.condition,
        timestamp:       new Date().toISOString(),
    });
}

// ── Render task description with colour-highlighted keywords ──
function renderTaskDescription(task) {
    // Escape first so we can safely inject <span> tags
    let html = escapeHtml(task.description);

    (task.colorKeywords || []).forEach(({ word, color }) => {
        const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(
            new RegExp(`(${safe})`, 'gi'),
            `<span style="color:${color};font-weight:600;">$1</span>`,
        );
    });

    document.getElementById('task-description').innerHTML = html;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Render answer area based on task type ─────────────────────
function renderAnswerArea(task) {
    const area = document.getElementById('answer-area');
    area.innerHTML = '';

    if (task.answerType === 'select-node') {
        // Show selected-node label + disabled Submit button.
        // Button is enabled when a node is double-clicked.
        const display      = document.createElement('p');
        display.id         = 'selected-node-display';
        display.textContent = 'Selected: —';

        const btn       = document.createElement('button');
        btn.id          = 'submit-btn';
        btn.textContent = 'Submit';
        btn.disabled    = true;
        btn.className   = 'btn btn-primary w-100 mt-2';
        btn.addEventListener('click', submitAnswer);

        area.appendChild(display);
        area.appendChild(btn);

    } else if (task.answerType === 'select-nodes') {
        // Multi-node selection: participant double-clicks N airports.
        // Submit enables once exactly the required number is chosen;
        // double-clicking a selected node deselects it.
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;

        const display      = document.createElement('p');
        display.id         = 'selected-nodes-display';
        display.textContent = 'Selected: —';

        const hint          = document.createElement('p');
        hint.className      = 'text-muted';
        hint.style.fontSize = '12px';
        hint.style.margin   = '0 0 8px';
        hint.textContent    =
            `Double-click ${required} airport${required !== 1 ? 's' : ''} to answer. ` +
            `Click again to deselect.`;

        const btn       = document.createElement('button');
        btn.id          = 'submit-btn';
        btn.type        = 'button';
        btn.textContent = `Submit (0 / ${required})`;
        btn.disabled    = true;
        btn.className   = 'btn btn-primary w-100 mt-2';
        btn.addEventListener('click', submitAnswer);

        area.appendChild(display);
        area.appendChild(hint);
        area.appendChild(btn);

    } else if (task.answerType === 'multiple-choice') {
        // Render radio buttons then a disabled Submit button.
        // Button is enabled when a radio is selected.
        const form = document.createElement('form');
        form.id    = 'mc-form';

        (task.options || []).forEach((opt, i) => {
            const wrapper      = document.createElement('div');
            wrapper.className  = 'form-check';

            const input       = document.createElement('input');
            input.type        = 'radio';
            input.name        = 'mc-answer';
            input.id          = `mc-opt-${i}`;
            input.value       = opt;
            input.className   = 'form-check-input';
            input.addEventListener('change', () => {
                selectedAnswer = opt;
                const btn = document.getElementById('submit-btn');
                if (btn) btn.disabled = false;
            });

            const lbl       = document.createElement('label');
            lbl.htmlFor     = `mc-opt-${i}`;
            lbl.textContent = opt;
            lbl.className   = 'form-check-label';

            wrapper.appendChild(input);
            wrapper.appendChild(lbl);
            form.appendChild(wrapper);
        });

        const btn       = document.createElement('button');
        btn.id          = 'submit-btn';
        btn.type        = 'button';
        btn.textContent = 'Submit';
        btn.disabled    = true;
        btn.className   = 'btn btn-primary w-100 mt-3';
        btn.addEventListener('click', submitAnswer);

        area.appendChild(form);
        area.appendChild(btn);
    }
}

// ── Progress bar: one coloured segment per task ───────────────
// done = green, current = orange, pending = grey
function renderProgressBar(currentIndex) {
    const bar = document.getElementById('study-progress-bar');
    bar.innerHTML = '';

    tasks.forEach((_, i) => {
        const seg = document.createElement('div');
        seg.className = 'progress-step';
        if      (i < currentIndex)  seg.classList.add('progress-step--done');
        else if (i === currentIndex) seg.classList.add('progress-step--current');
        bar.appendChild(seg);
    });

    // "Task 2 of 4 · Numerical"
    const task = tasks[currentIndex];
    document.getElementById('task-progress').textContent =
        `Task ${currentIndex + 1} of ${tasks.length} · ${capitalise(task.condition)}`;
}

// ============================================================
//  Event handlers
// ============================================================

// Fired by nl-builder.js on double-click
function onNodeSelected(event) {
    const { nodeId, label } = event.detail;
    const task = tasks[currentTaskIndex];
    if (!task) return;

    // ── Multiple-choice: node double-clicks have no effect ───────────────────
    // The answer is selected via radio buttons; clicking nodes must not
    // accidentally enable the Submit button.
    if (task.answerType === 'multiple-choice') return;

    // ── select-nodes: toggle node in / out of the selection set ─────────────
    if (task.answerType === 'select-nodes') {
        const required = task.requiredSelections ?? task.correctAnswers?.length ?? 2;
        const idx      = selectedAnswers.indexOf(label);
        const nodeEl   = findNodeElement(nodeId);

        if (idx >= 0) {
            // Already in the set — remove it
            selectedAnswers.splice(idx, 1);
            if (nodeEl) nodeEl.classList.remove('node--answer-selected');
        } else if (selectedAnswers.length < required) {
            // Still room — add it
            selectedAnswers.push(label);
            if (nodeEl) nodeEl.classList.add('node--answer-selected');
        }
        // At capacity: silently ignore extra clicks (user must deselect first)

        const display = document.getElementById('selected-nodes-display');
        if (display) {
            display.textContent = selectedAnswers.length > 0
                ? `Selected: ${selectedAnswers.join(', ')}`
                : 'Selected: —';
        }
        const btn = document.getElementById('submit-btn');
        if (btn) {
            btn.disabled    = selectedAnswers.length < required;
            btn.textContent = `Submit (${selectedAnswers.length} / ${required})`;
        }

        logEvent('node_highlighted', {
            taskId:           task.id,
            nodeId,
            nodeLabel:        label,
            action:           idx >= 0 ? 'deselected' : 'selected',
            currentSelection: [...selectedAnswers],
            timestamp:        new Date().toISOString(),
        });
        return;
    }

    // ── select-node (default): single selection ──────────────────────────────
    selectedAnswer = label;

    logEvent('node_highlighted', {
        taskId:    task.id,
        nodeId,
        nodeLabel: label,
        timestamp: new Date().toISOString(),
    });

    const display = document.getElementById('selected-node-display');
    if (display) display.textContent = `Selected: ${label}`;

    const btn = document.getElementById('submit-btn');
    if (btn) btn.disabled = false;
}

function submitAnswer() {
    const task           = tasks[currentTaskIndex];
    const responseTimeMs = Date.now() - taskStartTime;

    // Support both a single string ("correctAnswer") and an array
    // ("correctAnswers") so old and new task definitions both work.
    const correctSet = Array.isArray(task.correctAnswers)
        ? task.correctAnswers
        : [task.correctAnswer];

    // select-nodes: every chosen airport must appear in the correct set
    let submittedAnswer;
    let isCorrect;
    if (task.answerType === 'select-nodes') {
        submittedAnswer = [...selectedAnswers];
        isCorrect = selectedAnswers.length > 0
            && selectedAnswers.every(a => correctSet.includes(a));
    } else {
        submittedAnswer = selectedAnswer;
        isCorrect = correctSet.includes(selectedAnswer);
    }

    logEvent('answer_submitted', {
        taskId:         task.id,
        answerType:     task.answerType,
        selectedAnswer: submittedAnswer,
        isCorrect,
        responseTimeMs,
    });

    const nextIndex = currentTaskIndex + 1;

    if (nextIndex < tasks.length) {
        showTask(nextIndex);
    } else {
        // All tasks done → log completion and redirect to Prolific
        logEvent('study_complete', {
            totalTimeMs:    Date.now() - sessionData.startTime,
            tasksCompleted: tasks.length,
            timestamp:      new Date().toISOString(),
        });
        window.location.href = COMPLETION_URL;
    }
}

// ============================================================
//  Legend renderers
// ============================================================

// ── Categorical legend ────────────────────────────────────────
// Shows colour swatches, dash patterns, or both depending on
// which encodings are active for the current task.
function renderCategoricalLegend(encodings) {
    const el         = document.getElementById('study-legend');
    const categories = Object.keys(categoricalColorMap);
    if (!categories.length) { el.innerHTML = ''; return; }

    const showColor  = encodings.includes('color');
    const showDash   = encodings.includes('dashing');

    let html = '<p class="panel-label" style="margin-bottom:6px;">Airline Country of Origin</p>';
    html += '<ul class="study-legend-list">';

    categories.forEach(cat => {
        // No color → neutral grey; no dashing → solid line
        const color    = showColor ? (categoricalColorMap[cat] || '#999') : '#555';
        const dash     = showDash  ? (categoricalDashMap[cat]  || 'none') : 'none';
        const dashAttr = dash !== 'none' ? `stroke-dasharray="${dash}"` : '';

        html += `
          <li>
            <svg width="40" height="14" style="flex-shrink:0">
              <line x1="2" y1="7" x2="38" y2="7"
                    stroke="${color}" stroke-width="2.5" ${dashAttr}/>
            </svg>
            <span>${cat}</span>
          </li>`;
    });

    html += '</ul>';
    el.innerHTML = html;
}

// ── Numerical legend ──────────────────────────────────────────
// Shows the colour bar, the thickness scale, or both.
// When a task specifies thresholds (e.g. "longer than 4000 km"), the legend
// adds:
//   • a thin vertical tick line on the colour gradient at the exact position
//   • a red "> 4000 km" / "< 1000 km" label directly below the bar
//   • an example line in the thickness section drawn at the correct stroke width
//
// thresholds: array of { value: number, direction: 'gt'|'lt', label: string }
//   value     — distance in km (must fall within the scale domain)
//   direction — 'gt' renders ">", 'lt' renders "<" in the legend label
//   label     — human-readable text used for the thickness example label
function renderNumericalLegend(encodings, thresholds = []) {
    const el    = document.getElementById('study-legend');
    const scale = defineNumericalMapping();
    const [minVal, maxVal] = scale.domain();
    const midVal = Math.round((minVal + maxVal) / 2);

    const showColor     = encodings.includes('color');
    const showThickness = encodings.includes('thickness');
    const hasThresh     = thresholds.length > 0;

    // ── SVG height ────────────────────────────────────────────────────────────
    // colour section:    bar (12) + labels row (20)
    // thickness section: three lines + labels (30)
    // threshold section: always shown when hasThresh && any encoding active
    //                    4px gap + 22px per threshold entry
    const colorH     = showColor     ? 32 : 0;
    const thickBaseH = showThickness ? 30 : 0;
    const threshH    = hasThresh && (showColor || showThickness)
        ? (4 + thresholds.length * 22)
        : 0;
    const svgH    = colorH + thickBaseH + threshH;

    const colorY  = 0;
    const thickY  = colorH;

    // ── Helper: LINEAR normalised position on the x-axis [min, max] ──────────
    // The bar's x-axis is labelled linearly (min km … max km), so threshold
    // ticks sit at their linear fraction.  The COLOUR at each position is
    // determined by the log scale, which we represent faithfully with many stops.
    const norm = v => Math.max(0.01, Math.min(0.99, (v - minVal) / (maxVal - minVal)));

    // ── Multi-stop gradient that accurately reflects the log scale ────────────
    // d3.scaleSequentialLog is non-linear, so a 2-stop CSS gradient gives wrong
    // intermediate colours (e.g. 2000 km looks yellow in a 2-stop bar but the
    // scale actually maps it to medium blue).  32 stops make the bar match the
    // actual edge colours rendered by applyNumericalColouring().
    const N_STOPS = 32;
    let gradStops = '';
    for (let i = 0; i <= N_STOPS; i++) {
        const t     = i / N_STOPS;
        const value = minVal + t * (maxVal - minVal);   // linear in km along the bar
        gradStops  += `<stop offset="${(t * 100).toFixed(1)}%" stop-color="${scale(value)}"/>`;
    }

    let svgContent = `
      <defs>
        <linearGradient id="num-leg-grad" x1="0%" x2="100%">
          ${gradStops}
        </linearGradient>
      </defs>`;

    // ── Colour gradient section ───────────────────────────────────────────────
    if (showColor) {
        svgContent += `
        <rect x="0" y="${colorY}" width="280" height="12"
              fill="url(#num-leg-grad)" rx="2"/>`;

        // Threshold tick lines through the bar
        thresholds.forEach(th => {
            const x = norm(th.value) * 280;
            svgContent += `
        <line x1="${x.toFixed(1)}" y1="${colorY}"
              x2="${x.toFixed(1)}" y2="${colorY + 12}"
              stroke="rgba(255, 255, 255, 0.85)" stroke-width="1.5"/>`;
        });

        // Min / mid / max scale labels
        svgContent += `
        <text x="0"   y="${colorY + 26}" font-size="10" fill="#555">${Math.round(minVal).toLocaleString()} km</text>
        <text x="140" y="${colorY + 26}" font-size="10" fill="#555" text-anchor="middle">${midVal.toLocaleString()} km</text>
        <text x="280" y="${colorY + 26}" font-size="10" fill="#555" text-anchor="end">${Math.round(maxVal).toLocaleString()} km</text>`;

    }

    // ── Thickness section ─────────────────────────────────────────────────────
    // stroke-width values match strokeWidthScale.range([2, 8]) in numerical-edge.js
    if (showThickness) {
        svgContent += `
        <line x1="0"   y1="${thickY + 6}" x2="80"  y2="${thickY + 6}" stroke="#555" stroke-width="2"/>
        <line x1="100" y1="${thickY + 6}" x2="180" y2="${thickY + 6}" stroke="#555" stroke-width="5"/>
        <line x1="200" y1="${thickY + 6}" x2="280" y2="${thickY + 6}" stroke="#555" stroke-width="8"/>
        <text x="40"  y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">short</text>
        <text x="140" y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">medium</text>
        <text x="240" y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">long</text>`;

    }

    // ── Threshold example lines ───────────────────────────────────────────────
    // Shown when there are thresholds AND at least one encoding is active.
    // color active    → stroke = scale(value)  so it matches actual edge colour
    // thickness active → stroke-width from range([2, 8])
    // Both together   → correct colour + correct width on the same line
    if (hasThresh && (showColor || showThickness)) {
        const exSectionY = colorH + thickBaseH + 4;   // 4px gap below last section
        thresholds.forEach((th, i) => {
            const sw     = showThickness
                ? (2 + norm(th.value) * 6).toFixed(1)
                : '2.5';
            const stroke = showColor ? scale(th.value) : '#333';
            const prefix = th.direction === 'gt' ? '>' : th.direction === 'lt' ? '<' : '|';
            const exY    = exSectionY + i * 22;
            svgContent += `
        <line x1="0" y1="${exY + 5}" x2="60" y2="${exY + 5}"
              stroke="${stroke}" stroke-width="${sw}"/>
        <text x="68" y="${exY + 9}" font-size="9" fill="#aa0000"
              font-weight="600">${prefix} ${th.value.toLocaleString()} km</text>`;
        });
    }

    el.innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Route Distance (km)</p>
      <svg width="300" height="${svgH}" style="display:block">${svgContent}</svg>`;
}

// ── Directional legend ────────────────────────────────────────
// Shows only the rows that correspond to active encodings.
function renderDirectionalLegend(encodings) {
    const showGradient = encodings.includes('gradient');
    const showTaper    = encodings.includes('taper');
    const showArrows   = encodings.includes('arrows');

    const rowHeight = 28;
    const rows      = [showGradient, showTaper, showArrows].filter(Boolean).length;
    const svgHeight = rows * rowHeight;

    let y = 14;   // current y for each row's visual element
    // gradientUnits="userSpaceOnUse" with explicit x1/x2 avoids the zero-height
    // bounding-box problem that makes objectBoundingBox gradients invisible on
    // thin elements (lines).  A <rect> is used instead of <line> so that
    // fill-based gradients work reliably across all browsers.
    let svgContent = `
      <defs>
        <linearGradient id="dir-leg-grad" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="160" y2="0">
          <stop offset="0%"   stop-color="#2ca25f"/>
          <stop offset="100%" stop-color="#2166ac"/>
        </linearGradient>
      </defs>`;

    if (showGradient) {
        svgContent += `
        <rect x="4" y="${y - 3}" width="156" height="6" rx="2"
              fill="url(#dir-leg-grad)"/>
        <text x="168" y="${y + 4}" font-size="10" fill="#555">colour: source → target</text>`;
        y += rowHeight;
    }
    if (showTaper) {
        const b = y - 5, t = y + 3;
        svgContent += `
        <polygon points="4,${y} 160,${b} 160,${t}" fill="#444" opacity="0.75"/>
        <text x="168" y="${y + 2}" font-size="10" fill="#555">width: source → target</text>`;
        y += rowHeight;
    }
    if (showArrows) {
        svgContent += `
        <polygon points="160,${y} 145,${y - 5} 145,${y + 5}" fill="black" opacity="0.9"/>
        <line x1="4" y1="${y}" x2="155" y2="${y}" stroke="#555" stroke-width="1.5"/>
        <text x="168" y="${y + 4}" font-size="10" fill="#555">arrow: points to target</text>`;
        y += rowHeight;
    }

    document.getElementById('study-legend').innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Flight Direction</p>
      <svg width="300" height="${svgHeight}" style="display:block">${svgContent}</svg>`;
}

// ============================================================
//  Boot
// ============================================================
init().catch(err => console.error('[STUDY] Initialisation error:', err));
