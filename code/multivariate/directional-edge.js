import * as d3 from 'd3';
import { svg, appState, buttonState, nodeSize } from '../main.js';

const GRADIENT_SOURCE_COLOR = "#2ca25f";
const GRADIENT_TARGET_COLOR = "#2166ac";

const TAPER_MAX_WIDTH = 6;
const TAPER_SAMPLES = 20;

// Arrow dimensions (pixels).  Tip sits on the node's circumference;
// length and half-width control the triangle proportions.
const ARROW_LENGTH   = 5;
const ARROW_HALF_WIDTH = 2.5;

// ─── Directional Gradient ─────────────────────────────────────────────────────

export function applyDirectionalGradient() {
    ensureDefs();
    const defs = svg.select("defs");

    d3.selectAll(".link").each(function(d, i) {
        const gradId = `dir-gradient-${i}`;
        defs.select(`#${gradId}`).remove();

        const grad = defs.append("linearGradient")
            .attr("id", gradId)
            .attr("gradientUnits", "userSpaceOnUse");

        grad.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", GRADIENT_SOURCE_COLOR);

        grad.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", GRADIENT_TARGET_COLOR);

        d3.select(this)
            .style("stroke", `url(#${gradId})`)
            .attr("data-gradient-id", gradId);
    });

    updateGradients();
    if (appState.sim) appState.sim.on("tick.gradient", updateGradients);

    buttonState.directionalGradient = true;
}

export function resetDirectionalGradient() {
    d3.selectAll(".link[data-gradient-id]").each(function() {
        const gradId = d3.select(this).attr("data-gradient-id");
        d3.select(`#${gradId}`).remove();
        d3.select(this)
            .style("stroke", null)
            .attr("data-gradient-id", null);
    });

    if (appState.sim) appState.sim.on("tick.gradient", null);
    buttonState.directionalGradient = false;
}

function updateGradients() {
    d3.selectAll(".link[data-gradient-id]").each(function() {
        const pathD = d3.select(this).attr("d");
        if (!pathD) return;

        const p = parseBezierFromPath(pathD);
        if (!p) return;

        const gradId = d3.select(this).attr("data-gradient-id");
        d3.select(`#${gradId}`)
            .attr("x1", p.x0).attr("y1", p.y0)
            .attr("x2", p.x3).attr("y2", p.y3);
    });
}

// ─── Directional Tapering ─────────────────────────────────────────────────────

export function applyDirectionalTaper() {
    d3.selectAll(".taper-link").remove();

    d3.selectAll(".link").each(function(d, i) {
        const taperId = `taper-link-${i}`;

        const taperEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        taperEl.setAttribute("class", "taper-link");
        taperEl.setAttribute("id", taperId);
        taperEl.setAttribute("stroke", "none");
        taperEl.setAttribute("opacity", "0.75");
        this.parentNode.insertBefore(taperEl, this);

        d3.select(this)
            .style("visibility", "hidden")
            .attr("data-taper-id", taperId);
    });

    updateTapers();
    if (appState.sim) appState.sim.on("tick.taper", updateTapers);

    buttonState.directionalTaper = true;
    buttonState.syncDirectional = updateTapers;
}

export function resetDirectionalTaper() {
    d3.selectAll(".taper-link").remove();

    d3.selectAll(".link[data-taper-id]")
        .style("visibility", null)
        .attr("data-taper-id", null);

    if (appState.sim) appState.sim.on("tick.taper", null);

    buttonState.directionalTaper = false;
    buttonState.syncDirectional = null;
}

function updateTapers() {
    d3.selectAll(".link[data-taper-id]").each(function() {
        const pathD = d3.select(this).attr("d");
        if (!pathD) return;

        const p = parseBezierFromPath(pathD);
        if (!p) return;

        const taperPath = computeTaperPath(p);
        if (!taperPath) return;

        const taperId = d3.select(this).attr("data-taper-id");
        const taperEl = d3.select(`#${taperId}`);
        if (taperEl.empty()) return;

        taperEl.attr("d", taperPath);

        // Sync fill color with the link's stroke (readable even when visibility:hidden)
        const stroke = d3.select(this).style("stroke");
        if (stroke && stroke !== "none" && stroke !== "rgba(0, 0, 0, 0)") {
            taperEl.attr("fill", stroke);
        } else {
            taperEl.attr("fill", "#333");
        }
    });
}

// ─── Directional Arrowheads ───────────────────────────────────────────────────
// Draws a small filled triangle at the *target* end of each edge,
// sitting on the node's circumference and pointing in the direction of travel.
// Call applyDirectionalArrows() after applyDirectionalTaper() so the arrows
// render on top of the taper polygons.

export function applyDirectionalArrows() {
    // Remove any existing arrows first (safe to call on rebuild)
    d3.selectAll('.arrow-link').remove();

    d3.selectAll('.link').each(function (d, i) {
        const arrowId  = `arrow-link-${i}`;
        const arrowEl  = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrowEl.setAttribute('class',   'arrow-link');
        arrowEl.setAttribute('id',       arrowId);
        arrowEl.setAttribute('opacity', '0.9');
        arrowEl.setAttribute('stroke',  'none');
        
        arrowEl.setAttribute('fill', "black");

        // Append at the END of the SVG so arrows sit above node circles.
        // insertBefore placed them below nodes, hiding the tip (which lands
        // exactly on the circumference) under the node circle.
        this.parentNode.appendChild(arrowEl);

        d3.select(this).attr('data-arrow-id', arrowId);
    });

    updateArrows();
    if (appState.sim) appState.sim.on('tick.arrow', updateArrows);

    buttonState.directionalArrow = true;
}

export function resetDirectionalArrows() {
    d3.selectAll('.arrow-link').remove();
    d3.selectAll('.link[data-arrow-id]').attr('data-arrow-id', null);
    if (appState.sim) appState.sim.on('tick.arrow', null);
    buttonState.directionalArrow = false;
}

function updateArrows() {
    d3.selectAll('.link[data-arrow-id]').each(function () {
        const pathD = d3.select(this).attr('d');
        if (!pathD) return;

        const p = parseBezierFromPath(pathD);
        if (!p) return;

        // ── Find where the bezier curve exits the target node circle ──────────
        // Binary-search for the parameter t where |B(t) − target| = nodeSize.
        // This gives the exact point on the drawn line where it disappears under
        // the node, regardless of edge orientation or length.
        const r2 = nodeSize * nodeSize;
        let lo = 0, hi = 1;
        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            const pt  = evalCubic(p, mid);
            const d2  = (pt.x - p.x3) * (pt.x - p.x3)
                      + (pt.y - p.y3) * (pt.y - p.y3);
            if (d2 > r2) lo = mid; else hi = mid;
        }

        const tip  = evalCubic(p, hi);
        const tipX = tip.x;
        const tipY = tip.y;

        // ── Arrow direction: tiny step back along the curve at t = hi ─────────
        const prev = evalCubic(p, Math.max(0, hi - 0.02));
        const dx   = tipX - prev.x;
        const dy   = tipY - prev.y;
        const len  = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) return;

        const nx = dx / len;   // unit vector pointing toward the tip
        const ny = dy / len;
        const px = -ny;        // perpendicular
        const py =  nx;

        // ── Build the triangle ────────────────────────────────────────────────
        const baseX = tipX - nx * ARROW_LENGTH;
        const baseY = tipY - ny * ARROW_LENGTH;

        const points = [
            `${tipX.toFixed(2)},${tipY.toFixed(2)}`,
            `${(baseX + px * ARROW_HALF_WIDTH).toFixed(2)},${(baseY + py * ARROW_HALF_WIDTH).toFixed(2)}`,
            `${(baseX - px * ARROW_HALF_WIDTH).toFixed(2)},${(baseY - py * ARROW_HALF_WIDTH).toFixed(2)}`,
        ].join(' ');

        const arrowId = d3.select(this).attr('data-arrow-id');
        const arrowEl = d3.select(`#${arrowId}`);
        if (arrowEl.empty()) return;

        arrowEl
            .attr('points', points)
            .attr('fill', "black");
    });
}

// Evaluate the cubic bezier B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
function evalCubic(p, t) {
    const mt = 1 - t;
    return {
        x: mt*mt*mt*p.x0 + 3*mt*mt*t*p.cx1 + 3*mt*t*t*p.cx2 + t*t*t*p.x3,
        y: mt*mt*mt*p.y0 + 3*mt*mt*t*p.cy1 + 3*mt*t*t*p.cy2 + t*t*t*p.y3,
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDefs() {
    // Use the imported `svg` reference so we always target the main SVG,
    // not any legend SVGs that may be present in the document.
    if (svg.select("defs").empty()) {
        svg.insert("defs", ":first-child");
    }
}

function parseBezierFromPath(pathD) {
    const allNums = pathD.match(/-?[\d.]+(?:e[+-]?\d+)?/gi);
    if (!allNums || allNums.length < 8) return null;
    const nums = allNums.map(Number);
    return {
        x0: nums[0], y0: nums[1],
        cx1: nums[2], cy1: nums[3],
        cx2: nums[4], cy2: nums[5],
        x3: nums[6], y3: nums[7]
    };
}

function computeTaperPath(p) {
    const left = [];
    const right = [];

    for (let i = 0; i < TAPER_SAMPLES; i++) {
        const t = i / (TAPER_SAMPLES - 1);
        const mt = 1 - t;

        const pt = {
            x: mt*mt*mt*p.x0 + 3*mt*mt*t*p.cx1 + 3*mt*t*t*p.cx2 + t*t*t*p.x3,
            y: mt*mt*mt*p.y0 + 3*mt*mt*t*p.cy1 + 3*mt*t*t*p.cy2 + t*t*t*p.y3
        };

        const tang = {
            x: 3*(mt*mt*(p.cx1-p.x0) + 2*mt*t*(p.cx2-p.cx1) + t*t*(p.x3-p.cx2)),
            y: 3*(mt*mt*(p.cy1-p.y0) + 2*mt*t*(p.cy2-p.cy1) + t*t*(p.y3-p.cy2))
        };

        const len = Math.sqrt(tang.x*tang.x + tang.y*tang.y);
        if (len < 1e-6) continue;

        const nx = -tang.y / len;
        const ny =  tang.x / len;
        const w = TAPER_MAX_WIDTH * (1 - t);

        left.push([pt.x + nx * w, pt.y + ny * w]);
        right.push([pt.x - nx * w, pt.y - ny * w]);
    }

    if (left.length < 2) return null;

    const pts = [...left, ...[...right].reverse()];
    return pts.map((pt, i) =>
        `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(2)},${pt[1].toFixed(2)}`
    ).join(' ') + ' Z';
}
