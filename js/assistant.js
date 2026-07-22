/* ============================================================
   assistant.js — Asistente de datos.
   MOTOR DE REGLAS 100% EN EL NAVEGADOR. No usa IA generativa,
   ningún modelo de lenguaje ni API externa: solo coincidencia de
   palabras clave sobre los datos ya cargados y agregaciones
   matemáticas simples (sumas, promedios, rankings).
   ============================================================ */

const Assistant = (function () {

  const THRESHOLDS = {
    contactabilidadMin: 0.55,
    adherenciaMin: 0.85,
    retardosMax: 0.15,
    cumplimientoHorasMin: 0.90
  };

  function n(str) { return Utils.normalize(str); }

  function fmtG(g) {
    return `gestión total ${Utils.fmtInt(g.totalGestion)}, contactabilidad ${Utils.fmtPct(g.contactabilidad)}, adherencia ${Utils.fmtPct(g.adherencia)}`;
  }

  function listTop(arr, field, n_, fmt) {
    const top = Aggregates.topN(arr, field, n_, false);
    return "<ul>" + top.map((g, i) => `<li><b>${i + 1}. ${Utils.escapeHtml(g.label)}</b> — ${fmt(g)}</li>`).join("") + "</ul>";
  }

  function findEntity(records, groups, query) {
    const q = n(query);
    let best = null, bestLen = 0;
    for (const g of groups) {
      const gl = n(g.label);
      if (q.includes(gl) && gl.length > bestLen) { best = g; bestLen = gl.length; }
    }
    return best;
  }

  /* -------- Generador de alertas basado en umbrales -------- */
  function generateAlerts(records) {
    const alerts = [];
    if (records.length === 0) return alerts;

    const alianzas = Aggregates.byAlianza(records);
    const coaches = Aggregates.byCoach(records);
    const kpi = Aggregates.kpis(records);

    alianzas.forEach(g => {
      if (g.contactabilidad < THRESHOLDS.contactabilidadMin && g.totalGestion > 0) {
        alerts.push({
          level: "bad",
          text: `<b>${Utils.escapeHtml(g.label)}</b> tiene contactabilidad de ${Utils.fmtPct(g.contactabilidad)}, por debajo del umbral de ${Utils.fmtPct(THRESHOLDS.contactabilidadMin)}. Recomendación: revisar horarios de marcación y calidad de la base de contacto de esta alianza.`
        });
      }
      if (g.adherenciaDen > 0 && g.adherencia < THRESHOLDS.adherenciaMin) {
        alerts.push({
          level: "warn",
          text: `Adherencia de <b>${Utils.escapeHtml(g.label)}</b> en ${Utils.fmtPct(g.adherencia)}, debajo de la meta de ${Utils.fmtPct(THRESHOLDS.adherenciaMin)}. Recomendación: validar cumplimiento de horario con los coaches del equipo.`
        });
      }
      if (g.registros > 0 && g.pctRetardos > THRESHOLDS.retardosMax) {
        alerts.push({
          level: "warn",
          text: `<b>${Utils.escapeHtml(g.label)}</b> tiene ${Utils.fmtPct(g.pctRetardos)} de registros con retardo de conexión, por encima del ${Utils.fmtPct(THRESHOLDS.retardosMax)}. Recomendación: reforzar puntualidad de ingreso con el equipo de coaching.`
        });
      }
    });

    coaches.forEach(g => {
      if (g.registros > 0 && g.pctRetardos > THRESHOLDS.retardosMax) {
        alerts.push({
          level: "warn",
          text: `El equipo de <b>${Utils.escapeHtml(g.label)}</b> registra ${Utils.fmtPct(g.pctRetardos)} de retardos. Recomendación: reforzar puntualidad de conexión con este coach.`
        });
      }
    });

    if (kpi.cumplimientoHoras < THRESHOLDS.cumplimientoHorasMin) {
      alerts.push({
        level: "bad",
        text: `El cumplimiento general de horas de conexión vs. programadas es ${Utils.fmtPct(kpi.cumplimientoHoras)}, por debajo de la meta de ${Utils.fmtPct(THRESHOLDS.cumplimientoHorasMin)}. Recomendación: revisar ausentismo y tiempos fuera de cola a nivel general.`
      });
    }

    if (alerts.length === 0) {
      alerts.push({ level: "good", text: "No se detectaron alertas con los umbrales configurados actualmente: contactabilidad, adherencia, puntualidad y horas de conexión están dentro de rango." });
    }
    return alerts;
  }

  /* -------- Motor de intenciones -------- */
  function answer(question, records) {
    const q = n(question);
    if (records.length === 0) {
      return "No hay datos que coincidan con los filtros actuales. Ajusta los filtros del panel superior e intenta de nuevo.";
    }

    const kpi = Aggregates.kpis(records);
    const alianzas = Aggregates.byAlianza(records);
    const coaches = Aggregates.byCoach(records);
    const agentes = Aggregates.byAgente(records);

    // --- Alertas / recomendaciones ---
    if (/alerta|recomendaci|riesgo|que debo revisar|qué debo revisar/.test(q)) {
      const alerts = generateAlerts(records);
      return "Estas son las alertas según los umbrales configurados:<ul>" +
        alerts.map(a => `<li>${a.text}</li>`).join("") + "</ul>";
    }

    // --- Ranking: contactabilidad más baja/alta por alianza ---
    if (/contactabilidad/.test(q) && /alianza/.test(q)) {
      if (/mas baja|más baja|menor|peor/.test(q)) {
        const g = Aggregates.topN(alianzas.filter(a=>a.totalGestion>0), "contactabilidad", 1, true)[0];
        return g ? `La alianza con la contactabilidad más baja es <b>${Utils.escapeHtml(g.label)}</b>, con ${Utils.fmtPct(g.contactabilidad)} (${Utils.fmtInt(g.totalContactada)} de ${Utils.fmtInt(g.totalGestion)} gestiones contactadas).` : "No encontré datos suficientes.";
      }
      if (/mas alta|más alta|mayor|mejor/.test(q)) {
        const g = Aggregates.topN(alianzas.filter(a=>a.totalGestion>0), "contactabilidad", 1, false)[0];
        return g ? `La alianza con mejor contactabilidad es <b>${Utils.escapeHtml(g.label)}</b>, con ${Utils.fmtPct(g.contactabilidad)}.` : "No encontré datos suficientes.";
      }
      return "Contactabilidad por alianza:" + listTop(alianzas, "contactabilidad", 8, g => Utils.fmtPct(g.contactabilidad));
    }

    // --- Ranking: adherencia por alianza / coach ---
    if (/adherencia/.test(q)) {
      const scope = /coach/.test(q) ? coaches : alianzas;
      const scopeLabel = /coach/.test(q) ? "coach" : "alianza";
      if (/mas baja|más baja|menor|peor/.test(q)) {
        const g = Aggregates.topN(scope.filter(a=>a.adherenciaDen>0), "adherencia", 1, true)[0];
        return g ? `El ${scopeLabel} con adherencia más baja es <b>${Utils.escapeHtml(g.label)}</b>, con ${Utils.fmtPct(g.adherencia)}.` : "No encontré datos suficientes.";
      }
      if (/mas alta|más alta|mayor|mejor/.test(q)) {
        const g = Aggregates.topN(scope.filter(a=>a.adherenciaDen>0), "adherencia", 1, false)[0];
        return g ? `El ${scopeLabel} con mejor adherencia es <b>${Utils.escapeHtml(g.label)}</b>, con ${Utils.fmtPct(g.adherencia)}.` : "No encontré datos suficientes.";
      }
      return `Adherencia ponderada general: <span class="msg-metric">${Utils.fmtPct(kpi.adherenciaPonderada)}</span>.` +
        ` Por ${scopeLabel}:` + listTop(scope, "adherencia", 8, g => Utils.fmtPct(g.adherencia));
    }

    // --- Retardos / puntualidad ---
    if (/retard|puntualidad|tarde/.test(q)) {
      if (/agente/.test(q) || /quien|quién/.test(q)) {
        const top = Aggregates.topN(agentes.filter(a=>a.registros>0), "retardos", 10, false);
        return "Agentes con más retardos de conexión:" + "<ul>" + top.map((g, i) => `<li><b>${i + 1}. ${Utils.escapeHtml(g.label)}</b> — ${g.retardos} retardo(s) de ${g.registros} días registrados (${Utils.fmtPct(g.pctRetardos)})</li>`).join("") + "</ul>";
      }
      const dist = Aggregates.punctualityDistribution(records);
      const total = records.length;
      return `Distribución de puntualidad sobre ${Utils.fmtInt(total)} registros: A tiempo ${Utils.fmtPct(dist["A tiempo"]/total)}, Antes de tiempo ${Utils.fmtPct(dist["Antes de tiempo"]/total)}, Retardo ${Utils.fmtPct(dist["Retardo"]/total)}, Sin dato ${Utils.fmtPct(dist["Sin dato"]/total)}.`;
    }

    // --- Horas de conexión / cumplimiento ---
    if (/horas? de conexion|horas? conexion|cumplimiento de horas/.test(q)) {
      return `Horas de conexión totales: <span class="msg-metric">${Utils.fmtDec1(kpi.horasConexion)} h</span> sobre ${Utils.fmtDec1(kpi.horasProgramadas)} h programadas — cumplimiento de ${Utils.fmtPct(kpi.cumplimientoHoras)}.`;
    }

    // --- Gestión / WhatsApp / llamadas ---
    if (/whatsapp|mensajes/.test(q) && /gestion|contact/.test(q)) {
      return `Mensajes de WhatsApp — gestiones: <span class="msg-metric">${Utils.fmtInt(kpi.mensajesGestiones)}</span>, contactados: ${Utils.fmtInt(kpi.mensajesContactados)} (contactabilidad ${Utils.fmtPct(kpi.contactabilidadMensajes)}).`;
    }
    if (/llamada/.test(q) && /gestion|contact/.test(q)) {
      return `Llamadas — gestiones: <span class="msg-metric">${Utils.fmtInt(kpi.llamadasGestiones)}</span>, contactadas: ${Utils.fmtInt(kpi.llamadasContactadas)} (contactabilidad ${Utils.fmtPct(kpi.contactabilidadLlamadas)}).`;
    }
    if (/contactabilidad/.test(q)) {
      return `Contactabilidad total: <span class="msg-metric">${Utils.fmtPct(kpi.contactabilidad)}</span> (${Utils.fmtInt(kpi.totalContactada)} de ${Utils.fmtInt(kpi.totalGestion)} gestiones).`;
    }
    if (/gestion(es)? total(es)?|cuantas gestiones|cuántas gestiones/.test(q)) {
      return `Gestión total: <span class="msg-metric">${Utils.fmtInt(kpi.totalGestion)}</span> (${Utils.fmtInt(kpi.llamadasGestiones)} llamadas + ${Utils.fmtInt(kpi.mensajesGestiones)} WhatsApp).`;
    }

    // --- Top agentes por gestión ---
    if (/top|mejores|ranking/.test(q) && /agente/.test(q) && !/retard/.test(q)) {
      return "Top agentes por gestión total:" + listTop(agentes, "totalGestion", 10, g => `${Utils.fmtInt(g.totalGestion)} gestiones, ${Utils.fmtPct(g.contactabilidad)} contactabilidad`);
    }

    // --- Consulta directa por entidad nombrada (alianza / coach / agente) ---
    const entA = findEntity(records, alianzas, question);
    const entC = findEntity(records, coaches, question);
    const entAg = findEntity(records, agentes, question);
    if (entAg && (entAg.label.length > 3)) {
      return `<b>${Utils.escapeHtml(entAg.label)}</b>: ${fmtG(entAg)}, ${Utils.fmtInt(entAg.retardos)} retardo(s) de ${entAg.registros} registros.`;
    }
    if (entC) {
      return `Equipo de <b>${Utils.escapeHtml(entC.label)}</b>: ${fmtG(entC)}, cumplimiento de horas ${Utils.fmtPct(entC.cumplimientoHoras)}.`;
    }
    if (entA) {
      return `<b>${Utils.escapeHtml(entA.label)}</b>: ${fmtG(entA)}, ${Utils.fmtInt(entA.registros)} registros, cumplimiento de horas ${Utils.fmtPct(entA.cumplimientoHoras)}.`;
    }

    // --- Ayuda / fallback ---
    return "No logré identificar esa pregunta con certeza. Puedo responder sobre: gestión total, contactabilidad (llamadas/WhatsApp), adherencia, horas de conexión, puntualidad/retardos, rankings por alianza/coach/agente, y generar alertas con recomendaciones. También puedes preguntar directamente por el nombre de una alianza, coach o agente.";
  }

  return { answer, generateAlerts, THRESHOLDS };
})();
