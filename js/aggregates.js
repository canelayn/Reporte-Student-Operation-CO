/* ============================================================
   aggregates.js — cálculos agregados sobre el conjunto de
   registros ya filtrado. Un único lugar de verdad para que el
   dashboard y el asistente de datos siempre coincidan.
   ============================================================ */

const Aggregates = (function () {

  function alianzaLabel(a) { return a === null ? "Sin identificar" : a; }
  function coachLabel(c) { return (!c || c === "") ? "Sin coach" : c; }

  function kpis(records) {
    const out = {
      totalGestion: 0, totalContactada: 0,
      llamadasGestiones: 0, llamadasContactadas: 0,
      mensajesGestiones: 0, mensajesContactados: 0,
      horasConexion: 0, horasProgramadas: 0,
      adherenciaPonderadaNum: 0, adherenciaPonderadaDen: 0,
      registros: records.length,
      agentesUnicos: new Set(),
      agentesSinId: 0
    };
    for (const r of records) {
      out.totalGestion += r.totalGestion;
      out.totalContactada += r.totalContactada;
      out.llamadasGestiones += r.llamadasGestiones;
      out.llamadasContactadas += r.llamadasContactadas;
      out.mensajesGestiones += r.mensajesGestiones;
      out.mensajesContactados += r.mensajesContactados;
      out.horasConexion += (r.horasConexion || 0);
      out.horasProgramadas += (r.horasProgramadas || 0);
      if (r.pctAdherencia !== null && r.horasProgramadas) {
        out.adherenciaPonderadaNum += r.pctAdherencia * r.horasProgramadas;
        out.adherenciaPonderadaDen += r.horasProgramadas;
      }
      if (r.agenteEsNA) out.agentesSinId++;
      else out.agentesUnicos.add(r.agente);
    }
    out.contactabilidad = out.totalGestion ? out.totalContactada / out.totalGestion : 0;
    out.contactabilidadLlamadas = out.llamadasGestiones ? out.llamadasContactadas / out.llamadasGestiones : 0;
    out.contactabilidadMensajes = out.mensajesGestiones ? out.mensajesContactados / out.mensajesGestiones : 0;
    out.adherenciaPonderada = out.adherenciaPonderadaDen ? out.adherenciaPonderadaNum / out.adherenciaPonderadaDen : 0;
    out.cumplimientoHoras = out.horasProgramadas ? out.horasConexion / out.horasProgramadas : 0;
    out.agentesUnicosCount = out.agentesUnicos.size;
    return out;
  }

  function groupBy(records, keyFn, labelFn) {
    const map = new Map();
    for (const r of records) {
      const key = keyFn(r);
      if (!map.has(key)) {
        map.set(key, {
          key, label: labelFn ? labelFn(key, r) : key,
          totalGestion: 0, totalContactada: 0,
          llamadasGestiones: 0, llamadasContactadas: 0,
          mensajesGestiones: 0, mensajesContactados: 0,
          horasConexion: 0, horasProgramadas: 0,
          adherenciaNum: 0, adherenciaDen: 0,
          registros: 0, retardos: 0, aTiempo: 0, antesTiempo: 0, sinDato: 0
        });
      }
      const g = map.get(key);
      g.totalGestion += r.totalGestion;
      g.totalContactada += r.totalContactada;
      g.llamadasGestiones += r.llamadasGestiones;
      g.llamadasContactadas += r.llamadasContactadas;
      g.mensajesGestiones += r.mensajesGestiones;
      g.mensajesContactados += r.mensajesContactados;
      g.horasConexion += (r.horasConexion || 0);
      g.horasProgramadas += (r.horasProgramadas || 0);
      if (r.pctAdherencia !== null && r.horasProgramadas) {
        g.adherenciaNum += r.pctAdherencia * r.horasProgramadas;
        g.adherenciaDen += r.horasProgramadas;
      }
      g.registros++;
      if (r.estadoConexion === "Retardo") g.retardos++;
      else if (r.estadoConexion === "A tiempo") g.aTiempo++;
      else if (r.estadoConexion === "Antes de tiempo") g.antesTiempo++;
      else g.sinDato++;
    }
    const arr = Array.from(map.values());
    arr.forEach(g => {
      g.contactabilidad = g.totalGestion ? g.totalContactada / g.totalGestion : 0;
      g.adherencia = g.adherenciaDen ? g.adherenciaNum / g.adherenciaDen : 0;
      g.cumplimientoHoras = g.horasProgramadas ? g.horasConexion / g.horasProgramadas : 0;
      g.pctRetardos = g.registros ? g.retardos / g.registros : 0;
    });
    return arr;
  }

  function byAlianza(records) {
    return groupBy(records, r => alianzaLabel(r.alianza), (k) => k);
  }
  function byCoach(records) {
    return groupBy(records, r => coachLabel(r.coach), (k) => k);
  }
  function byAgente(records) {
    return groupBy(records.filter(r => !r.agenteEsNA), r => r.agente, (k) => k);
  }
  function byFecha(records) {
    const arr = groupBy(records, r => r.fecha || "Sin fecha", (k) => k);
    arr.sort((a, b) => (a.key > b.key ? 1 : -1));
    return arr;
  }

  function punctualityDistribution(records) {
    const dist = { "A tiempo": 0, "Antes de tiempo": 0, "Retardo": 0, "Sin dato": 0 };
    for (const r of records) dist[r.estadoConexion] = (dist[r.estadoConexion] || 0) + 1;
    return dist;
  }

  function topN(arr, field, n, ascending) {
    const sorted = arr.slice().sort((a, b) => ascending ? a[field] - b[field] : b[field] - a[field]);
    return sorted.slice(0, n);
  }

  return { kpis, groupBy, byAlianza, byCoach, byAgente, byFecha, punctualityDistribution, topN, alianzaLabel, coachLabel };
})();
