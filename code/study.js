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

// ── Synchronous setup (before main.js's fetch resolves) ──────
appState.visualizationMode = 'nodeLink';  // keeps buildEverything() in NL-only mode
svg.attr('id', 'study-svg');              // give the SVG the spec'd id

// ── URL parameters ────────────────────────────────────────────
const _p         = new URLSearchParams(window.location.search);
const prolificPid = _p.get('PROLIFIC_PID') || 'PREVIEW';
const studyId     = _p.get('STUDY_ID')     || 'PREVIEW';
const sessionId   = _p.get('SESSION_ID')   || 'PREVIEW';
const condition   = _p.get('condition')    || 'categorical';

const sessionData = {
    prolificPid,
    studyId,
    sessionId,
    condition,
    startTime: Date.now(),
};

// ── Encoding defaults (used when a task omits "encodings") ───
// Each key matches a task's "condition" value.
// The values list every encoding that is ON by default for that condition.
const DEFAULT_ENCODINGS = {
    categorical: ['color', 'dashing'],
    numerical:   ['color', 'thickness'],
    directional: ['gradient', 'taper', 'arrows'],
};

// Return the active encoding list for a task.
// Falls back to DEFAULT_ENCODINGS if the task has no "encodings" field.
function getEncodings(task) {
    return task.encodings || DEFAULT_ENCODINGS[task.condition] || [];
}

// ── Mutable state ─────────────────────────────────────────────
let tasks            = [];
let currentTaskIndex = 0;
let taskStartTime    = null;
let selectedAnswer   = null;    // IATA string or MC option text
let activeCondition  = null;    // condition currently rendered on the canvas
let activeEncodings  = null;    // serialised encoding list for change-detection
let activeFilter     = null;    // serialised filter spec for change-detection

// ── Logging ───────────────────────────────────────────────────
// All events go to console.log for now; Firebase writes are added later.
function logEvent(eventName, data) {
    console.log('[STUDY]', eventName, data);
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
        conditions:  'all',    // participant goes through every condition
        timestamp:   new Date().toISOString(),
    });

    // Load all tasks and wait for the graph in parallel
    const [tasksData] = await Promise.all([
        fetch('data/tasks.json').then(r => r.json()),
        waitForGraph(),
    ]);

    // All tasks in JSON order — no condition filter
    tasks = tasksData.tasks;

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
function applyConditionEncoding(cond, encodings) {
    const active = new Set(encodings);

    if (cond === 'categorical') {
        if (active.has('color'))   applyCategoricalColouring(datasetSpec.categoricalVar);
        if (active.has('dashing')) applyCategoricalDashing(datasetSpec.categoricalVar);
        renderCategoricalLegend(encodings);

    } else if (cond === 'numerical') {
        if (active.has('color'))     applyNumericalColouring();
        if (active.has('thickness')) applyNumericalThickness();
        renderNumericalLegend(encodings);

    } else if (cond === 'directional') {
        if (active.has('gradient')) applyDirectionalGradient();
        if (active.has('taper'))    applyDirectionalTaper();
        if (active.has('arrows'))   applyDirectionalArrows();
        renderDirectionalLegend(encodings);
    }
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
    applyConditionEncoding(task.condition, encodings);

    setSimulationState({
        alphaTarget:    0.01,
        velocityDecay:  0.3,
        chargeStrength: -50,
        linkDistance:   30,
    });
    setTimeout(() => { if (appState.sim) appState.sim.alphaTarget(0); }, 1000);
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
    document.querySelectorAll('.node--highlighted, .edge--highlighted, .neighbor--highlighted')
        .forEach(el => el.classList.remove(
            'node--highlighted', 'edge--highlighted', 'neighbor--highlighted',
        ));

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
    selectedAnswer = label;

    logEvent('node_highlighted', {
        taskId:    tasks[currentTaskIndex]?.id,
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
    const isCorrect      = selectedAnswer === task.correctAnswer;

    logEvent('answer_submitted', {
        taskId:         task.id,
        answerType:     task.answerType,
        selectedAnswer,
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
function renderNumericalLegend(encodings) {
    const el    = document.getElementById('study-legend');
    const scale = defineNumericalMapping();
    const [minVal, maxVal] = scale.domain();
    const midVal  = Math.round((minVal + maxVal) / 2);
    const colMin  = scale(minVal);
    const colMax  = scale(maxVal);

    const showColor     = encodings.includes('color');
    const showThickness = encodings.includes('thickness');

    // Compute SVG height dynamically so unused sections don't leave blank space
    const svgHeight = (showColor ? 32 : 0) + (showThickness ? 30 : 0);
    let colorY = 0;      // y-offset for the colour section
    let thickY = showColor ? 32 : 0;  // y-offset for the thickness section

    let svgContent = `
      <defs>
        <linearGradient id="num-leg-grad" x1="0%" x2="100%">
          <stop offset="0%"   stop-color="${colMin}"/>
          <stop offset="100%" stop-color="${colMax}"/>
        </linearGradient>
      </defs>`;

    if (showColor) {
        svgContent += `
        <rect x="0" y="${colorY}" width="280" height="12"
              fill="url(#num-leg-grad)" rx="2"/>
        <text x="0"   y="${colorY + 26}" font-size="10" fill="#555">${Math.round(minVal)} km</text>
        <text x="140" y="${colorY + 26}" font-size="10" fill="#555" text-anchor="middle">${midVal} km</text>
        <text x="280" y="${colorY + 26}" font-size="10" fill="#555" text-anchor="end">${Math.round(maxVal)} km</text>`;
    }

    if (showThickness) {
        svgContent += `
        <line x1="0"   y1="${thickY + 6}" x2="80"  y2="${thickY + 6}" stroke="#555" stroke-width="1"/>
        <line x1="100" y1="${thickY + 6}" x2="180" y2="${thickY + 6}" stroke="#555" stroke-width="3"/>
        <line x1="200" y1="${thickY + 6}" x2="280" y2="${thickY + 6}" stroke="#555" stroke-width="5"/>
        <text x="40"  y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">short</text>
        <text x="140" y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">medium</text>
        <text x="240" y="${thickY + 20}" font-size="10" fill="#555" text-anchor="middle">long</text>`;
    }

    el.innerHTML = `
      <p class="panel-label" style="margin-bottom:6px;">Route Distance (km)</p>
      <svg width="300" height="${svgHeight}" style="display:block">${svgContent}</svg>`;
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
