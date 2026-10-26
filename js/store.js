// Consultas sobre las tablas de DB (equivalentes a vistas/joins SQL).
(function () {
  'use strict';
  const DB = window.DB;

  const porId = (tabla, campo = 'id') => Object.fromEntries(DB[tabla].map((f) => [f[campo], f]));
  const auditores = porId('auditor');
  const facturas = porId('factura_sap');
  const cruces = porId('cruce', 'registro_id');

  function registrosDe(reporteId) { return DB.registro.filter((r) => r.reporte_id === reporteId); }
  function docsDe(registroId) { return DB.documento_sap.filter((d) => d.registro_id === registroId); }
  function eventosDe(reporteId) {
    return DB.evento.filter((e) => e.reporte_id === reporteId).sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
  }

  // Vista "caso": reporte + auditor + resumen de registros, cruce, SAP y correo.
  function caso(rep) {
    const regs = registrosDe(rep.id);
    const procede = regs.filter((r) => r.procede);
    const crs = regs.map((r) => cruces[r.id]).filter(Boolean);
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
    return m.length ? m : null;
  }

  // Severidad para ordenar la sección "requieren atención".
  function severidad(c) {
    if (c.pendientes.length || c.errores.length) return 0;
    if (c.estado === 'pendiente_aprobacion') return 1;
    return 2;
  }

  window.S = { auditores, facturas, cruces, registrosDe, docsDe, eventosDe, caso, casos, motivoAtencion, severidad };
})();
