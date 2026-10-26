// Ejecuta el algoritmo de cruce (js/cruce.js) sobre los datos ficticios y lo compara con la tabla `cruce`.
// Uso: node scripts/verificar-cruce.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'data'))) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'), ctx);
}
const DB = ctx.window.DB;
const { cruzarRegistro } = require('../js/cruce.js');

let ok = 0;
const difs = [];
for (const rep of DB.reporte) {
  const regs = DB.registro.filter((r) => r.reporte_id === rep.id);
  const regIds = new Set(regs.map((r) => r.id));
  // Las NC emitidas por el propio caso no cuentan como "existentes".
  const propias = DB.documento_sap.filter((d) => regIds.has(d.registro_id) && d.etapa === 'nc').map((d) => d.numero);
  for (const reg of regs) {
    const guardado = DB.cruce.find((c) => c.registro_id === reg.id);
    const calc = cruzarRegistro(reg, rep.fecha_saca, DB.factura_sap, { ncExcluidas: propias });
    if (rep.estado === 'recibido') continue; // aún sin cruce guardado
    const a = guardado ? `${guardado.estado}|${guardado.factura_id}` : 'sin cruce';
    const b = calc ? `${calc.estado}|${calc.factura_id}` : 'sin cruce';
    if (a === b) ok++;
    else difs.push(`Reporte ${rep.numero} registro ${reg.id} (${reg.placa} ${reg.sexo}): guardado ${a} · algoritmo ${b}${calc ? ' · ' + calc.detalle : ''}`);
  }
}
console.log(`Coinciden ${ok} registros.`);
if (difs.length) { console.log(`Diferencias (${difs.length}):\n` + difs.join('\n')); process.exitCode = 1; }

const r291 = DB.reporte.find((r) => r.estado === 'recibido');
if (r291) {
  console.log(`\nSimulación del reporte ${r291.numero} (recibido):`);
  for (const reg of DB.registro.filter((r) => r.reporte_id === r291.id)) {
    const c = cruzarRegistro(reg, r291.fecha_saca, DB.factura_sap);
    console.log(`  ${reg.placa} ${reg.sexo.padEnd(6)} → ${c ? c.estado : 'no procede'}`);
  }
}
