import * as d3 from 'd3';
import { appState, datasetSpec, tooltip } from '../main.js';

// ─── Edge-hover tooltip encoding ("baseline") ────────────────────────────────
//
// Adds an invisible fat hit-area path alongside every edge so hovering over a
// thin line is easy.  On mouseover a tooltip appears with the raw edge
// attributes (route, airline, country, distance, aircraft type).
//
// Key compatibility rules (must match nl-builder.js / page-styling.css):
//  • The shared #tooltip div is shown/hidden via OPACITY (0 ↔ 1), never via
//    display.  Setting display:none would prevent the node tooltip from showing
//    because the node handler only sets opacity:1 without resetting display.
//  • pointer-events on SVG elements must be set via setAttribute(), not via
//    element.style, so the SVG pointer-events attribute value ("stroke") is
//    correctly interpreted by the browser.

const HITAREA_STROKE_WIDTH = 12;   // px — width of the invisible hover target

// ─── Apply ───────────────────────────────────────────────────────────────────
//
// fields controls which attributes appear in the tooltip:
//   'route'    — always shown as the bold header (source → target); listing it
//                explicitly means "show ONLY the route, nothing else"
//   'airline'  — Airline: <name>
//   'country'  — Country: <airlinecountry>
//   'distance' — Distance: <km>
//   'aircraft' — Aircraft: <equipment>
//   'all'      — show every field that has a value
//
// Defaults to ['all'] so the function is backward-compatible with the main
// visualisation (index.html), which calls it without arguments.

export function applyEdgeTooltip(fields = ['all']) {
    d3.selectAll('.edge-tooltip-hitarea').remove();   // guard against double-apply

    d3.selectAll('.NLlink').each(function (d, i) {
        const hitId = `edge-tooltip-hitarea-${i}`;
        const hitEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        hitEl.setAttribute('class',          'edge-tooltip-hitarea');
        hitEl.setAttribute('id',              hitId);
        hitEl.setAttribute('fill',            'none');
        hitEl.setAttribute('stroke',          'rgba(255,255,255,0.01)'); // non-none so SVG pointer-events fires
        hitEl.setAttribute('stroke-width',    String(HITAREA_STROKE_WIDTH));
        hitEl.setAttribute('pointer-events',  'stroke');  // SVG attribute, not CSS property

        // Insert right after the visible edge — nodes come later in the DOM so
        // they remain on top in z-order and still receive their own events.
        this.parentNode.insertBefore(hitEl, this.nextSibling);
        d3.select(this).attr('data-hitarea-id', hitId);

        const edgeDatum = d;  // capture datum once; D3 won't bind to a raw DOM element

        d3.select(hitEl)
            .on('mouseover.edgetooltip', function (event) {
                showEdgeTooltip(event, edgeDatum, fields);  // fields captured in closure
            })
            .on('mousemove.edgetooltip', function (event) {
                tooltip
                    .style('left', `${event.pageX + 12}px`)
                    .style('top',  `${event.pageY + 12}px`);
            })
            .on('mouseout.edgetooltip', function () {
                tooltip.style('opacity', 0);  // match hideTooltip() in nl-builder.js
            });
    });

    syncHitareas();
    if (appState.sim) appState.sim.on('tick.edgetooltip', syncHitareas);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export function resetEdgeTooltip() {
    d3.selectAll('.edge-tooltip-hitarea').remove();
    d3.selectAll('.NLlink[data-hitarea-id]').attr('data-hitarea-id', null);
    if (appState.sim) appState.sim.on('tick.edgetooltip', null);
    tooltip.style('opacity', 0);  // never set display — let nl-builder control that
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Keep every hit-area path in sync with its visible edge on each simulation tick.
function syncHitareas() {
    d3.selectAll('.NLlink[data-hitarea-id]').each(function () {
        const pathD = d3.select(this).attr('d');
        const hitId = d3.select(this).attr('data-hitarea-id');
        const hitEl = document.getElementById(hitId);
        if (hitEl && pathD) hitEl.setAttribute('d', pathD);
    });
}

// Build and show the tooltip for a given edge datum.
// fields controls which extra attributes appear after the route header:
//   'route'    → header only (no extras)
//   'airline'  → Airline: <name>
//   'country'  → Country: <airlinecountry>
//   'distance' → Distance: <km>
//   'aircraft' → Aircraft: <equipment>
//   'all'      → every field that has a value
function showEdgeTooltip(event, d, fields = ['all']) {
    const srcId  = typeof d.source === 'object' ? d.source.id : d.source;
    const tgtId  = typeof d.target === 'object' ? d.target.id : d.target;

    const graph  = appState.graph;
    const srcLbl = graph.getNodeAttribute(srcId, datasetSpec.label) || srcId;
    const tgtLbl = graph.getNodeAttribute(tgtId, datasetSpec.label) || tgtId;

    // Route header is always shown; extras depend on fields.
    const showAll = fields.includes('all');
    const show    = f => showAll || fields.includes(f);

    const lines = [`<strong>${srcLbl} → ${tgtLbl}</strong>`];
    if (show('airline')  && d.airline)        lines.push(`Airline: ${d.airline}`);
    if (show('country')  && d.airlinecountry) lines.push(`Country: ${d.airlinecountry}`);
    if (show('distance') && d.distance_km)    lines.push(`Distance: ${Math.round(d.distance_km).toLocaleString()} km`);
    if (show('aircraft') && d.equipment)      lines.push(`Aircraft: ${d.equipment}`);

    tooltip
        .html(lines.join('<br>'))
        .style('left',    `${event.pageX + 12}px`)
        .style('top',     `${event.pageY + 12}px`)
        .style('opacity', 1);   // match showTooltip() in nl-builder.js
}
