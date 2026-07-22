/* ============================================================
   app.js — estado, wiring de UI y renderizado de todas las vistas
   ============================================================ */

const State = {
  allRecords: [],
  meta: null,
  fileName: "",
  filters: { alianza: "", coach: "", fechaIni: "", fechaFin: "", agente: "" },
  detalle: { sortField: "fecha", sortDir: "desc", page: 1, pageSize: 25, search: "" },
  conexion: { sortField: "fecha", sortDir: "desc", page: 1, pageSize: 25, search: "" },
  chat: { history: [] }
};

/* ---------------- Filtrado ---------------- */
function filteredRecords() {
  const f = State.filters;
  const qAgente = Utils.normalize(f.agente);
  return State.allRecords.filter(r => {
    if (f.alianza) {
      const lbl = Aggregates.alianzaLabel(r.alianza);
      if (lbl !== f.alianza) return false;
    }
    if (f.coach) {
      const lbl = Aggregates.coachLabel(r.coach);
      if (lbl !== f.coach) return false;
    }
    if (f.fechaIni && r.fecha && r.fecha < f.fechaIni) return false;
    if (f.fechaFin && r.fecha && r.fecha > f.fechaFin) return false;
    if (qAgente && !Utils.normalize(r.agente).includes(qAgente)) return false;
    return true;
  });
}

/* ============================================================
   CARGA Y PARSEO DE ARCHIVO
   ============================================================ */
function initUpload() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const btnChoose = document.getElementById("btn-choose-file");
  const progressWrap = document.getElementById("upload-progress");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");
  const errorBox = document.getElementById("upload-error");

  function setProgress(pct, label) {
    progressWrap.classList.add("active");
    progressFill.style.width = pct + "%";
    progressLabel.textContent = label;
  }
  function showError(msg) {
    progressWrap.classList.remove("active");
    errorBox.textContent = msg;
    errorBox.classList.add("active");
  }
  function clearError() {
    errorBox.classList.remove("active");
    errorBox.textContent = "";
  }

  btnChoose.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", (e) => { if (e.target !== btnChoose) fileInput.click(); });
  dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove("dragover"); });
  });
  dropzone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length) handleFile(files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
  });

  function handleFile(file) {
    clearError();
    const name = file.name || "";
    const ext = name.split(".").pop().toLowerCase();
    if (ext !== "xlsx" && ext !== "xlsm") {
      showError(`El archivo "${name}" no es un Excel válido. Sube un archivo con extensión .xlsx o .xlsm.`);
      return;
    }
    setProgress(15, "Leyendo archivo…");
    const reader = new FileReader();
    reader.onerror = () => showError("No se pudo leer el archivo desde el navegador. Intenta nuevamente o con otro archivo.");
    reader.onload = (ev) => {
      setProgress(55, "Procesando datos de la hoja \"BDD Estados\"…");
      setTimeout(() => {
        try {
          const { records, meta } = Parser.parseWorkbookBuffer(ev.target.result);
          setProgress(90, "Construyendo el dashboard…");
          setTimeout(() => {
            State.allRecords = records;
            State.meta = meta;
            State.fileName = name;
            setProgress(100, "Listo");
            setTimeout(() => {
              document.getElementById("welcome-screen").style.display = "none";
              document.getElementById("dashboard").classList.add("active");
              bootDashboard();
            }, 200);
          }, 30);
        } catch (err) {
          if (err instanceof Parser.ParseError) {
            showError(err.message);
          } else {
            console.error(err);
            showError("Ocurrió un error inesperado procesando el archivo. Verifica que sea el archivo correcto de Genesys y vuelve a intentar.\n\nDetalle técnico: " + (err && err.message ? err.message : String(err)));
          }
        }
      }, 30);
    };
    reader.readAsArrayBuffer(file);
  }
}

/* ============================================================
   BOOT DEL DASHBOARD (una vez cargado el archivo)
   ============================================================ */
function bootDashboard() {
  document.getElementById("loaded-filename").textContent = State.fileName;
  populateFilterOptions();
  renderGlobalNotice();
  renderAll();
  initAssistantUI();
}

function populateFilterOptions() {
  const alianzas = [...new Set(State.allRecords.map(r => Aggregates.alianzaLabel(r.alianza)))].sort();
  const coaches = [...new Set(State.allRecords.map(r => Aggregates.coachLabel(r.coach)))].sort();
  const selA = document.getElementById("f-alianza");
  const selC = document.getElementById("f-coach");
  selA.innerHTML = '<option value="">Todas</option>' + alianzas.map(a => `<option value="${Utils.escapeHtml(a)}">${Utils.escapeHtml(a)}</option>`).join("");
  selC.innerHTML = '<option value="">Todos</option>' + coaches.map(c => `<option value="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</option>`).join("");
}

function renderGlobalNotice() {
  const slot = document.getElementById("global-notice-slot");
  const m = State.meta;
  if (!m) { slot.innerHTML = ""; return; }
  if (m.agenteSinIdCount === 0 && m.alianzaSinIdCount === 0) { slot.innerHTML = ""; return; }
  slot.innerHTML = `<div class="notice">
    <span>⚠️</span>
    <div>
      <b>Nota de calidad de datos.</b>
      ${m.agenteSinIdCount.toLocaleString("es-CO")} registro(s) (${Utils.fmtPct(m.agenteSinIdPct)}) llegaron con Agente sin identificar en el archivo fuente
      ${m.alianzaSinIdCount > 0 ? ` y ${m.alianzaSinIdCount.toLocaleString("es-CO")} (${Utils.fmtPct(m.alianzaSinIdPct)}) con Alianza sin identificar` : ""}.
      Se incluyen en los KPIs y totales generales, pero se excluyen de los rankings por agente y se agrupan como "Sin identificar" en los desgloses por alianza.
      Esto suele deberse a una fórmula de búsqueda (coach/Agente/Alianza) que no se recalculó al guardar el archivo origen.
    </div>
  </div>`;
}

/* ============================================================
   NAVEGACIÓN Y FILTROS
   ============================================================ */
function initNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      const view = item.dataset.view;
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.getElementById("view-" + view).classList.add("active");
      const titles = {
        resumen: ["Resumen ejecutivo", "Vista general del periodo cargado"],
        tendencias: ["Tendencias", "Evolución diaria de gestión y contactabilidad"],
        adherencia: ["Adherencia", "Adherencia diaria ponderada e insights clave"],
        alianzas: ["Alianzas & Coach", "Desempeño por alianza y por equipo de coaching"],
        "top-agentes": ["Top agentes", "Ranking de agentes por gestión total"],
        conexion: ["Conexión & puntualidad", "Cumplimiento de horario y puntualidad de conexión"],
        asistente: ["Asistente de datos", "Preguntas en español sobre los datos cargados"],
        detalle: ["Detalle de gestiones", "Todas las métricas por agente / día"]
      };
      document.getElementById("view-title").textContent = titles[view][0];
      document.getElementById("view-subtitle").textContent = titles[view][1];
      if (window.innerWidth <= 900) document.getElementById("sidebar").classList.remove("open");
    });
  });
  document.getElementById("btn-toggle-sidebar").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
}

function initFilters() {
  const selA = document.getElementById("f-alianza");
  const selC = document.getElementById("f-coach");
  const inIni = document.getElementById("f-fecha-ini");
  const inFin = document.getElementById("f-fecha-fin");
  const inAgente = document.getElementById("f-agente");

  selA.addEventListener("change", () => { State.filters.alianza = selA.value; renderAll(); });
  selC.addEventListener("change", () => { State.filters.coach = selC.value; renderAll(); });
  inIni.addEventListener("change", () => { State.filters.fechaIni = inIni.value; renderAll(); });
  inFin.addEventListener("change", () => { State.filters.fechaFin = inFin.value; renderAll(); });
  inAgente.addEventListener("input", Utils.debounce(() => { State.filters.agente = inAgente.value; renderAll(); }, 250));

  document.getElementById("btn-reset-filters").addEventListener("click", () => {
    State.filters = { alianza: "", coach: "", fechaIni: "", fechaFin: "", agente: "" };
    selA.value = ""; selC.value = ""; inIni.value = ""; inFin.value = ""; inAgente.value = "";
    renderAll();
  });

  document.getElementById("btn-reload-file").addEventListener("click", () => {
    if (!confirm("¿Cargar un nuevo archivo? Se reemplazarán los datos actuales del dashboard.")) return;
    document.getElementById("dashboard").classList.remove("active");
    document.getElementById("welcome-screen").style.display = "flex";
    document.getElementById("file-input").value = "";
    document.getElementById("upload-progress").classList.remove("active");
    document.getElementById("upload-error").classList.remove("active");
    State.allRecords = []; State.meta = null;
  });
}

/* ============================================================
   RENDER: orquestador
   ============================================================ */
function renderAll() {
  const recs = filteredRecords();
  renderResumen(recs);
  renderTendencias(recs);
  renderAdherencia(recs);
  renderAlianzas(recs);
  renderTopAgentes(recs);
  renderConexion(recs);
  State.detalle.page = 1;
  renderDetalle(recs);
}

/* ---------------- Resumen ejecutivo ---------------- */
function renderResumen(recs) {
  const k = Aggregates.kpis(recs);
  const grid = document.getElementById("kpi-grid-resumen");
  const cards = [
    { label: "Gestión total", value: Utils.fmtInt(k.totalGestion), detail: `${Utils.fmtInt(k.llamadasGestiones)} llamadas + ${Utils.fmtInt(k.mensajesGestiones)} WhatsApp` },
    { label: "Contactabilidad total", value: Utils.fmtPct(k.contactabilidad), detail: `${Utils.fmtInt(k.totalContactada)} contactadas`, cls: k.contactabilidad < Assistant.THRESHOLDS.contactabilidadMin ? "warn" : "good" },
    { label: "Llamadas contactadas", value: Utils.fmtInt(k.llamadasContactadas), detail: `sobre ${Utils.fmtInt(k.llamadasGestiones)} gestionadas` },
    { label: "WhatsApp contactados", value: Utils.fmtInt(k.mensajesContactados), detail: `sobre ${Utils.fmtInt(k.mensajesGestiones)} gestionados` },
    { label: "Adherencia ponderada", value: Utils.fmtPct(k.adherenciaPonderada), detail: "ponderada por horas programadas", cls: k.adherenciaPonderada < Assistant.THRESHOLDS.adherenciaMin ? "warn" : "good" },
    { label: "Horas de conexión", value: Utils.fmtDec1(k.horasConexion) + " h", detail: `${Utils.fmtPct(k.cumplimientoHoras)} vs. programadas` },
    { label: "Agentes activos", value: Utils.fmtInt(k.agentesUnicosCount), detail: k.agentesSinId > 0 ? `+${Utils.fmtInt(k.agentesSinId)} registros sin identificar` : "identificados en el periodo" },
    { label: "Registros procesados", value: Utils.fmtInt(k.registros), detail: "filas agente/día en el periodo filtrado" }
  ];
  grid.innerHTML = cards.map(c => `
    <div class="kpi-card ${c.cls || ""}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-detail">${c.detail}</div>
    </div>`).join("");

  // Dona de canal
  const donutEl = document.getElementById("chart-canal-donut");
  const segments = [
    { label: "Llamadas", value: k.llamadasGestiones, color: Charts.COLORS.navy },
    { label: "WhatsApp", value: k.mensajesGestiones, color: Charts.COLORS.blue }
  ];
  Charts.donut(donutEl, { segments, centerLabel: "Gestión total", centerValue: Utils.fmtInt(k.totalGestion) });
  document.getElementById("chart-canal-legend").innerHTML = segments.map(s => `
    <div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.label}: ${Utils.fmtInt(s.value)}</div>
  `).join("");

  document.getElementById("canal-contactabilidad-cards").innerHTML = `
    <div class="insight-list">
      <div class="insight-item ${k.contactabilidadLlamadas < Assistant.THRESHOLDS.contactabilidadMin ? "warn" : "good"}">
        <span class="ii-icon">📞</span><div><b>Llamadas:</b> ${Utils.fmtPct(k.contactabilidadLlamadas)} de contactabilidad (${Utils.fmtInt(k.llamadasContactadas)} / ${Utils.fmtInt(k.llamadasGestiones)})</div>
      </div>
      <div class="insight-item ${k.contactabilidadMensajes < Assistant.THRESHOLDS.contactabilidadMin ? "warn" : "good"}">
        <span class="ii-icon">💬</span><div><b>WhatsApp:</b> ${Utils.fmtPct(k.contactabilidadMensajes)} de contactabilidad (${Utils.fmtInt(k.mensajesContactados)} / ${Utils.fmtInt(k.mensajesGestiones)})</div>
      </div>
    </div>`;
}

/* ---------------- Tendencias ---------------- */
function renderTendencias(recs) {
  const byF = Aggregates.byFecha(recs);
  const labels = byF.map(g => Utils.isoToDisplay(g.key).slice(0, 5));
  const barValues = byF.map(g => g.totalGestion);
  const lineValues = byF.map(g => g.contactabilidad);
  Charts.lineBarCombo(document.getElementById("chart-tendencia"), {
    labels, barValues, lineValues, barLabel: "Gestión total", lineLabel: "Contactabilidad"
  });

  const cols = ["Fecha", "Llamadas gestión", "Llamadas contactadas", "WhatsApp gestión", "WhatsApp contactados", "Total gestión", "% Contactabilidad"];
  let rows = byF.map(g => `<tr>
    <td>${Utils.isoToDisplay(g.key)}</td>
    <td>${Utils.fmtInt(g.llamadasGestiones)}</td>
    <td>${Utils.fmtInt(g.llamadasContactadas)}</td>
    <td>${Utils.fmtInt(g.mensajesGestiones)}</td>
    <td>${Utils.fmtInt(g.mensajesContactados)}</td>
    <td><b>${Utils.fmtInt(g.totalGestion)}</b></td>
    <td>${Utils.fmtPct(g.contactabilidad)}</td>
  </tr>`).join("");
  document.getElementById("tabla-canal-diario").innerHTML = `
    <table class="data-table"><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------------- Adherencia ---------------- */
function renderAdherencia(recs) {
  const byF = Aggregates.byFecha(recs).filter(g => g.adherenciaDen > 0);
  const labels = byF.map(g => Utils.isoToDisplay(g.key).slice(0, 5));
  const values = byF.map(g => g.adherencia);
  Charts.barWithTarget(document.getElementById("chart-adherencia"), {
    labels, values, target: Assistant.THRESHOLDS.adherenciaMin, valueFormatter: (v) => "Adherencia: " + Utils.fmtPct(v)
  });

  const alerts = Assistant.generateAlerts(recs);
  document.getElementById("insight-list").innerHTML = alerts.map(a => `
    <div class="insight-item ${a.level}">
      <span class="ii-icon">${a.level === "bad" ? "🔴" : a.level === "warn" ? "🟠" : "🟢"}</span>
      <div>${a.text}</div>
    </div>`).join("");
}

/* ---------------- Alianzas & Coach ---------------- */
function renderGroupTable(container, groups, entityLabel) {
  const sorted = groups.slice().sort((a, b) => b.totalGestion - a.totalGestion);
  const totals = sorted.reduce((acc, g) => {
    acc.totalGestion += g.totalGestion; acc.totalContactada += g.totalContactada;
    acc.horasConexion += g.horasConexion; acc.horasProgramadas += g.horasProgramadas;
    return acc;
  }, { totalGestion: 0, totalContactada: 0, horasConexion: 0, horasProgramadas: 0 });

  const rows = sorted.map(g => `<tr>
    <td><b>${Utils.escapeHtml(g.label)}</b></td>
    <td>${Utils.fmtInt(g.totalGestion)}</td>
    <td>${Utils.fmtInt(g.totalContactada)}</td>
    <td>${pillPct(g.contactabilidad, Assistant.THRESHOLDS.contactabilidadMin)}</td>
    <td>${g.adherenciaDen ? pillPct(g.adherencia, Assistant.THRESHOLDS.adherenciaMin) : '<span class="pill pill-muted">Sin dato</span>'}</td>
    <td>${Utils.fmtDec1(g.horasConexion)} h</td>
    <td>${Utils.fmtDec1(g.horasProgramadas)} h</td>
    <td>${pillPct(g.cumplimientoHoras, Assistant.THRESHOLDS.cumplimientoHorasMin)}</td>
    <td>${Utils.fmtInt(g.registros)}</td>
  </tr>`).join("");

  container.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>${entityLabel}</th><th>Gestión total</th><th>Contactada</th><th>% Contactabilidad</th>
      <th>Adherencia</th><th>Horas conexión</th><th>Horas prog.</th><th>Cumpl. horas</th><th>Registros</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td>Total</td><td>${Utils.fmtInt(totals.totalGestion)}</td><td>${Utils.fmtInt(totals.totalContactada)}</td>
      <td>${Utils.fmtPct(totals.totalGestion ? totals.totalContactada / totals.totalGestion : 0)}</td>
      <td>—</td><td>${Utils.fmtDec1(totals.horasConexion)} h</td><td>${Utils.fmtDec1(totals.horasProgramadas)} h</td>
      <td>${Utils.fmtPct(totals.horasProgramadas ? totals.horasConexion / totals.horasProgramadas : 0)}</td><td>—</td>
    </tr></tfoot>
  </table>`;
}
function pillPct(v, min) {
  const cls = v >= min ? "pill-good" : (v >= min * 0.8 ? "pill-warn" : "pill-bad");
  return `<span class="pill ${cls}">${Utils.fmtPct(v)}</span>`;
}
function renderAlianzas(recs) {
  renderGroupTable(document.getElementById("tabla-alianzas"), Aggregates.byAlianza(recs), "Alianza");
  renderGroupTable(document.getElementById("tabla-coaches"), Aggregates.byCoach(recs), "Coach");
}

/* ---------------- Top agentes ---------------- */
function renderTopAgentes(recs) {
  const agentes = Aggregates.byAgente(recs);
  const top10 = Aggregates.topN(agentes, "totalGestion", 10, false);
  Charts.hbarTop(document.getElementById("chart-top-agentes"), {
    items: top10.map(g => ({ label: g.label, value: g.totalGestion })), color: Charts.COLORS.navy
  });
  const rows = top10.map((g, i) => `<tr>
    <td><span class="rank-badge">${i + 1}</span>${Utils.escapeHtml(g.label)}</td>
    <td>${Utils.fmtInt(g.totalGestion)}</td>
    <td>${Utils.fmtInt(g.totalContactada)}</td>
    <td>${pillPct(g.contactabilidad, Assistant.THRESHOLDS.contactabilidadMin)}</td>
    <td>${g.adherenciaDen ? Utils.fmtPct(g.adherencia) : "—"}</td>
    <td>${Utils.fmtInt(g.retardos)}</td>
  </tr>`).join("");
  document.getElementById("tabla-top-agentes").innerHTML = `<table class="data-table">
    <thead><tr><th>Agente</th><th>Gestión total</th><th>Contactada</th><th>% Contactabilidad</th><th>Adherencia</th><th>Retardos</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/* ---------------- Conexión & puntualidad ---------------- */
function renderConexion(recs) {
  const k = Aggregates.kpis(recs);
  const dist = Aggregates.punctualityDistribution(recs);
  const total = recs.length || 1;
  const grid = document.getElementById("kpi-grid-conexion");
  grid.innerHTML = [
    { label: "% A tiempo", value: Utils.fmtPct(dist["A tiempo"] / total), cls: "good" },
    { label: "% Antes de tiempo", value: Utils.fmtPct(dist["Antes de tiempo"] / total) },
    { label: "% Retardo", value: Utils.fmtPct(dist["Retardo"] / total), cls: dist["Retardo"] / total > Assistant.THRESHOLDS.retardosMax ? "bad" : "good" },
    { label: "% Sin dato", value: Utils.fmtPct(dist["Sin dato"] / total) },
    { label: "Cumplimiento de horas", value: Utils.fmtPct(k.cumplimientoHoras), detail: `${Utils.fmtDec1(k.horasConexion)} h de ${Utils.fmtDec1(k.horasProgramadas)} h`, cls: k.cumplimientoHoras < Assistant.THRESHOLDS.cumplimientoHorasMin ? "warn" : "good" }
  ].map(c => `<div class="kpi-card ${c.cls || ""}"><div class="kpi-label">${c.label}</div><div class="kpi-value">${c.value}</div>${c.detail ? `<div class="kpi-detail">${c.detail}</div>` : ""}</div>`).join("");

  Charts.categoryBar(document.getElementById("chart-puntualidad"), {
    labels: ["A tiempo", "Antes de tiempo", "Retardo", "Sin dato"],
    values: [dist["A tiempo"], dist["Antes de tiempo"], dist["Retardo"], dist["Sin dato"]],
    colors: [Charts.COLORS.good, Charts.COLORS.blue, Charts.COLORS.bad, Charts.COLORS.text]
  });

  const agentes = Aggregates.byAgente(recs).filter(g => g.retardos > 0);
  const topRetardos = Aggregates.topN(agentes, "retardos", 10, false);
  Charts.hbarTop(document.getElementById("chart-top-retardos"), {
    items: topRetardos.map(g => ({ label: g.label, value: g.retardos })), color: Charts.COLORS.bad
  });

  renderConexionTable(recs);
}

function renderConexionTable(recs) {
  const state = State.conexion;
  const columns = [
    { key: "fecha", label: "Fecha", sortVal: r => r.fecha || "", fmt: r => Utils.isoToDisplay(r.fecha) },
    { key: "agente", label: "Agente", sortVal: r => r.agente, fmt: r => Utils.escapeHtml(r.agente) },
    { key: "coach", label: "Coach", sortVal: r => r.coach, fmt: r => Utils.escapeHtml(r.coach) },
    { key: "alianza", label: "Alianza", sortVal: r => Aggregates.alianzaLabel(r.alianza), fmt: r => Utils.escapeHtml(Aggregates.alianzaLabel(r.alianza)) },
    { key: "horarioIngresoProgramado", label: "Hora programada", sortVal: r => r.horarioIngresoProgramado || 0, fmt: r => Utils.hoursToHHMM(r.horarioIngresoProgramado) },
    { key: "inicioSesion", label: "Hora real inicio", sortVal: r => r.inicioSesion || 0, fmt: r => Utils.hoursToHHMM(r.inicioSesion) },
    { key: "diff", label: "Diferencia (min)", sortVal: r => r.tiempoDiferenciaConexion === null ? 0 : r.tiempoDiferenciaConexion * 60, fmt: r => r.tiempoDiferenciaConexion === null ? "—" : Utils.fmtDec1(r.tiempoDiferenciaConexion * 60) },
    { key: "estadoConexion", label: "Estado", sortVal: r => r.estadoConexion, fmt: r => estadoPill(r.estadoConexion) }
  ];
  mountPagedTable({
    mountId: "conexion-table-wrap", paginationId: null, state, columns,
    records: recs, searchFields: r => [r.agente, r.coach, Aggregates.alianzaLabel(r.alianza)]
  });
}

function estadoPill(estado) {
  const map = { "A tiempo": "pill-good", "Antes de tiempo": "pill-good", "Retardo": "pill-bad", "Sin dato": "pill-muted" };
  return `<span class="pill ${map[estado] || "pill-muted"}">${estado}</span>`;
}

/* ============================================================
   TABLA GENÉRICA PAGINADA / ORDENABLE / BUSCABLE
   ============================================================ */
function mountPagedTable({ mountId, state, columns, records, searchFields }) {
  const mount = document.getElementById(mountId);
  let data = records;
  if (state.search) {
    const q = Utils.normalize(state.search);
    data = data.filter(r => searchFields(r).some(v => Utils.normalize(v || "").includes(q)));
  }
  const col = columns.find(c => c.key === state.sortField) || columns[0];
  data = data.slice().sort((a, b) => {
    const av = col.sortVal(a), bv = col.sortVal(b);
    let cmp;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), "es");
    return state.sortDir === "asc" ? cmp : -cmp;
  });

  const totalRows = data.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
  state.page = Utils.clamp(state.page, 1, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageData = data.slice(start, start + state.pageSize);

  const thead = `<tr>${columns.map(c => {
    const isSorted = c.key === state.sortField;
    const arrow = isSorted ? (state.sortDir === "asc" ? "▲" : "▼") : "";
    return `<th class="sortable" data-key="${c.key}">${c.label} <span class="sort-arrow">${arrow}</span></th>`;
  }).join("")}</tr>`;
  const tbody = pageData.map(r => `<tr>${columns.map(c => `<td>${c.fmt(r)}</td>`).join("")}</tr>`).join("") ||
    `<tr><td colspan="${columns.length}" style="text-align:center;color:var(--text-500);padding:20px;">No hay registros con los filtros actuales.</td></tr>`;

  mount.innerHTML = `
    <div class="table-scroll"><table class="data-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
    <div class="pagination">
      <span>${Utils.fmtInt(totalRows)} registro(s) · página ${state.page} de ${totalPages}</span>
      <div class="pg-btns">
        <button data-act="first" ${state.page === 1 ? "disabled" : ""}>«</button>
        <button data-act="prev" ${state.page === 1 ? "disabled" : ""}>‹ Anterior</button>
        <button data-act="next" ${state.page === totalPages ? "disabled" : ""}>Siguiente ›</button>
        <button data-act="last" ${state.page === totalPages ? "disabled" : ""}>»</button>
      </div>
    </div>`;

  mount.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sortField === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortField = key; state.sortDir = "asc"; }
      mountPagedTable({ mountId, state, columns, records, searchFields });
    });
  });
  mount.querySelectorAll(".pg-btns button").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "first") state.page = 1;
      if (act === "prev") state.page -= 1;
      if (act === "next") state.page += 1;
      if (act === "last") state.page = totalPages;
      mountPagedTable({ mountId, state, columns, records, searchFields });
    });
  });

  return { totalRows, filteredSortedData: data };
}

/* ---------------- Detalle de gestiones ---------------- */
const DETALLE_COLUMNS = [
  { key: "fecha", label: "Fecha", sortVal: r => r.fecha || "", fmt: r => Utils.isoToDisplay(r.fecha), csv: r => r.fecha || "" },
  { key: "coach", label: "Coach", sortVal: r => r.coach, fmt: r => Utils.escapeHtml(r.coach), csv: r => r.coach },
  { key: "agente", label: "Agente", sortVal: r => r.agente, fmt: r => Utils.escapeHtml(r.agente), csv: r => r.agente },
  { key: "alianza", label: "Alianza", sortVal: r => Aggregates.alianzaLabel(r.alianza), fmt: r => Utils.escapeHtml(Aggregates.alianzaLabel(r.alianza)), csv: r => Aggregates.alianzaLabel(r.alianza) },
  { key: "tmoProm", label: "TMO (s)", sortVal: r => r.tmoProm || 0, fmt: r => r.tmoProm === null ? "—" : Utils.fmtInt(r.tmoProm), csv: r => r.tmoProm },
  { key: "acwProm", label: "ACW (s)", sortVal: r => r.acwProm || 0, fmt: r => r.acwProm === null ? "—" : Utils.fmtInt(r.acwProm), csv: r => r.acwProm },
  { key: "llamadasGestiones", label: "Llam. gestión", sortVal: r => r.llamadasGestiones, fmt: r => Utils.fmtInt(r.llamadasGestiones), csv: r => r.llamadasGestiones },
  { key: "llamadasContactadas", label: "Llam. contact.", sortVal: r => r.llamadasContactadas, fmt: r => Utils.fmtInt(r.llamadasContactadas), csv: r => r.llamadasContactadas },
  { key: "mensajesGestiones", label: "WhatsApp gestión", sortVal: r => r.mensajesGestiones, fmt: r => Utils.fmtInt(r.mensajesGestiones), csv: r => r.mensajesGestiones },
  { key: "mensajesContactados", label: "WhatsApp contact.", sortVal: r => r.mensajesContactados, fmt: r => Utils.fmtInt(r.mensajesContactados), csv: r => r.mensajesContactados },
  { key: "totalGestion", label: "Total gestión", sortVal: r => r.totalGestion, fmt: r => `<b>${Utils.fmtInt(r.totalGestion)}</b>`, csv: r => r.totalGestion },
  { key: "totalContactada", label: "Total contactada", sortVal: r => r.totalContactada, fmt: r => Utils.fmtInt(r.totalContactada), csv: r => r.totalContactada },
  { key: "pctAdherencia", label: "% Adherencia", sortVal: r => r.pctAdherencia || 0, fmt: r => r.pctAdherencia === null ? "—" : Utils.fmtPct(r.pctAdherencia), csv: r => r.pctAdherencia },
  { key: "horasConexion", label: "Horas conexión", sortVal: r => r.horasConexion || 0, fmt: r => r.horasConexion === null ? "—" : Utils.fmtDec1(r.horasConexion), csv: r => r.horasConexion },
  { key: "horasProgramadas", label: "Horas prog.", sortVal: r => r.horasProgramadas || 0, fmt: r => r.horasProgramadas === null ? "—" : Utils.fmtDec1(r.horasProgramadas), csv: r => r.horasProgramadas },
  { key: "horarioIngresoProgramado", label: "Ingreso programado", sortVal: r => r.horarioIngresoProgramado || 0, fmt: r => Utils.hoursToHHMM(r.horarioIngresoProgramado), csv: r => Utils.hoursToHHMM(r.horarioIngresoProgramado) },
  { key: "inicioSesion", label: "Inicio sesión", sortVal: r => r.inicioSesion || 0, fmt: r => Utils.hoursToHHMM(r.inicioSesion), csv: r => Utils.hoursToHHMM(r.inicioSesion) },
  { key: "finSesion", label: "Fin sesión", sortVal: r => r.finSesion || 0, fmt: r => Utils.hoursToHHMM(r.finSesion), csv: r => Utils.hoursToHHMM(r.finSesion) },
  { key: "estadoConexion", label: "Puntualidad", sortVal: r => r.estadoConexion, fmt: r => estadoPill(r.estadoConexion), csv: r => r.estadoConexion }
];

function renderDetalle(recs) {
  const result = mountPagedTable({
    mountId: "tabla-detalle", state: State.detalle, columns: DETALLE_COLUMNS,
    records: recs, searchFields: r => [r.agente, r.coach, Aggregates.alianzaLabel(r.alianza)]
  });
  State._lastDetalleResult = result;
}

function initDetalleToolbar() {
  const search = document.getElementById("detalle-search");
  search.addEventListener("input", Utils.debounce(() => {
    State.detalle.search = search.value;
    State.detalle.page = 1;
    renderDetalle(filteredRecords());
  }, 250));

  document.getElementById("btn-export-csv").addEventListener("click", () => {
    const data = (State._lastDetalleResult && State._lastDetalleResult.filteredSortedData) || [];
    if (data.length === 0) { alert("No hay registros para exportar con los filtros actuales."); return; }
    const header = DETALLE_COLUMNS.map(c => c.label).join(";");
    const lines = data.map(r => DETALLE_COLUMNS.map(c => csvEscape(c.csv(r))).join(";"));
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `detalle_gestiones_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ============================================================
   ASISTENTE DE DATOS
   ============================================================ */
const SUGGESTED_CHIPS = [
  "¿Cuál es la contactabilidad total?",
  "¿Qué alianza tiene la contactabilidad más baja?",
  "¿Qué agentes tienen más retardos?",
  "Muéstrame las alertas y recomendaciones",
  "¿Cómo va la adherencia por coach?",
  "Top agentes por gestión"
];

function initAssistantUI() {
  const body = document.getElementById("assistant-body");
  const chipsWrap = document.getElementById("assistant-chips");
  const input = document.getElementById("assistant-input");
  const sendBtn = document.getElementById("assistant-send");

  if (body.dataset.inited) return;
  body.dataset.inited = "1";

  chipsWrap.innerHTML = SUGGESTED_CHIPS.map(c => `<div class="chip">${Utils.escapeHtml(c)}</div>`).join("");
  chipsWrap.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => sendMessage(chip.textContent));
  });

  addBotMessage("¡Hola! Soy el asistente de datos del reporte. Respondo preguntas sobre gestión, contactabilidad, adherencia, conexión y puntualidad usando los datos ya cargados y los filtros activos. ¿Qué quieres consultar?");

  function addUserMessage(text) {
    const row = document.createElement("div");
    row.className = "msg-row user";
    row.innerHTML = `<div class="msg-avatar">Tú</div><div class="msg-bubble">${Utils.escapeHtml(text)}</div>`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }
  function addBotMessage(html) {
    const row = document.createElement("div");
    row.className = "msg-row bot";
    row.innerHTML = `<div class="msg-avatar">RC</div><div class="msg-bubble">${html}</div>`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }
  function addTyping() {
    const row = document.createElement("div");
    row.className = "msg-row bot";
    row.id = "typing-row";
    row.innerHTML = `<div class="msg-avatar">RC</div><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }
  function removeTyping() {
    const el = document.getElementById("typing-row");
    if (el) el.remove();
  }

  function sendMessage(text) {
    text = (text || "").trim();
    if (!text) return;
    addUserMessage(text);
    input.value = "";
    addTyping();
    setTimeout(() => {
      removeTyping();
      const html = Assistant.answer(text, filteredRecords());
      addBotMessage(html);
    }, 380 + Math.random() * 260);
  }

  sendBtn.addEventListener("click", () => sendMessage(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(input.value); });
}

/* ============================================================
   INIT GLOBAL
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initUpload();
  initNav();
  initFilters();
  initDetalleToolbar();
});
