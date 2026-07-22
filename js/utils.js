/* ============================================================
   utils.js — funciones auxiliares reutilizables
   ============================================================ */

const Utils = (function () {

  // Quita tildes/diacríticos, pasa a minúsculas, colapsa espacios.
  function normalize(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  // Excel guarda fechas/horas como número de día (serie 1900). SheetJS con
  // cellDates:false nos entrega ese número crudo; esta función lo convierte
  // a horas decimales (para horas/duraciones) sin perder precisión.
  function excelFractionToHours(value) {
    if (typeof value !== "number" || isNaN(value)) return null;
    return value * 24;
  }

  // Convierte horas decimales a "HH:MM". Soporta valores negativos
  // (se usan en diferencias de tiempo, ej. llegó 3 min antes).
  function hoursToHHMM(hours) {
    if (hours === null || hours === undefined || isNaN(hours)) return "—";
    const sign = hours < 0 ? "-" : "";
    const abs = Math.abs(hours);
    let h = Math.floor(abs);
    let m = Math.round((abs - h) * 60);
    if (m === 60) { m = 0; h += 1; }
    return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function minutesFromHours(hours) {
    if (hours === null || hours === undefined || isNaN(hours)) return null;
    return hours * 60;
  }

  // Excel serial date (número de día completo, ej. 46000) -> objeto Date (UTC).
  function excelSerialToDate(serial) {
    if (typeof serial !== "number" || isNaN(serial)) return null;
    // Epoch de Excel: 1899-12-30 (compensa el "bug" del año bisiesto 1900).
    const utcDays = Math.floor(serial);
    const utcMs = (utcDays - 25569) * 86400 * 1000;
    return new Date(utcMs);
  }

  function dateToISO(date) {
    if (!date || isNaN(date.getTime())) return null;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function isoToDisplay(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  const NF_INT = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const NF_DEC1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const NF_PCT = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function fmtInt(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return NF_INT.format(n);
  }
  function fmtDec1(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return NF_DEC1.format(n);
  }
  // recibe una fracción 0-1 (o >1) y la muestra como porcentaje es-CO
  function fmtPct(fraction) {
    if (fraction === null || fraction === undefined || isNaN(fraction)) return "—";
    return NF_PCT.format(fraction * 100) + "%";
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Título de cada palabra (para nombres de agentes en mayúscula sostenida)
  function toTitleCase(str) {
    if (!str) return "";
    return String(str).toLowerCase().replace(/(^|\s|\/)([a-záéíóúñ])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  }

  return {
    normalize, excelFractionToHours, hoursToHHMM, minutesFromHours,
    excelSerialToDate, dateToISO, isoToDisplay,
    fmtInt, fmtDec1, fmtPct, clamp, debounce, escapeHtml, toTitleCase
  };
})();
