// Algoritmo de cruce: busca la factura SAP de cada registro del auditor.
// Reglas: fecha de saca ±1 día, razón social normalizada, sexo por material, unidades = carga,
// 2 guías → combinación de 2 facturas (todo a la de mayor cantidad), se ignoran NC/ND y negativos,
// y si ya existe una NC con el mismo cliente, lote, unidades y kg → YA REGISTRADO.
(function (global) {
  'use strict';

  const SEXO_MATERIAL = { '45138': 'Macho', '133261': 'Macho', '42243': 'Hembra', '133262': 'Hembra' };

  function normalizar(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\b(S ?A ?C|S ?A ?A|S ?R ?L|E ?I ?R ?L|S ?A)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sumarDias(iso, d) {
    const dt = new Date(iso + 'T12:00:00Z');
    dt.setUTCDate(dt.getUTCDate() + d);
    return dt.toISOString().slice(0, 10);
  }
  const ddmmyy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;

  function agruparPorFactura(lineas) {
    const g = new Map();
    for (const l of lineas) {
      if (!g.has(l.nro_factura)) g.set(l.nro_factura, { nro: l.nro_factura, lineas: [], total: 0 });
      const x = g.get(l.nro_factura);
      x.lineas.push(l);
      x.total += l.ctd_factura;
    }
    return [...g.values()];
  }
  const mayorLinea = (lineas) => lineas.reduce((a, b) => (b.ctd_factura > a.ctd_factura ? b : a));

  /**
   * @param reg       fila de `registro`
   * @param fechaSaca fecha de saca del reporte (ISO)
   * @param facturas  filas de `factura_sap`
   * @param opts.ncExcluidas  doc_facturacion de NC que no cuentan como "existentes" (las del propio caso)
   * @returns fila de `cruce` (sin persistir) o null si el registro no procede
   */
  function cruzarRegistro(reg, fechaSaca, facturas, opts = {}) {
    if (!reg.procede) return null;
    const excluidas = new Set(opts.ncExcluidas || []);
    const fechas = [sumarDias(fechaSaca, -1), fechaSaca, sumarDias(fechaSaca, 1)];
    const rango = `${ddmmyy(fechas[0])} y ${ddmmyy(fechas[2])}`;
    const objetivo = normalizar(reg.razon_social);

    // Solo facturas (FA) con cantidad positiva dentro de la tolerancia de fechas.
    const validas = facturas.filter((f) => f.tipo === 'FA' && f.ctd_factura > 0 && fechas.includes(f.fecha_factura));
    const delCliente = validas.filter((f) => normalizar(f.razon_social) === objetivo);
    const resultado = (estado, lineas, asignada, detalle, extra = {}) => ({
      registro_id: reg.id,
      factura_id: asignada ? asignada.id : null,
      lote: asignada ? asignada.lote : null,
      und: reg.und_reconocer,
      kg: reg.kg_reconocer,
      estado,
      detalle,
      nc_existente: false,
      candidatas: lineas.map((l) => l.id),
      ...extra,
    });

    if (!delCliente.length) {
      const parciales = validas.filter((f) => {
        const n = normalizar(f.razon_social);
        return objetivo.length >= 6 && (n.includes(objetivo) || objetivo.includes(n));
      });
      if (parciales.length) {
        const nombres = [...new Set(parciales.map((f) => f.razon_social))];
        const delSexo = parciales.filter((f) => SEXO_MATERIAL[f.material] === reg.sexo);
        return resultado('REVISAR', delSexo.length ? delSexo : parciales, null,
          `Razón social con coincidencia parcial: "${reg.razon_social}" vs "${nombres.join('", "')}". Confirmar el cliente.`);
      }
      return resultado('SIN FACTURA EN BBDD', [], null, `No hay facturas de "${reg.razon_social}" entre ${rango}.`);
    }

    const delSexo = delCliente.filter((f) => SEXO_MATERIAL[f.material] === reg.sexo);
    const grupos = agruparPorFactura(delSexo);
    const exactos = grupos.filter((g) => g.total === reg.carga_aves);
    let elegido = null;
    let detalle = '';

    if (exactos.length > 1) {
      return resultado('CONFLICTO', exactos.flatMap((g) => g.lineas), null,
        `${exactos.length} facturas del mismo cliente, fecha y sexo suman ${reg.carga_aves} aves. Elegir la correcta.`);
    }
    if (exactos.length === 1) {
      elegido = exactos[0].lineas;
      const fecha = elegido[0].fecha_factura;
      detalle = fecha === fechaSaca
        ? 'Coincide fecha, razón social, sexo y unidades.'
        : `Factura con fecha ${fecha > fechaSaca ? 'posterior' : 'anterior'} en 1 día a la saca (dentro de la tolerancia ±1).`;
      if (elegido.length > 1) detalle += ` La carga suma ${elegido.length} lotes; se reconoce en el lote de mayor cantidad.`;
    } else if (/\sy\s/i.test(reg.guia)) {
      // Dos guías en un registro: buscar 2 facturas cuya suma sea la carga.
      const pares = [];
      for (let i = 0; i < grupos.length; i++) {
        for (let j = i + 1; j < grupos.length; j++) {
          if (grupos[i].total + grupos[j].total === reg.carga_aves) pares.push([grupos[i], grupos[j]]);
        }
      }
      if (pares.length > 1) {
        return resultado('CONFLICTO', pares.flat().flatMap((g) => g.lineas), null,
          `${pares.length} combinaciones de 2 facturas suman ${reg.carga_aves} aves. Elegir la correcta.`);
      }
      if (pares.length === 1) {
        const mayor = pares[0].reduce((a, b) => (b.total > a.total ? b : a));
        const asignada = mayorLinea(mayor.lineas);
        const lineas = pares[0].flatMap((g) => g.lineas);
        return conNcExistente(resultado('LLENADO', lineas, asignada,
          `Registro con 2 guías: ${pares[0].map((g) => g.nro).join(' + ')} suman la carga. Todo el reconocimiento va a ${mayor.nro} (mayor cantidad facturada).`), asignada);
      }
    }

    if (!elegido) {
      const cercana = grupos.slice().sort((a, b) => Math.abs(a.total - reg.carga_aves) - Math.abs(b.total - reg.carga_aves))[0];
      return resultado('SIN COINCIDENCIA DE UNIDADES', delSexo, null, cercana
        ? `El auditor reporta ${reg.carga_aves} aves; la factura más cercana (${cercana.nro}) tiene ${cercana.total}. Ninguna combinación suma la carga.`
        : `Hay facturas del cliente entre ${rango}, pero ninguna de ${reg.sexo.toLowerCase()}.`);
    }

    const asignada = mayorLinea(elegido);
    return conNcExistente(resultado('LLENADO', elegido, asignada, detalle), asignada);

    // Si ya existe una NC con el mismo cliente, lote, unidades y kg, no se duplica.
    function conNcExistente(c, linea) {
      const nc = facturas.find((f) => f.tipo === 'NC' && !excluidas.has(f.doc_facturacion) &&
        f.cliente_codigo === linea.cliente_codigo && f.lote === linea.lote &&
        -f.ctd_factura === reg.und_reconocer && Math.abs(-f.peso_neto - reg.kg_reconocer) < 0.005);
      if (!nc) return c;
      return { ...c, estado: 'YA REGISTRADO', nc_existente: true,
        detalle: `Ya existe la NC ${nc.nro_factura} del ${ddmmyy(nc.fecha_factura)} con el mismo cliente, lote, unidades y kg. No se duplica.` };
    }
  }

  const api = { SEXO_MATERIAL, normalizar, cruzarRegistro };
  if (typeof module !== 'undefined') module.exports = api;
  else global.Cruce = api;
})(typeof window !== 'undefined' ? window : globalThis);
