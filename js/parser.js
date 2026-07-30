/* ============================================================
   parser.js — lee el Excel de Genesys (hoja "BDD Estados") y
   construye los registros normalizados que usa el dashboard.
   Busca columnas por NOMBRE (tolerante a tildes/mayúsculas/orden),
   nunca por posición fija, porque el orden puede variar entre meses.
   ============================================================ */

const Parser = (function () {

  const SHEET_NAME_CANDIDATES = ["bdd estados"]; // normalizado

  // Nombre canónico -> lista de alias aceptados (todos se normalizan
  // con Utils.normalize antes de comparar).
  const COLUMN_ALIASES = {
    coach: ["coach"],
    agente: ["agente"],
    alianza: ["alianza"],
    tmoProm: ["tmo promedio"],
    acwProm: ["acw promedio"],
    llamadasContactadas: ["llamadas contactadas"],
    llamadasGestiones: ["llamadas gestiones"],
    pctAdherencia: ["% adherencia"],
    horasConexion: ["horas conexion"],
    horasProgramadas: ["horas programadas"],
    horarioIngresoProgramado: ["horario ingreso programado"],
    mensajesGestiones: ["mensajes gestiones"],
    mensajesContactados: ["mensajes contactados"],
    totalGestion: ["total gestion"],
    totalContactada: ["total contactada"],
    fecha: ["fecha"],
    inicioSesion: ["inicio de sesion"],
    finSesion: ["fin de sesion"],
    estadoConexion: ["conexion"], // AMBIGUO: hay 2 columnas "Conexión" -> desambiguar por contenido
    tiempoDiferenciaConexion: ["tiempo diferencia conexion"],
    pctConexion: ["% conexion"]
  };

  // Columnas sin las cuales el dashboard no puede construirse.
  const REQUIRED = ["agente", "alianza", "fecha", "totalGestion", "totalContactada"];

  const PUNCTUALITY_VALUES = ["a tiempo", "antes de tiempo", "retardo"];

  const ALLIANCE_KEYWORDS = [
    "CONTINENTAL", "SABANA", "UNAPEC", "ROSARIO", "UNIBE",
    "JAVERIANA", "PUCMM", "UPB", "USMP", "UTB"
  ];

  class ParseError extends Error {}

  function normalizeAlianza(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (s === "" || s === "#N/A" || s.toUpperCase() === "#N/A") return null;
    const su = Utils.normalize(s).toUpperCase();
    const matched = ALLIANCE_KEYWORDS.filter(k => su.includes(k));
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) return matched.slice().sort().join("/");
    return su; // desconocida: se conserva tal cual, en mayúsculas
  }

  function normalizePunctuality(raw) {
    if (raw === null || raw === undefined) return "Sin dato";
    const s = Utils.normalize(raw);
    if (s === "a tiempo") return "A tiempo";
    if (s === "antes de tiempo") return "Antes de tiempo";
    if (s === "retardo") return "Retardo";
    return "Sin dato"; // cubre "#value!", vacío, u otros
  }

  // Construye un índice: nombre-normalizado -> [índices de columna]
  function buildHeaderIndex(headerRow) {
    const idx = {};
    headerRow.forEach((h, i) => {
      if (h === null || h === undefined || String(h).trim() === "") return;
      const key = Utils.normalize(h);
      if (!idx[key]) idx[key] = [];
      idx[key].push(i);
    });
    return idx;
  }

  // Para una lista de índices candidatos, elige el más adecuado según
  // el contenido observado en las primeras `sampleSize` filas.
  function disambiguateByContent(rows, candidateIdx, sampleSize, kind) {
    if (candidateIdx.length === 1) return candidateIdx[0];
    let best = candidateIdx[0];
    let bestScore = -1;
    for (const ci of candidateIdx) {
      let score = 0, seen = 0;
      for (let r = 0; r < Math.min(sampleSize, rows.length); r++) {
        const v = rows[r][ci];
        if (v === null || v === undefined || v === "") continue;
        seen++;
        if (kind === "text-status") {
          if (typeof v === "string" && PUNCTUALITY_VALUES.includes(Utils.normalize(v))) score++;
          if (typeof v === "string" && Utils.normalize(v) === "#value!") score++;
        } else if (kind === "numeric") {
          if (typeof v === "number") score++;
        }
      }
      const ratio = seen ? score / seen : 0;
      if (ratio > bestScore) { bestScore = ratio; best = ci; }
    }
    return best;
  }

  function resolveColumns(headerRow, sampleRows) {
    const headerIdx = buildHeaderIndex(headerRow);
    const resolved = {};
    const missing = [];

    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      let candidates = [];
      for (const alias of aliases) {
        const key = Utils.normalize(alias);
        if (headerIdx[key]) candidates = candidates.concat(headerIdx[key]);
      }
      candidates = [...new Set(candidates)];

      if (candidates.length === 0) {
        resolved[canonical] = null;
        continue;
      }
      if (canonical === "estadoConexion") {
        resolved[canonical] = disambiguateByContent(sampleRows, candidates, 300, "text-status");
      } else {
        resolved[canonical] = candidates[0];
      }
    }

    for (const req of REQUIRED) {
      if (resolved[req] === null || resolved[req] === undefined) {
        missing.push(req);
      }
    }
    return { resolved, missing };
  }

  function findSheet(workbook) {
    const names = workbook.SheetNames || [];
    for (const n of names) {
      if (Utils.normalize(n) === "bdd estados") return n;
    }
    // tolerancia: contiene "bdd" y "estados"
    for (const n of names) {
      const norm = Utils.normalize(n);
      if (norm.includes("bdd") && norm.includes("estado")) return n;
    }
    return null;
  }

  function friendlyColumnLabel(canonical) {
    const labels = {
      coach: "coach", agente: "Agente", alianza: "Alianza",
      tmoProm: "TMO promedio", acwProm: "ACW promedio",
      llamadasContactadas: "llamadas contactadas", llamadasGestiones: "Llamadas gestiones",
      pctAdherencia: "% adherencia", horasConexion: "Horas conexión",
      horasProgramadas: "Horas programadas", horarioIngresoProgramado: "Horario ingreso programado",
      mensajesGestiones: "Mensajes gestiones", mensajesContactados: "Mensajes contactados",
      totalGestion: "Total Gestion", totalContactada: "Total Contactada",
      fecha: "Fecha", inicioSesion: "Inicio de sesión", finSesion: "Fin de sesión",
      estadoConexion: "Conexión (estado de puntualidad)",
      tiempoDiferenciaConexion: "Tiempo diferencia conexión", pctConexion: "% conexión"
    };
    return labels[canonical] || canonical;
  }

  /**
   * Punto de entrada principal. Recibe un ArrayBuffer del archivo subido.
   * Devuelve { records, meta } o lanza ParseError con mensaje en español.
   */
  function parseWorkbookBuffer(arrayBuffer) {
    let workbook;
    try {
    workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, raw: true });
    } catch (e) {
      throw new ParseError(
        "No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx o .xlsm) y que no esté dañado o protegido con contraseña."
      );
    }
 
    // Detecta si el libro usa el sistema de fechas 1904 (típico de Excel para Mac).
    const is1904 = !!(workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904);

    const sheetName = findSheet(workbook);
    if (!sheetName) {
      throw new ParseError(
        `No se encontró la hoja "BDD Estados" en este archivo.\n` +
        `Hojas disponibles: ${workbook.SheetNames.join(", ")}.\n` +
        `Verifica que subiste el archivo correcto de Genesys.`
      );
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    if (rows.length < 2) {
      throw new ParseError(`La hoja "${sheetName}" no tiene datos suficientes (se encontraron ${rows.length} filas).`);
    }

    const headerRow = rows[0];
    const dataRows = rows.slice(1);
    const { resolved, missing } = resolveColumns(headerRow, dataRows);

    if (missing.length > 0) {
      const labels = missing.map(friendlyColumnLabel).join(", ");
      throw new ParseError(
        `Faltan columnas obligatorias en la hoja "${sheetName}": ${labels}.\n` +
        `Revisa que los encabezados no se hayan renombrado ni eliminado.`
      );
    }

    const records = [];
    let agenteSinIdCount = 0;
    let alianzaSinIdCount = 0;
    let filasVacias = 0;

    for (const row of dataRows) {
      // Ignora filas completamente vacías (a veces Excel deja filas fantasma)
      const alianzaRaw = resolved.alianza !== null ? row[resolved.alianza] : null;
      const agenteRaw = resolved.agente !== null ? row[resolved.agente] : null;
      const totalGestionRaw = resolved.totalGestion !== null ? row[resolved.totalGestion] : null;
      const fechaRaw = resolved.fecha !== null ? row[resolved.fecha] : null;

      if ((alianzaRaw === null || alianzaRaw === "") && (agenteRaw === null || agenteRaw === "") && fechaRaw === null) {
      filasVacias++;
      continue;
    }
 
    // Descarta filas fantasma: sin fecha numérica válida, o con fecha fuera de rango lógico
    // (Excel deja fechas basura como 1899 o 1904 en filas sin datos reales).
    const fechaCheck = typeof fechaRaw === "number" ? Utils.excelSerialToDate(fechaRaw, is1904) : null;
    if (!fechaCheck || fechaCheck.getUTCFullYear() < 2020 || fechaCheck.getUTCFullYear() > 2100) {
      filasVacias++;
      continue;
    }
      }

      const agenteStr = agenteRaw === null ? "" : String(agenteRaw).trim();
      const agenteEsNA = agenteStr === "" || agenteStr === "#N/A";
      if (agenteEsNA) agenteSinIdCount++;

      const alianzaNorm = normalizeAlianza(alianzaRaw);
      if (alianzaNorm === null) alianzaSinIdCount++;

      const fechaDate = typeof fechaRaw === "number" ? Utils.excelSerialToDate(fechaRaw, is1904) : null;
      const fechaISO = fechaDate ? Utils.dateToISO(fechaDate) : null;

      const horasConexion = resolved.horasConexion !== null ? Utils.excelFractionToHours(row[resolved.horasConexion]) : null;
      const horasProgramadas = resolved.horasProgramadas !== null ? Utils.excelFractionToHours(row[resolved.horasProgramadas]) : null;
      const horarioIngresoProgramado = resolved.horarioIngresoProgramado !== null ? Utils.excelFractionToHours(row[resolved.horarioIngresoProgramado]) : null;
      const inicioSesion = resolved.inicioSesion !== null ? Utils.excelFractionToHours(row[resolved.inicioSesion]) : null;
      const finSesion = resolved.finSesion !== null ? Utils.excelFractionToHours(row[resolved.finSesion]) : null;
      const tiempoDiferenciaConexion = resolved.tiempoDiferenciaConexion !== null ? Utils.excelFractionToHours(row[resolved.tiempoDiferenciaConexion]) : null;

      const pctAdherenciaRaw = resolved.pctAdherencia !== null ? row[resolved.pctAdherencia] : null;
      const pctConexionRaw = resolved.pctConexion !== null ? row[resolved.pctConexion] : null;

      const num = (v) => (typeof v === "number" ? v : (v === null || v === undefined || v === "" ? 0 : (isNaN(Number(v)) ? 0 : Number(v))));

      const rec = {
        coach: resolved.coach !== null ? (row[resolved.coach] === null ? "Sin coach" : String(row[resolved.coach]).trim()) : "Sin coach",
        agente: agenteEsNA ? "Agente sin identificar" : Utils.toTitleCase(agenteStr),
        agenteEsNA,
        alianzaRaw: alianzaRaw === null ? "" : String(alianzaRaw).trim(),
        alianza: alianzaNorm, // puede ser null -> "Sin identificar" al mostrar
        tmoProm: resolved.tmoProm !== null ? num(row[resolved.tmoProm]) : null,
        acwProm: resolved.acwProm !== null ? num(row[resolved.acwProm]) : null,
        llamadasContactadas: num(row[resolved.llamadasContactadas]),
        llamadasGestiones: num(row[resolved.llamadasGestiones]),
        mensajesGestiones: num(row[resolved.mensajesGestiones]),
        mensajesContactados: num(row[resolved.mensajesContactados]),
        totalGestion: num(row[resolved.totalGestion]),
        totalContactada: num(row[resolved.totalContactada]),
        pctAdherencia: typeof pctAdherenciaRaw === "number" ? pctAdherenciaRaw : null,
        pctConexion: typeof pctConexionRaw === "number" ? pctConexionRaw : null,
        horasConexion, horasProgramadas, horarioIngresoProgramado,
        inicioSesion, finSesion, tiempoDiferenciaConexion,
        estadoConexion: resolved.estadoConexion !== null ? normalizePunctuality(row[resolved.estadoConexion]) : "Sin dato",
        fecha: fechaISO,
        fechaDate
      };
      records.push(rec);
    }

    if (records.length === 0) {
      throw new ParseError(`La hoja "${sheetName}" no contiene registros válidos después de procesarla.`);
    }

    const meta = {
      sheetName,
      totalFilas: records.length,
      filasVacias,
      agenteSinIdCount,
      agenteSinIdPct: agenteSinIdCount / records.length,
      alianzaSinIdCount,
      alianzaSinIdPct: alianzaSinIdCount / records.length,
      columnasResueltas: resolved
    };

    return { records, meta };
  }

  return { parseWorkbookBuffer, ParseError, normalizeAlianza, normalizePunctuality };
})();
