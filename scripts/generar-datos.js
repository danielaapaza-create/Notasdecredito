// Genera los datos ficticios del prototipo en data/*.js.
// Cada archivo es una "tabla" (arreglo de filas planas) para que el paso a SQL sea directo.
// Uso: node scripts/generar-datos.js
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- utilidades ----------
let seed = 20261026;
function rnd() { // mulberry32 (determinístico)
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n, w) => String(n).padStart(w, '0');

function addDays(iso, d) {
  const dt = new Date(iso + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
}
function isoWeek(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
const ddmmyy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
const ts = (iso, hh, mm) => `${iso}T${pad(hh, 2)}:${pad(mm, 2)}:00`;

// Días sin extracción SAP (huecos) y días cargados dos veces (duplicados).
const HUECOS = ['2026-10-17', '2026-10-24'];
const DUPLICADOS = ['2026-10-09', '2026-10-20'];
const noHueco = (iso) => { while (HUECOS.includes(iso)) iso = addDays(iso, 1); return iso; };

// ---------- maestros ----------
const auditor = [
  { id: 1, nombre: 'Consultora Avícola Sur S.A.C.', contacto: 'Carmen Vargas', correo: 'reportes@avicolasur.example', flujo_habitual: 'despacho' },
  { id: 2, nombre: 'Control Pecuario Andino E.I.R.L.', contacto: 'Luis Paredes', correo: 'evaluaciones@pecuarioandino.example', flujo_habitual: 'postdescarga' },
];

// nombre_auditor = como lo escribe el auditor en su Excel; razon_social = como figura en SAP.
const cliente = [
  { codigo: '1000231', nombre_corto: 'LOS ANDES', razon_social: 'AVICOLA LOS ANDES S.A.C.', nombre_auditor: 'Avícola Los Andes SAC', ruc: '20512345671', zona: 'Ayacucho', correo: 'compras@losandes.example' },
  { codigo: '1000245', nombre_corto: 'ALDAJAR', razon_social: 'CORPORACION ALDAJAR E.I.R.L.', nombre_auditor: 'Corporación Aldajar Eirl', ruc: '20603456782', zona: 'Ayacucho', correo: 'administracion@aldajar.example' },
  { codigo: '1000262', nombre_corto: 'WARI', razon_social: 'DISTRIBUIDORA AVICOLA WARI S.A.C.', nombre_auditor: 'Distribuidora Avícola Wari S.A.C.', ruc: '20534567893', zona: 'Ayacucho', correo: 'pedidos@wari.example' },
  { codigo: '1000278', nombre_corto: 'HUAMANGA', razon_social: 'COMERCIAL HUAMANGA POLLOS E.I.R.L.', nombre_auditor: 'Comercial Huamanga Pollos EIRL', ruc: '20545678904', zona: 'Ayacucho', correo: 'ventas@huamangapollos.example' },
  { codigo: '1000290', nombre_corto: 'CHANKA', razon_social: 'INVERSIONES CHANKA S.R.L.', nombre_auditor: 'Inversiones Chanka SRL', ruc: '20556789015', zona: 'Apurímac', correo: 'contabilidad@chanka.example' },
  { codigo: '1000304', nombre_corto: 'ABANCAY', razon_social: 'NEGOCIOS AVICOLAS ABANCAY S.A.C.', nombre_auditor: 'Negocios Avícolas Abancay S.A.C.', ruc: '20567890126', zona: 'Apurímac', correo: 'facturas@nabancay.example' },
  { codigo: '1000317', nombre_corto: 'SAN CRISTOBAL', razon_social: 'AGROPECUARIA SAN CRISTOBAL E.I.R.L.', nombre_auditor: 'Agropecuaria San Cristóbal E.I.R.L.', ruc: '20578901237', zona: 'Ayacucho', correo: 'gerencia@sancristobal.example' },
  { codigo: '1000329', nombre_corto: 'ANDAHUAYLAS', razon_social: 'POLLERIA MERCADO ANDAHUAYLAS S.A.C.', nombre_auditor: 'Pollería Mercado Andahuaylas SAC', ruc: '20589012348', zona: 'Apurímac', correo: 'compras@mercadoandahuaylas.example' },
  { codigo: '1000336', nombre_corto: 'VILCAS', razon_social: 'COMERCIALIZADORA VILCAS S.A.', nombre_auditor: 'Comercializadora Vilcas S.A.', ruc: '20590123459', zona: 'Ayacucho', correo: 'logistica@vilcas.example' },
  { codigo: '1000348', nombre_corto: 'PAMPAS DEL SUR', razon_social: 'AVICOLA PAMPAS DEL SUR E.I.R.L.', nombre_auditor: 'Avícola Pampas del Sur EIRL', ruc: '20601234560', zona: 'Apurímac', correo: 'admin@pampasdelsur.example' },
];
const PESO_CLIENTE = [3, 4, 2, 2, 2, 2, 1, 2, 1, 1]; // Aldajar aparece más (demo del portal cliente)
function pickCliente() {
  const total = PESO_CLIENTE.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < cliente.length; i++) { x -= PESO_CLIENTE[i]; if (x < 0) return cliente[i]; }
  return cliente[0];
}

const usuario = [
  { id: 1, nombre: 'Rosa Quispe', perfil: 'analista', correo: 'rquispe@sanfernando.example', auditor_id: null, cliente_codigo: null },
  { id: 2, nombre: 'Jorge Huamán', perfil: 'jefe', correo: 'jhuaman@sanfernando.example', auditor_id: null, cliente_codigo: null },
  { id: 3, nombre: 'Carmen Vargas', perfil: 'auditor', correo: 'reportes@avicolasur.example', auditor_id: 1, cliente_codigo: null },
  { id: 4, nombre: 'Luis Paredes', perfil: 'auditor', correo: 'evaluaciones@pecuarioandino.example', auditor_id: 2, cliente_codigo: null },
  { id: 5, nombre: 'Martha Aldana', perfil: 'cliente', correo: 'administracion@aldajar.example', auditor_id: null, cliente_codigo: '1000245' },
];

const CENTROS = [
  { centro: '4020', denom: 'Plantel 402 Huanta', plantel: 'Plantel 402', serie: 'OE110' },
  { centro: '4050', denom: 'Plantel 405 Huamanga', plantel: 'Plantel 405', serie: 'OE106' },
  { centro: '4110', denom: 'Plantel 411 Andahuaylas', plantel: 'Plantel 411', serie: 'OE114' },
  { centro: '4130', denom: 'Plantel 413 Abancay', plantel: 'Plantel 413', serie: 'OE118' },
];
const guiaSeq = { OE110: 431, OE106: 262, OE114: 518, OE118: 377 };
const nuevaGuia = (c) => `${c.serie}-${pad(guiaSeq[c.serie]++, 7)}`;

const usadas = new Set();
function nuevaPlaca() {
  const L = 'ABCDFGHKMPRTVWXZ';
  let p;
  do { p = `${pick(L)}${pick(L)}${int(1, 9)}-${pad(int(100, 999), 3)}`; } while (usadas.has(p));
  usadas.add(p); return p;
}
let loteSeq = 2021400;
const nuevoLote = () => `PG${loteSeq += int(3, 19)}`;

const MATERIAL = {
  Macho: [{ codigo: '45138', desc: 'POLLO VIVO MACHO' }, { codigo: '133261', desc: 'POLLO VIVO MACHO CLASIF.' }],
  Hembra: [{ codigo: '42243', desc: 'POLLO VIVO HEMBRA' }, { codigo: '133262', desc: 'POLLO VIVO HEMBRA CLASIF.' }],
};

// ---------- facturas (se numeran al final, ordenadas por fecha) ----------
const facturas = []; // { fecha, cli, centro, placa, guia, lineas: [...] }
function linea(sexo, ctd) {
  const mat = pick(MATERIAL[sexo]);
  const pesoProm = sexo === 'Macho' ? 2.75 + rnd() * 0.35 : 2.35 + rnd() * 0.3;
  const peso = r2(ctd * pesoProm);
  const precio = 7.8 + rnd() * 0.8;
  return { sexo, material: mat.codigo, material_desc: mat.desc, lote: nuevoLote(), ctd, peso, valor: r2(peso * precio) };
}
const carga = () => int(36, 70) * 50 + pick([0, 0, 10, 20, 30, 40]);
function nuevaFactura(fecha, sexos, opts = {}) {
  const c = opts.centro || pick(CENTROS);
  const f = {
    fecha, cli: opts.cli || pickCliente(), centro: c, placa: opts.placa || nuevaPlaca(), guia: opts.guia || nuevaGuia(c),
    lineas: sexos.map((s) => linea(s, carga())),
  };
  facturas.push(f);
  return f;
}

// ---------- casos ----------
const PLANES = [
  { numero: 280, flujo: 'despacho', saca: '2026-10-05', envio: ts('2026-10-06', 8, 12), estado: 'cerrado', plan: ['mf', 'mf', 'm', 'lotes', 'np'] },
  { numero: 281, flujo: 'postdescarga', saca: '2026-10-05', envio: ts('2026-10-07', 18, 40), estado: 'cerrado', plan: ['reuse:280:0', 'reuse:280:1', 'reuse:280:2', 'reuse:280:3', 'reuse:280:5'], pct: 50 },
  { numero: 282, flujo: 'despacho', saca: '2026-10-08', envio: ts('2026-10-09', 7, 55), estado: 'cerrado', plan: ['mf', 'm', 'h', 'dos', 'pm1', 'np'] },
  { numero: 283, flujo: 'despacho', saca: '2026-10-12', envio: ts('2026-10-13', 8, 30), estado: 'nc_emitida', plan: ['mf', 'mf', 'm', 'pm1', 'np'] },
  { numero: 284, flujo: 'postdescarga', saca: '2026-10-12', envio: ts('2026-10-14', 19, 5), estado: 'en_sap', plan: ['reuse:283:0', 'reuse:283:1', 'reuse:283:2', 'reuse:283:3', 'reuse:283:4', 'reuse:283:5'], pct: 70 },
  { numero: 285, flujo: 'despacho', saca: '2026-10-13', envio: ts('2026-10-14', 8, 5), estado: 'con_observaciones', plan: ['mf', 'm', 'sinfac', 'yareg', 'dos', 'np', 'h'] },
  { numero: 286, flujo: 'despacho', saca: '2026-10-14', envio: ts('2026-10-15', 7, 48), estado: 'en_sap', plan: ['mf', 'mf', 'm', 'h', 'np'] },
  { numero: 287, flujo: 'despacho', saca: '2026-10-15', envio: ts('2026-10-16', 8, 20), estado: 'cerrado', plan: ['mf', 'mf', 'm', 'lotes', 'np'] },
  { numero: 288, flujo: 'postdescarga', saca: '2026-10-19', envio: ts('2026-10-21', 18, 15), estado: 'pendiente_aprobacion', plan: ['mf', 'mf', 'm', 'h'] },
  { numero: 289, flujo: 'despacho', saca: '2026-10-21', envio: ts('2026-10-22', 8, 2), estado: 'en_cruce', plan: ['mf', 'm', 'sincoinc', 'conflicto', 'revisar', 'pm1', 'np'] },
  { numero: 290, flujo: 'postdescarga', saca: '2026-10-23', envio: ts('2026-10-25', 17, 50), estado: 'pendiente_aprobacion', plan: ['mf', 'm', 'h', 'sinfac_hueco', 'pm1'] },
  { numero: 291, flujo: 'despacho', saca: '2026-10-25', envio: ts('2026-10-26', 8, 41), estado: 'recibido', plan: ['mf', 'mf', 'm', 'h', 'np'] },
];

const reporte = [];
const registro = [];
const cruceTmp = []; // con referencias a objetos factura/linea; se resuelve tras numerar
const porReporte = {}; // numero -> [registros internos]
let regId = 1;

function muertosDespacho() { return int(4, 38); }
function muertosPost() { return int(2, 22); }

for (const [i, p] of PLANES.entries()) {
  const aud = p.flujo === 'despacho' ? auditor[0] : auditor[1];
  const sem = isoWeek(p.saca);
  const etiqueta = p.flujo === 'despacho' ? 'Mort Prov' : 'Evaluación Postdescarga';
  const rep = {
    id: i + 1, numero: p.numero, flujo: p.flujo, fecha_saca: p.saca, fecha_envio: p.envio, auditor_id: aud.id,
    asunto_correo: `Envío de reporte ${p.numero}. Semana ${sem}_${etiqueta}_${ddmmyy(p.saca)}`,
    archivo: p.flujo === 'despacho' ? `Mort Pro ${p.numero} Ayacucho y Apurímac.xlsx` : `EVALUACIÓN POSTDESCARGA ${p.numero}.xlsx`,
    estado: p.estado,
  };
  reporte.push(rep);
  porReporte[p.numero] = [];

  const addReg = (f, lineasReg, extra = {}) => {
    const cli = extra.cli || f.cli;
    const cargaAves = extra.carga ?? lineasReg.reduce((a, l) => a + l.ctd, 0);
    const procede = extra.procede ?? true;
    const muertos = extra.muertos ?? (p.flujo === 'despacho' ? muertosDespacho() : muertosPost());
    const und = procede ? (extra.und ?? muertos) : 0;
    const pesoProm = lineasReg[0] ? lineasReg[0].peso / lineasReg[0].ctd : 2.7;
    const kg = procede ? (extra.kg ?? r2(und * pesoProm * (0.96 + rnd() * 0.08))) : 0;
    const reg = {
      id: regId++, reporte_id: rep.id, cliente: cli.nombre_corto, razon_social: extra.razon ?? cli.nombre_auditor,
      placa: f.placa, guia: extra.guia ?? f.guia, plantel: f.centro.plantel, galpon: `G-${pad(int(1, 14), 2)}`,
      sexo: lineasReg[0]?.sexo ?? extra.sexo, carga_aves: cargaAves, muertos, und_reconocer: und, kg_reconocer: kg, procede,
    };
    registro.push(reg);
    porReporte[p.numero].push({ reg, f, lineasReg, extra });
    return reg;
  };

  for (const paso of p.plan) {
    const [tipo, ref, idx] = paso.split(':');
    if (tipo === 'mf') {
      const f = nuevaFactura(p.saca, ['Macho', 'Hembra']);
      for (const l of f.lineas) {
        const reg = addReg(f, [l]);
        cruceTmp.push({ reg, rep, fs: [f], lineas: [l], estado: 'LLENADO', detalle: 'Coincide fecha, razón social, sexo y unidades.' });
      }
    } else if (tipo === 'm' || tipo === 'h') {
      const f = nuevaFactura(p.saca, [tipo === 'm' ? 'Macho' : 'Hembra']);
      const reg = addReg(f, f.lineas);
      cruceTmp.push({ reg, rep, fs: [f], lineas: f.lineas, estado: 'LLENADO', detalle: 'Coincide fecha, razón social, sexo y unidades.' });
    } else if (tipo === 'lotes') {
      const f = nuevaFactura(p.saca, ['Macho', 'Macho']);
      const reg = addReg(f, f.lineas);
      cruceTmp.push({ reg, rep, fs: [f], lineas: f.lineas, estado: 'LLENADO', detalle: `La carga suma 2 lotes (${f.lineas[0].ctd} + ${f.lineas[1].ctd}). Se reconoce en el lote de mayor cantidad.` });
    } else if (tipo === 'dos') {
      const cli = pickCliente();
      const f1 = nuevaFactura(p.saca, ['Hembra'], { cli, centro: CENTROS[0] });
      const f2 = nuevaFactura(p.saca, ['Hembra'], { cli, centro: CENTROS[1], placa: f1.placa });
      const reg = addReg(f1, [f1.lineas[0], f2.lineas[0]], { guia: `${f1.guia} y ${f2.guia}` });
      cruceTmp.push({ reg, rep, fs: [f1, f2], lineas: [f1.lineas[0], f2.lineas[0]], estado: 'LLENADO', detalle: 'Registro con 2 guías: la combinación de 2 facturas suma la carga. Todo el reconocimiento va a la factura de mayor cantidad.' });
    } else if (tipo === 'pm1') {
      const desfase = p.saca === '2026-10-23' ? -1 : 1;
      const f = nuevaFactura(noHueco(addDays(p.saca, desfase)), ['Macho']);
      const reg = addReg(f, f.lineas);
      cruceTmp.push({ reg, rep, fs: [f], lineas: f.lineas, estado: 'LLENADO', detalle: `Factura con fecha ${desfase > 0 ? 'posterior' : 'anterior'} en 1 día a la saca (dentro de la tolerancia ±1).` });
    } else if (tipo === 'np') {
      const f = nuevaFactura(p.saca, ['Hembra']);
      addReg(f, f.lineas, { procede: false, muertos: int(0, 3) });
    } else if (tipo === 'sinfac') {
      const c = pick(CENTROS);
      const fake = { cli: cliente[6], centro: c, placa: nuevaPlaca(), guia: nuevaGuia(c), lineas: [] };
      const reg = addReg(fake, [], { sexo: 'Macho', carga: carga() });
      cruceTmp.push({ reg, rep, fs: [], lineas: [], estado: 'SIN FACTURA EN BBDD', detalle: `No hay facturas de ${cliente[6].razon_social} entre ${ddmmyy(addDays(p.saca, -1))} y ${ddmmyy(addDays(p.saca, 1))}.` });
    } else if (tipo === 'sinfac_hueco') {
      // La factura existe en SAP con fecha 24-oct, pero ese día no se extrajo: no está en la BBDD.
      const c = pick(CENTROS);
      const fake = { cli: cliente[4], centro: c, placa: nuevaPlaca(), guia: nuevaGuia(c), lineas: [] };
      const reg = addReg(fake, [], { sexo: 'Hembra', carga: carga() });
      cruceTmp.push({ reg, rep, fs: [], lineas: [], estado: 'SIN FACTURA EN BBDD', detalle: `Sin factura de ${cliente[4].razon_social} entre 22.10.26 y 24.10.26. Falta la extracción SAP del 24.10.26: revisar Facturación diaria.` });
    } else if (tipo === 'yareg') {
      const f = nuevaFactura(p.saca, ['Hembra']);
      const reg = addReg(f, f.lineas);
      cruceTmp.push({ reg, rep, fs: [f], lineas: f.lineas, estado: 'YA REGISTRADO', nc_existente: true, ncManual: true, detalle: 'Ya existe una NC con el mismo cliente, lote, unidades y kg. No se duplica.' });
    } else if (tipo === 'sincoinc') {
      const f = nuevaFactura(p.saca, ['Macho']);
      const reg = addReg(f, f.lineas, { carga: f.lineas[0].ctd + 90 });
      cruceTmp.push({ reg, rep, fs: [f], lineas: f.lineas, estado: 'SIN COINCIDENCIA DE UNIDADES', sinAsignar: true, detalle: `El auditor reporta ${f.lineas[0].ctd + 90} aves; la factura más cercana tiene ${f.lineas[0].ctd}. Ninguna combinación suma la carga.` });
    } else if (tipo === 'conflicto') {
      const f = nuevaFactura(p.saca, ['Hembra']);
      const twin = nuevaFactura(p.saca, ['Hembra'], { cli: f.cli, centro: f.centro });
      twin.lineas[0].ctd = f.lineas[0].ctd;
      const reg = addReg(f, f.lineas);
      cruceTmp.push({ reg, rep, fs: [f, twin], lineas: [f.lineas[0], twin.lineas[0]], estado: 'CONFLICTO', sinAsignar: true, detalle: 'Dos facturas del mismo cliente, fecha y sexo con las mismas unidades. Elegir la correcta.' });
    } else if (tipo === 'revisar') {
      const f = nuevaFactura(p.saca, ['Macho'], { cli: cliente[9] });
      const reg = addReg(f, f.lineas, { razon: 'Avícola Pampas' });
      cruceTmp.push({ reg, rep, fs: [f], lineas: f.lineas, estado: 'REVISAR', sinAsignar: true, detalle: 'Razón social con coincidencia parcial: "Avícola Pampas" vs "AVICOLA PAMPAS DEL SUR E.I.R.L.". Confirmar el cliente.' });
    } else if (tipo === 'reuse') {
      const base = porReporte[ref][Number(idx)];
      const reg = addReg(base.f, base.lineasReg, { cli: base.f.cli, guia: base.reg.guia, carga: base.reg.carga_aves });
      const c0 = cruceTmp.find((c) => c.reg === base.reg);
      cruceTmp.push({ reg, rep, fs: c0.fs, lineas: c0.lineas, estado: 'LLENADO', detalle: `Misma factura que el reporte ${ref} (despacho). Se descuenta del saldo disponible.` });
    }
  }
}

// Relleno: facturación diaria sin reclamos (01 al 25-oct, salvo huecos).
for (let d = '2026-10-01'; d <= '2026-10-25'; d = addDays(d, 1)) {
  if (HUECOS.includes(d)) continue;
  const n = int(5, 6);
  for (let k = 0; k < n; k++) nuevaFactura(d, pick([['Macho'], ['Hembra'], ['Macho', 'Hembra'], ['Macho', 'Hembra']]));
}

// Numeración: facturas ordenadas por fecha.
facturas.sort((a, b) => a.fecha.localeCompare(b.fecha));
let docSeq = 7012458301, nroSeq = 103101;
const factura_sap = [];
let fsId = 1;
for (const f of facturas) {
  f.doc = String(docSeq += int(3, 40));
  f.nro = `01-F030--${pad(nroSeq++, 7)}`;
  for (const l of f.lineas) {
    l.id = fsId++;
    factura_sap.push({
      id: l.id, fecha_factura: f.fecha, nro_factura: f.nro, doc_facturacion: f.doc, cliente_codigo: f.cli.codigo,
      razon_social: f.cli.razon_social, denom_centro: f.centro.denom, centro: f.centro.centro, material: l.material,
      material_desc: l.material_desc, sexo: l.sexo, lote: l.lote, ctd_factura: l.ctd, peso_neto: l.peso, valor_neto: l.valor,
      placa: f.placa, guia: f.guia, tipo: 'FA', factura_ref: null,
    });
  }
}

// ---------- cruce, aprobación, documentos SAP, NC, eventos, correos ----------
const cruce = [];
const aprobacion = [];
const documento_sap = [];
const evento = [];
const correo = [];
let ncDoc = 8003214410, ncNro = 4512, pedSeq = 2000817230, entSeq = 4001562200, trasSeq = 4900883100, evId = 1, docId = 1;

const ETAPAS_SAP = ['pedido', 'entrega', 'traslado', 'nc', 'sunat'];
const ESTADOS_CON_SAP = ['en_sap', 'nc_emitida', 'cerrado', 'con_observaciones'];
const ESTADOS_CON_CRUCE = [...ESTADOS_CON_SAP, 'en_cruce', 'pendiente_aprobacion'];
const ANALISTA = 'Rosa Quispe', JEFE = 'Jorge Huamán';

function addEvento(rep, fecha_hora, actor, tipo, descripcion) {
  evento.push({ id: evId++, reporte_id: rep.id, fecha_hora, actor, tipo, descripcion });
}
function addNcLinea(fecha, fac, l, und, kg) {
  const id = fsId++;
  const precioKg = l.valor / l.peso;
  const fila = {
    id, fecha_factura: fecha, nro_factura: `07-F030--${pad(ncNro++, 7)}`, doc_facturacion: String(ncDoc += int(2, 25)),
    cliente_codigo: fac.cli.codigo, razon_social: fac.cli.razon_social, denom_centro: fac.centro.denom, centro: fac.centro.centro,
    material: l.material, material_desc: l.material_desc, sexo: l.sexo, lote: l.lote, ctd_factura: -und, peso_neto: -kg,
    valor_neto: -r2(precioKg * kg), placa: fac.placa, guia: fac.guia, tipo: 'NC', factura_ref: fac.nro,
  };
  factura_sap.push(fila);
  return fila;
}

const correosFilas = {};
for (const p of PLANES) {
  const rep = reporte.find((r) => r.numero === p.numero);
  const aud = auditor.find((a) => a.id === rep.auditor_id);
  const regs = porReporte[p.numero];
  const procede = regs.filter((x) => x.reg.procede);
  const envio = rep.fecha_envio;
  const d0 = envio.slice(0, 10);
  addEvento(rep, envio, aud.contacto, 'recepcion', `${aud.nombre} envió "${rep.archivo}" (${regs.length} registros).`);
  if (!ESTADOS_CON_CRUCE.includes(p.estado)) {
    addEvento(rep, ts(d0, 8, 42), 'Sistema', 'recepcion', `Archivo leído: ${regs.length} registros, ${procede.length} proceden a NC. En cola para el cruce.`);
    continue;
  }
  const crucesRep = cruceTmp.filter((c) => c.rep === rep);
  const pct = p.pct ?? 100;
  const aprobado = p.flujo === 'despacho' || (p.estado !== 'pendiente_aprobacion');

  // Cruce
  for (const c of crucesRep) {
    let asignada = null;
    if (!c.sinAsignar && c.lineas.length) asignada = c.lineas.reduce((a, b) => (b.ctd > a.ctd ? b : a));
    const fac = asignada ? c.fs.find((f) => f.lineas.includes(asignada)) : null;
    c.asignada = asignada; c.fac = fac;
    cruce.push({
      registro_id: c.reg.id, factura_id: asignada ? asignada.id : null, lote: asignada ? asignada.lote : null,
      und: c.reg.und_reconocer, kg: c.reg.kg_reconocer, estado: c.estado, detalle: c.detalle, nc_existente: !!c.nc_existente,
      candidatas: c.lineas.map((l) => l.id),
    });
    if (c.ncManual) {
      const f = addNcLinea(noHueco(addDays(p.saca, 1)), fac, asignada, c.reg.und_reconocer, c.reg.kg_reconocer);
      c.detalle += ` NC ${f.nro_factura} del ${ddmmyy(f.fecha_factura)}.`;
      cruce[cruce.length - 1].detalle = c.detalle;
    }
  }
  const llenos = crucesRep.filter((c) => c.estado === 'LLENADO');
  const pendientes = crucesRep.filter((c) => !['LLENADO', 'YA REGISTRADO'].includes(c.estado));
  addEvento(rep, ts(d0, int(9, 10), int(0, 59)), 'Sistema', 'cruce',
    `Cruce con facturas SAP: ${llenos.length} con factura${pendientes.length ? `, ${pendientes.length} pendiente${pendientes.length > 1 ? 's' : ''}` : ''}${crucesRep.some((c) => c.nc_existente) ? ', 1 con NC existente' : ''}.`);
  if (p.estado === 'en_cruce') {
    addEvento(rep, ts(d0, 11, 20), ANALISTA, 'observacion', 'Revisando conflictos y diferencias de unidades antes de pasar a SAP.');
    continue;
  }

  // Aprobación (post descarga)
  let dAprob = d0;
  if (p.flujo === 'postdescarga') {
    if (p.estado === 'pendiente_aprobacion') {
      addEvento(rep, ts(d0, 20, 5), ANALISTA, 'aprobacion', 'Caso enviado al jefe de facturación para definir el % de aprobación.');
      continue;
    }
    dAprob = addDays(d0, 1);
    aprobacion.push({ reporte_id: rep.id, porcentaje: pct, aprobador: JEFE, fecha: ts(dAprob, 9, 15), comentario: pct === 50 ? 'Se reconoce el 50 % según acuerdo comercial vigente.' : 'Aprobado al 70 %: evidencia fotográfica completa.', resultado: 'aprobado' });
    addEvento(rep, ts(dAprob, 9, 15), JEFE, 'aprobacion', `Jefe de facturación aprobó el ${pct} % del archivo.`);
  }

  // Documentos SAP por registro
  const tieneTodo = ['nc_emitida', 'cerrado'].includes(p.estado);
  const dSap = addDays(dAprob, p.flujo === 'despacho' ? 0 : 0);
  const dNc = noHueco(addDays(dSap, 1));
  correosFilas[p.numero] = [];
  llenos.forEach((c, k) => {
    let hasta = 5; // cuántas etapas tiene
    let error = null;
    if (p.estado === 'en_sap') hasta = [5, 3, 3, 2, 1, 4, 3][k % 7];
    if (p.estado === 'en_sap' && k === 3) error = 'Pedido bloqueado: el cliente supera el límite de crédito. Liberar en VKM3.';
    if (p.estado === 'con_observaciones') hasta = 3;
    if (!tieneTodo && hasta === 5) hasta = 4;
    const und = Math.round(c.reg.und_reconocer * pct / 100);
    const kg = r2(c.reg.kg_reconocer * pct / 100);
    const nums = {
      pedido: String(pedSeq += int(1, 30)), entrega: String(entSeq += int(1, 30)), traslado: String(trasSeq += int(1, 30)),
    };
    let ncFila = null;
    if (hasta >= 4) {
      ncFila = addNcLinea(dNc, c.fac, c.asignada, und, kg);
      nums.nc = ncFila.doc_facturacion;
      nums.sunat = ncFila.nro_factura;
    }
    ETAPAS_SAP.forEach((etapa, e) => {
      if (e >= hasta) return;
      const fecha = e <= 2 ? ts(dSap, 14 + e, int(0, 59)) : ts(dNc, 9 + (e - 3) * 2, int(0, 59));
      const esError = error && e === hasta - 1;
      documento_sap.push({
        id: docId++, registro_id: c.reg.id, etapa, numero: esError ? null : nums[etapa], fecha,
        clase: etapa === 'pedido' ? (k === 2 && p.flujo === 'despacho' ? 'ZRE4' : 'ZRE3') : null,
        estado: esError ? 'error' : 'completado',
        mensaje: esError ? error : etapa === 'sunat' ? 'Aceptada por SUNAT' : etapa === 'traslado' ? 'Mov. 321: calidad → libre utilización' : etapa === 'entrega' ? 'Entrega y entrada de mercancías registradas' : etapa === 'pedido' ? (k === 2 && p.flujo === 'despacho' ? 'Pedido diferido' : 'Pedido de devolución creado') : 'NC creada desde el pool de facturación',
      });
    });
    if (ncFila) {
      const l = c.asignada, fac = c.fac;
      correosFilas[p.numero].push({
        fecha_factura: fac.fecha, nro_factura: fac.nro, ctd_factura: l.ctd, peso_neto: l.peso, placa: c.reg.placa, gr: c.reg.guia,
        cliente: fac.cli.codigo, razon_social: fac.cli.razon_social, denom_centro: fac.centro.denom, centro: fac.centro.centro,
        material: l.material, factura: fac.doc, lote: l.lote, und, kg, prom: r2(kg / und), v_net_dev: r2((l.valor / l.peso) * kg),
      });
    }
  });
  addEvento(rep, ts(dSap, 14, 2), ANALISTA, 'sap', `Pedidos VA01 creados para ${llenos.length} registros.`);
  if (p.estado === 'con_observaciones') {
    addEvento(rep, ts(dSap, 16, 30), ANALISTA, 'observacion', `${pendientes.length} registro${pendientes.length > 1 ? 's' : ''} sin factura y 1 con NC existente. Se consultó al auditor.`);
    continue;
  }
  if (p.estado === 'en_sap') {
    addEvento(rep, ts(dSap, 16, 10), 'SAP', 'sap', 'Entregas VL01N y traslados MIGO 321 en curso. 1 pedido con bloqueo de crédito.');
    continue;
  }
  addEvento(rep, ts(dSap, 16, 40), ANALISTA, 'sap', 'Entregas VL01N y traslados MIGO 321 completos.');
  addEvento(rep, ts(dNc, 10, 5), 'SAP', 'nc', `${llenos.length} notas de crédito emitidas desde el pool de facturación.`);
  addEvento(rep, ts(dNc, 11, 30), 'SUNAT', 'sunat', `${llenos.length} NC aceptadas por SUNAT.`);
  if (p.estado === 'cerrado') {
    const fechaCorreo = ts(dNc, 21, 10);
    correo.push({
      id: correo.length + 1, reporte_id: rep.id, para: aud.correo, cc: 'facturacion@sanfernando.example',
      asunto: `RE: ${rep.asunto_correo}`, fecha_envio: fechaCorreo, enviado_por: ANALISTA, filas: correosFilas[p.numero],
    });
    addEvento(rep, fechaCorreo, ANALISTA, 'correo', `Correo de NC enviado a ${aud.correo} en respuesta al mismo hilo.`);
  }
}

// Notas de débito (08-): están en la BBDD pero el cruce las ignora.
for (const [d, k] of [['2026-10-07', 3], ['2026-10-22', 11]]) {
  const fac = facturas.filter((f) => f.fecha === d)[k % 4];
  const l = fac.lineas[0];
  factura_sap.push({ ...factura_sap.find((x) => x.id === l.id), id: fsId++, nro_factura: `08-F030--${pad(318 + k, 7)}`,
    doc_facturacion: String(ncDoc += 7), ctd_factura: 0, peso_neto: 0, valor_neto: r2(l.valor * 0.02), tipo: 'ND', factura_ref: fac.nro });
}

// Extracción diaria SAP (ZSDR005, layout /RALDAZA)
const extraccion_sap = [];
let exId = 1;
for (let d = '2026-10-01'; d <= '2026-10-25'; d = addDays(d, 1)) {
  if (HUECOS.includes(d)) continue;
  const filas = factura_sap.filter((f) => f.fecha_factura === d).length;
  const carga = addDays(d, 1);
  extraccion_sap.push({ id: exId++, fecha_facturacion: d, archivo: `ZSDR005_RALDAZA_${d.replace(/-/g, '')}.xlsx`, fecha_carga: ts(carga, 7, int(5, 25)), filas, usuario: ANALISTA, estado: 'cargado' });
  if (DUPLICADOS.includes(d)) {
    extraccion_sap.push({ id: exId++, fecha_facturacion: d, archivo: `ZSDR005_RALDAZA_${d.replace(/-/g, '')} (1).xlsx`, fecha_carga: ts(carga, 11, int(30, 50)), filas, usuario: ANALISTA, estado: 'duplicado' });
  }
}

// ---------- escritura ----------
const tablas = { reporte, registro, factura_sap, cruce, aprobacion, documento_sap, evento, correo, cliente, auditor, usuario, extraccion_sap };
const outDir = path.join(__dirname, '..', 'data');
for (const [nombre, filas] of Object.entries(tablas)) {
  const cuerpo = filas.map((f) => '  ' + JSON.stringify(f)).join(',\n');
  fs.writeFileSync(path.join(outDir, `${nombre}.js`),
    `// Tabla "${nombre}" (${filas.length} filas). Generado por scripts/generar-datos.js: no editar a mano.\n` +
    `window.DB = window.DB || {};\nDB.${nombre} = [\n${cuerpo}\n];\n`);
  console.log(nombre.padEnd(15), filas.length);
}
