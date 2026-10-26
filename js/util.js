// Utilidades compartidas: formatos (es-PE), estados, normalización e íconos.
(function () {
  'use strict';

  // Fecha "de hoy" de la demo: los datos ficticios están armados alrededor de este día.
  const HOY = '2026-10-26';

  const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'set.', 'oct.', 'nov.', 'dic.'];
  const pad = (n) => String(n).padStart(2, '0');

  const fmt = {
    // 2026-10-15 → 15-oct.-26
    fecha(iso) {
      if (!iso) return '—';
      const [y, m, d] = iso.slice(0, 10).split('-');
      return `${d}-${MESES[Number(m) - 1]}-${y.slice(2)}`;
    },
    // 2026-10-15 → 15.10.26 (formato de los asuntos de correo)
    fechaCorta(iso) { return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '—'; },
    hora(isoDT) { return isoDT ? isoDT.slice(11, 16) : ''; },
    fechaHora(isoDT) { return isoDT ? `${fmt.fecha(isoDT)} · ${fmt.hora(isoDT)}` : '—'; },
    num(n, dec = 0) {
      if (n === null || n === undefined || n === '') return '—';
      return Number(n).toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    soles(n) { return n === null || n === undefined ? '—' : 'S/ ' + fmt.num(n, 2); },
    reloj(d) { return `${pad(d.getDate())}-${MESES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; },
    // Días entre una fecha ISO y HOY, en texto
    hace(isoDT) {
      const dias = Math.round((new Date(HOY + 'T12:00:00') - new Date(isoDT.slice(0, 10) + 'T12:00:00')) / 86400000);
      if (dias <= 0) return 'hoy';
      if (dias === 1) return 'ayer';
      return `hace ${dias} días`;
    },
  };

  // Escapa texto para insertarlo en HTML.
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // "Corporación Aldajar Eirl" y "CORPORACION ALDAJAR E.I.R.L." → "CORPORACION ALDAJAR"
  function normalizarRazonSocial(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\b(S ?A ?C|S ?A ?A|S ?R ?L|E ?I ?R ?L|S ?A)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Estados del caso (reporte) con su color de chip.
  const ESTADO_CASO = {
    recibido: { label: 'Recibido', tono: 'gris', orden: 1 },
    en_cruce: { label: 'En cruce', tono: 'azul', orden: 2 },
    pendiente_aprobacion: { label: 'Pendiente de aprobación', tono: 'naranja', orden: 3 },
    con_observaciones: { label: 'Con observaciones', tono: 'rojo', orden: 4 },
    en_sap: { label: 'En SAP', tono: 'celeste', orden: 5 },
    nc_emitida: { label: 'NC emitida', tono: 'violeta', orden: 6 },
    cerrado: { label: 'Cerrado (correo enviado)', tono: 'verde', orden: 7 },
  };

  // Estados del cruce por registro.
  const ESTADO_CRUCE = {
    'LLENADO': { tono: 'verde' },
    'YA REGISTRADO': { tono: 'gris' },
    'SIN FACTURA EN BBDD': { tono: 'rojo' },
    'SIN COINCIDENCIA DE UNIDADES': { tono: 'rojo' },
    'CONFLICTO': { tono: 'rojo' },
    'REVISAR': { tono: 'naranja' },
  };

  const FLUJO = {
    despacho: { label: 'Despacho', tono: 'azul' },
    postdescarga: { label: 'Post descarga', tono: 'violeta' },
  };

  function chip(texto, tono = 'gris', extra = '') {
    return `<span class="chip c-${tono} ${extra}">${esc(texto)}</span>`;
  }
  const chipEstadoCaso = (e) => chip(ESTADO_CASO[e]?.label ?? e, ESTADO_CASO[e]?.tono);
  const chipCruce = (e) => chip(e, ESTADO_CRUCE[e]?.tono);
  const chipFlujo = (f) => chip(FLUJO[f]?.label ?? f, FLUJO[f]?.tono, 'chip--sin-punto');
  const sinDato = () => '<span class="chip c-gris chip--mono">• Sin dato</span>';

  // Íconos de trazo (24×24). Se insertan como SVG en línea.
  const P = {
    panel: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    casos: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    camion: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    descarga: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
    aprobar: '<path d="M9 12.5 11 14.5 15.5 10"/><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sap: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
    subir: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    envios: '<path d="m22 3-9.5 9.5"/><path d="M22 3 15.5 21l-3-8.5L4 9.5z"/>',
    dashboard: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    devoluciones: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    recibido: '<path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7"/><path d="M4 13h4l1.5 3h5L16 13h4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    cruce: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
    nc: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    correo: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alerta: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    guion: '<path d="M7 12h10"/>',
    obra: '<path d="M3 21h18"/><path d="M5 21V10l7-6 7 6v11"/><path d="M9 21v-6h6v6"/>',
  };
  function icono(nombre) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nombre] || ''}</svg>`;
  }

  window.U = { HOY, fmt, esc, normalizarRazonSocial, ESTADO_CASO, ESTADO_CRUCE, FLUJO, chip, chipEstadoCaso, chipCruce, chipFlujo, sinDato, icono };
})();
