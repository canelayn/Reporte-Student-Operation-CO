/* ============================================================
   charts.js — gráficos SVG puros (sin Chart.js ni CDNs), pensados
   para funcionar offline y en redes corporativas restringidas.
   ============================================================ */

const Charts = (function () {

  const COLORS = {
    navy: "#0f2a4a",
    blue: "#2e8bc0",
    blueLight: "#7fb8dd",
    good: "#158a5c",
    warn: "#b5730a",
    bad: "#c0362c",
    grid: "#e3e9f0",
    text: "#667085"
  };

  function svgEl(w, h, extraAttrs) {
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" ${extraAttrs || ""}>`;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    let f;
    if (n <= 1) f = 1; else if (n <= 2) f = 2; else if (n <= 5) f = 5; else f = 10;
    return f * mag;
  }

  function attachTooltip(container) {
    let tip = container.querySelector(".chart-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tooltip";
      container.style.position = "relative";
      container.appendChild(tip);
    }
    return tip;
  }

  function bindHover(container, selector, textFn) {
    const tip = attachTooltip(container);
    container.querySelectorAll(selector).forEach(el => {
      el.addEventListener("mousemove", (e) => {
        const rect = container.getBoundingClientRect();
        tip.style.opacity = "1";
        tip.style.left = (e.clientX - rect.left + 12) + "px";
        tip.style.top = (e.clientY - rect.top + 8) + "px";
        tip.innerHTML = textFn(el);
      });
      el.addEventListener("mouseleave", () => { tip.style.opacity = "0"; });
    });
  }

  /* ---------- Combo: barras (gestión total) + línea (contactabilidad %) ---------- */
  function lineBarCombo(container, { labels, barValues, lineValues, barLabel, lineLabel }) {
    const W = Math.max(640, labels.length * 46), H = 300;
    const padL = 52, padR = 52, padT = 20, padB = 46;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxBar = niceMax(Math.max(...barValues, 1));
    const maxLine = 1; // porcentaje 0-100%

    const bw = plotW / labels.length;
    const barW = Math.min(28, bw * 0.55);

    let bars = "", pts = [], xTicks = "", gridLines = "";
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH - (i / 4) * plotH;
      gridLines += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>`;
      gridLines += `<text x="${padL - 8}" y="${y + 4}" font-size="10" fill="${COLORS.text}" text-anchor="end">${Utils.fmtInt(maxBar * i / 4)}</text>`;
      gridLines += `<text x="${padL + plotW + 8}" y="${y + 4}" font-size="10" fill="${COLORS.blue}" text-anchor="start">${Math.round(maxLine * i / 4 * 100)}%</text>`;
    }

    labels.forEach((lab, i) => {
      const cx = padL + bw * i + bw / 2;
      const bh = (barValues[i] / maxBar) * plotH;
      const by = padT + plotH - bh;
      bars += `<rect class="cc-bar" data-i="${i}" x="${cx - barW / 2}" y="${by}" width="${barW}" height="${Math.max(bh,0)}" rx="3" fill="${COLORS.navy}" opacity="0.88"/>`;
      const ly = padT + plotH - (lineValues[i] / maxLine) * plotH;
      pts.push([cx, ly]);
      if (i % Math.ceil(labels.length / 14 || 1) === 0 || labels.length <= 14) {
        xTicks += `<text x="${cx}" y="${H - padB + 18}" font-size="10" fill="${COLORS.text}" text-anchor="middle">${lab}</text>`;
      }
    });

    const pathD = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    let dots = "";
    pts.forEach((p, i) => {
      dots += `<circle class="cc-dot" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="${COLORS.blue}" stroke-width="2"/>`;
    });

    const svg = `${svgEl(W, H)}
      ${gridLines}
      ${bars}
      <path d="${pathD}" fill="none" stroke="${COLORS.blue}" stroke-width="2.5"/>
      ${dots}
      ${xTicks}
      </svg>`;
    container.innerHTML = svg;
    bindHover(container, ".cc-bar", (el) => {
      const i = +el.dataset.i;
      return `<b>${labels[i]}</b><br>${barLabel}: ${Utils.fmtInt(barValues[i])}`;
    });
    bindHover(container, ".cc-dot", (el) => {
      const i = +el.dataset.i;
      return `<b>${labels[i]}</b><br>${lineLabel}: ${Utils.fmtPct(lineValues[i])}`;
    });
  }

  /* ---------- Barras verticales simples (ej. adherencia diaria) con línea meta ---------- */
  function barWithTarget(container, { labels, values, target, valueFormatter, color }) {
    const W = Math.max(640, labels.length * 40), H = 260;
    const padL = 46, padR = 16, padT = 18, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const c = color || COLORS.blue;
    const maxV = Math.max(niceMax(Math.max(...values, target || 0)), 0.1);
    const bw = plotW / labels.length;
    const barW = Math.min(26, bw * 0.6);

    let bars = "", grid = "", xTicks = "";
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH - (i / 4) * plotH;
      grid += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="${COLORS.grid}"/>`;
      grid += `<text x="${padL - 8}" y="${y + 4}" font-size="10" fill="${COLORS.text}" text-anchor="end">${Math.round(maxV * i / 4 * 100)}%</text>`;
    }
    labels.forEach((lab, i) => {
      const cx = padL + bw * i + bw / 2;
      const v = values[i] || 0;
      const bh = (v / maxV) * plotH;
      const by = padT + plotH - bh;
      const barColor = target && v < target ? COLORS.warn : c;
      bars += `<rect class="bt-bar" data-i="${i}" x="${cx - barW / 2}" y="${by}" width="${barW}" height="${Math.max(bh,0)}" rx="3" fill="${barColor}"/>`;
      if (i % Math.ceil(labels.length / 14 || 1) === 0 || labels.length <= 14) {
        xTicks += `<text x="${cx}" y="${H - padB + 18}" font-size="10" fill="${COLORS.text}" text-anchor="middle">${lab}</text>`;
      }
    });
    let targetLine = "";
    if (target) {
      const ty = padT + plotH - (target / maxV) * plotH;
      targetLine = `<line x1="${padL}" y1="${ty}" x2="${padL + plotW}" y2="${ty}" stroke="${COLORS.bad}" stroke-width="1.5" stroke-dasharray="5,4"/>
        <text x="${padL + plotW}" y="${ty - 5}" font-size="10" fill="${COLORS.bad}" text-anchor="end">Meta ${Math.round(target*100)}%</text>`;
    }

    container.innerHTML = `${svgEl(W, H)}${grid}${bars}${targetLine}${xTicks}</svg>`;
    bindHover(container, ".bt-bar", (el) => {
      const i = +el.dataset.i;
      return `<b>${labels[i]}</b><br>${valueFormatter ? valueFormatter(values[i]) : Utils.fmtPct(values[i])}`;
    });
  }

  /* ---------- Dona simple (distribución por canal) ---------- */
  function donut(container, { segments, centerLabel, centerValue }) {
    const size = 220, cx = 110, cy = 110, rOuter = 95, rInner = 58;
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let angle = -Math.PI / 2;
    let paths = "";
    segments.forEach((seg, i) => {
      const frac = seg.value / total;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const largeArc = (a1 - a0) > Math.PI ? 1 : 0;
      const x0o = cx + rOuter * Math.cos(a0), y0o = cy + rOuter * Math.sin(a0);
      const x1o = cx + rOuter * Math.cos(a1), y1o = cy + rOuter * Math.sin(a1);
      const x0i = cx + rInner * Math.cos(a1), y0i = cy + rInner * Math.sin(a1);
      const x1i = cx + rInner * Math.cos(a0), y1i = cy + rInner * Math.sin(a0);
      const d = `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x1o} ${y1o}
                 L ${x0i} ${y0i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${y1i === y1i ? x1i : x1i} ${y1i}
                 Z`;
      paths += `<path class="dn-seg" data-i="${i}" d="${d}" fill="${seg.color}"/>`;
    });
    const label = centerLabel ? `<text x="${cx}" y="${cy - 4}" font-size="11" fill="${COLORS.text}" text-anchor="middle">${centerLabel}</text>` : "";
    const value = centerValue ? `<text x="${cx}" y="${cy + 16}" font-size="18" font-weight="800" fill="${COLORS.navy}" text-anchor="middle">${centerValue}</text>` : "";
    container.innerHTML = `${svgEl(size, size)}${paths}${label}${value}</svg>`;
    bindHover(container, ".dn-seg", (el) => {
      const i = +el.dataset.i;
      const seg = segments[i];
      const pct = total ? (seg.value / total) : 0;
      return `<b>${seg.label}</b><br>${Utils.fmtInt(seg.value)} (${Utils.fmtPct(pct)})`;
    });
  }

  /* ---------- Barras horizontales (top N) ---------- */
  function hbarTop(container, { items, color, valueFormatter }) {
    const rowH = 26, padL = 4, padR = 60, padT = 4;
    const labelW = 190;
    const W = 560, H = padT * 2 + items.length * rowH;
    const plotW = W - labelW - padR;
    const maxV = Math.max(...items.map(i => i.value), 1);
    let rows = "";
    items.forEach((it, i) => {
      const y = padT + i * rowH;
      const bw = (it.value / maxV) * plotW;
      rows += `
        <text x="${labelW - 8}" y="${y + rowH / 2 + 4}" font-size="12" fill="${COLORS.text}" text-anchor="end">${Utils.escapeHtml(it.label)}</text>
        <rect class="hb-bar" data-i="${i}" x="${labelW}" y="${y + 4}" width="${Math.max(bw,2)}" height="${rowH - 10}" rx="4" fill="${color || COLORS.blue}"/>
        <text x="${labelW + bw + 8}" y="${y + rowH / 2 + 4}" font-size="12" font-weight="700" fill="${COLORS.navy}">${valueFormatter ? valueFormatter(it.value) : Utils.fmtInt(it.value)}</text>
      `;
    });
    container.innerHTML = `${svgEl(W, H, `preserveAspectRatio="xMinYMin meet"`)}${rows}</svg>`;
    bindHover(container, ".hb-bar", (el) => {
      const i = +el.dataset.i;
      return `<b>${Utils.escapeHtml(items[i].label)}</b><br>${valueFormatter ? valueFormatter(items[i].value) : Utils.fmtInt(items[i].value)}`;
    });
  }

  /* ---------- Barras verticales categóricas (distribución de puntualidad) ---------- */
  function categoryBar(container, { labels, values, colors }) {
    const W = 480, H = 240;
    const padL = 46, padR = 16, padT = 18, padB = 36;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxV = niceMax(Math.max(...values, 1));
    const bw = plotW / labels.length;
    const barW = Math.min(70, bw * 0.55);
    let grid = "", bars = "", xTicks = "";
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH - (i / 4) * plotH;
      grid += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="${COLORS.grid}"/>`;
      grid += `<text x="${padL - 8}" y="${y + 4}" font-size="10" fill="${COLORS.text}" text-anchor="end">${Utils.fmtInt(maxV * i / 4)}</text>`;
    }
    labels.forEach((lab, i) => {
      const cx = padL + bw * i + bw / 2;
      const v = values[i] || 0;
      const bh = (v / maxV) * plotH;
      const by = padT + plotH - bh;
      bars += `<rect class="cb-bar" data-i="${i}" x="${cx - barW / 2}" y="${by}" width="${barW}" height="${Math.max(bh,0)}" rx="4" fill="${(colors && colors[i]) || COLORS.blue}"/>
        <text x="${cx}" y="${by - 6}" font-size="11" font-weight="700" fill="${COLORS.navy}" text-anchor="middle">${Utils.fmtInt(v)}</text>`;
      xTicks += `<text x="${cx}" y="${H - padB + 18}" font-size="11" fill="${COLORS.text}" text-anchor="middle">${lab}</text>`;
    });
    container.innerHTML = `${svgEl(W, H)}${grid}${bars}${xTicks}</svg>`;
  }

  return { COLORS, lineBarCombo, barWithTarget, donut, hbarTop, categoryBar };
})();
