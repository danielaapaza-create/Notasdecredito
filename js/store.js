// Consultas sobre las tablas de DB (equivalentes a vistas/joins SQL) y acciones simuladas.
// Las acciones modifican DB en memoria: se pierden al recargar la página.
(function () {
  'use strict';
  const DB = window.DB;

  const auditores = Object.fromEntries(DB.auditor.map((a) => [a.id, a]));
  const facturas = Object.fromEntries(DB.factura_sap.map((f) => [f.id, f]));
  const cruceDe = (registroId) => DB.cruce.find((c) => c.registro_id === registroId) || null;
  const reportePorNumero = (n) => DB.reporte.find((r) => String(r.numero) === String(n)) || null;

  function registrosDe(reporteId) { return DB.registro.filter((r) => r.reporte_id === reporteId); }
  function docsDe(registroId) { return DB.documento_sap.filter((d) => d.registro_id === registroId); }
  function eventosDe(reporteId) {
    return DB.evento.filter((e) => e.reporte_id === reporteId).sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
  }

  // % que se reconoce: 100 en despacho; en post descarga, el aprobado por el jefe (null si falta).
  function porcentaje(rep) {
    if (rep.flujo === 'despacho') return 100;
    const a = DB.aprobacion.find((x) => x.reporte_id === rep.id && x.resultado === 'aprobado');
    return a ? a.porcentaje : null;
  }

  // Vista "caso": reporte + auditor + resumen de registros, cruce, SAP y correo.
  function caso(rep) {
    const regs = registrosDe(rep.id);
    const procede = regs.filter((r) => r.procede);
    const crs = regs.map((r) => cruceDe(r.id)).filter(Boolean);
    const porEstado = {};
    for (const c of crs) porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
    const pendientes = crs.filter((c) => !['LLENADO', 'YA REGISTRADO'].includes(c.estado));
    const docs = regs.flatMap((r) => docsDe(r.id));
    const ncs = docs.filter((d) => d.etapa === 'nc' && d.estado === 'completado');
    const errores = docs.filter((d) => d.estado === 'error');
    return {
      ...rep,
      auditor: auditores[rep.auditor_id],
      registros: regs,
      nProcede: procede.length,
      nNoProcede: regs.length - procede.length,
      cruces: crs,
      porEstado,
      pendientes,
      docs,
      ncs,
      errores,
      pct: porcentaje(rep),
      aprobacion: DB.aprobacion.find((a) => a.reporte_id === rep.id) || null,
      correo: DB.correo.find((c) => c.reporte_id === rep.id) || null,
      eventos: eventosDe(rep.id),
      undTotal: procede.reduce((a, r) => a + r.und_reconocer, 0),
      kgTotal: procede.reduce((a, r) => a + r.kg_reconocer, 0),
    };
  }

  function casos() {
    return DB.reporte.map(caso).sort((a, b) => b.fecha_envio.localeCompare(a.fecha_envio));
  }

  // Motivo por el que un caso requiere atención (o null).
  function motivoAtencion(c) {
    const m = [];
    if (c.estado === 'pendiente_aprobacion') m.push('Falta definir el % de aprobación del archivo.');
    if (c.estado === 'recibido') m.push(`Archivo recibido con ${c.registros.length} registros: falta ejecutar el cruce.`);
    const txt = Object.entries(c.porEstado)
      .filter(([e]) => !['LLENADO', 'YA REGISTRADO'].includes(e))
      .map(([e, n]) => `${n} ${e.toLowerCase().replace('bbdd', 'BBDD')}`);
    if (txt.length) m.push(`Cruce: ${txt.join(', ')}.`);
    if (c.porEstado['YA REGISTRADO']) m.push(`${c.porEstado['YA REGISTRADO']} con NC existente (no se duplica).`);
    if (c.errores.length) m.push(`SAP: ${c.errores.length} documento con error (${c.errores[0].mensaje.split(':')[0].toLowerCase()}).`);
    if (c.estado === 'nc_emitida') m.push('NC emitidas: falta enviar el correo al auditor.');
    if (c.estado === 'en_cruce' && !c.pendientes.length) m.push('Cruce completo: listo para pasar a SAP.');
    return m.length ? m : null;
  }

  // Severidad para ordenar la sección "requieren atención".
  function severidad(c) {
    if (c.pendientes.length || c.errores.length) return 0;
    if (c.estado === 'pendiente_aprobacion') return 1;
    return 2;
  }

  // Saldo por línea de factura (lote) usada en el caso: facturado / devuelto en otros casos / este caso / disponible.
  function saldoFacturas(c) {
    const propias = new Set(c.ncs.map((d) => d.numero));
    const filas = [];
    for (const cr of c.cruces) {
      if (!cr.factura_id) continue;
      const f = facturas[cr.factura_id];
      let fila = filas.find((x) => x.factura.id === f.id);
      if (!fila) {
        const ncsLote = DB.factura_sap.filter((x) => x.tipo === 'NC' && x.lote === f.lote && x.cliente_codigo === f.cliente_codigo);
        const otras = ncsLote.filter((x) => !propias.has(x.doc_facturacion));
        fila = {
          factura: f,
          otrasNc: otras,
          otrosUnd: otras.reduce((a, x) => a - x.ctd_factura, 0),
          otrosKg: otras.reduce((a, x) => a - x.peso_neto, 0),
          esteUnd: 0,
          esteKg: 0,
          registros: [],
        };
        filas.push(fila);
      }
      const reg = DB.registro.find((r) => r.id === cr.registro_id);
      fila.registros.push(reg);
      if (cr.estado === 'LLENADO') {
        const pct = c.pct ?? 100;
        fila.esteUnd += Math.round((cr.und * pct) / 100);
        fila.esteKg += Math.round(cr.kg * pct) / 100;
      }
    }
    for (const f of filas) {
      f.dispUnd = f.factura.ctd_factura - f.otrosUnd - f.esteUnd;
      f.dispKg = Math.round((f.factura.peso_neto - f.otrosKg - f.esteKg) * 100) / 100;
    }
    return filas.sort((a, b) => a.factura.nro_factura.localeCompare(b.factura.nro_factura));
  }

  // Impacto de un % sobre los registros con factura: UND, KG y monto (V.NET/DEV).
  // V.NET/DEV = (valor neto / peso neto de la factura) × KG devueltos (supuesto por confirmar).
  function impacto(c, pct) {
    const filas = c.registros.filter((r) => r.procede).map((r) => {
      const cr = cruceDe(r.id);
      const f = cr && cr.estado === 'LLENADO' && cr.factura_id ? facturas[cr.factura_id] : null;
      const und = Math.round((r.und_reconocer * pct) / 100);
      const kg = Math.round(r.kg_reconocer * pct) / 100;
      const monto = f ? Math.round((f.valor_neto / f.peso_neto) * kg * 100) / 100 : null;
      return { registro: r, cruce: cr, factura: f, und, kg, monto };
    });
    const conFactura = filas.filter((x) => x.factura);
    return {
      filas,
      und: conFactura.reduce((a, x) => a + x.und, 0),
      kg: Math.round(conFactura.reduce((a, x) => a + x.kg, 0) * 100) / 100,
      monto: Math.round(conFactura.reduce((a, x) => a + x.monto, 0) * 100) / 100,
      sinFactura: filas.filter((x) => !x.factura),
    };
  }

  // ---------- acciones simuladas ----------
  const ahora = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${window.U.HOY}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  function registrarEvento(rep, actor, tipo, descripcion) {
    DB.evento.push({ id: DB.evento.length + 1000, reporte_id: rep.id, fecha_hora: ahora(), actor, tipo, descripcion });
  }

  function ejecutarCruce(numero, actor) {
    const rep = reportePorNumero(numero);
    let n = 0;
    for (const reg of registrosDe(rep.id)) {
      if (cruceDe(reg.id)) continue;
      const c = window.Cruce.cruzarRegistro(reg, rep.fecha_saca, DB.factura_sap);
      if (c) { DB.cruce.push(c); n++; }
    }
    rep.estado = 'en_cruce';
    const cs = caso(rep);
    registrarEvento(rep, 'Sistema', 'cruce', `Cruce con facturas SAP (ejecutado por ${actor}): ${cs.porEstado['LLENADO'] || 0} con factura${cs.pendientes.length ? `, ${cs.pendientes.length} pendientes` : ''}.`);
    return cs;
  }

  function asignarFactura(registroId, facturaId, actor) {
    const cr = cruceDe(registroId);
    const reg = DB.registro.find((r) => r.id === registroId);
    const rep = DB.reporte.find((r) => r.id === reg.reporte_id);
    const f = facturas[facturaId];
    const anterior = cr.estado;
    Object.assign(cr, {
      factura_id: f.id, lote: f.lote, estado: 'LLENADO',
      detalle: `Asignada manualmente por ${actor} (antes: ${anterior}). Factura ${f.nro_factura}, lote ${f.lote}.`,
    });
    registrarEvento(rep, actor, 'cruce', `Registro ${reg.placa} (${reg.sexo.toLowerCase()}): ${anterior} resuelto con la factura ${f.nro_factura}.`);
  }

  function pasarASap(numero, actor) {
    const rep = reportePorNumero(numero);
    if (rep.flujo === 'postdescarga') {
      rep.estado = 'pendiente_aprobacion';
      registrarEvento(rep, actor, 'aprobacion', 'Caso enviado al jefe de facturación para definir el % de aprobación.');
    } else {
      rep.estado = 'en_sap';
      registrarEvento(rep, actor, 'sap', 'Cruce cerrado. Registros listos para crear pedidos VA01.');
    }
  }

  function aprobar(numero, pct, comentario, actor) {
    const rep = reportePorNumero(numero);
    DB.aprobacion.push({ reporte_id: rep.id, porcentaje: pct, aprobador: actor, fecha: ahora(), comentario: comentario || '', resultado: 'aprobado' });
    rep.estado = 'en_sap';
    registrarEvento(rep, actor, 'aprobacion', `Jefe de facturación aprobó el ${pct} % del archivo.${comentario ? ` "${comentario}"` : ''}`);
  }

  function rechazar(numero, comentario, actor) {
    const rep = reportePorNumero(numero);
    DB.aprobacion.push({ reporte_id: rep.id, porcentaje: 0, aprobador: actor, fecha: ahora(), comentario, resultado: 'rechazado' });
    rep.estado = 'rechazado';
    registrarEvento(rep, actor, 'observacion', `Jefe de facturación rechazó el archivo: "${comentario}"`);
  }

  window.S = {
    auditores, facturas, cruceDe, reportePorNumero, registrosDe, docsDe, eventosDe, porcentaje,
    caso, casos, motivoAtencion, severidad, saldoFacturas,
    impacto, ejecutarCruce, asignarFactura, pasarASap, aprobar, rechazar,
  };
})();
