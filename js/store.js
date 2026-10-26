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

  // ---------- SAP: etapas por registro ----------
  const ETAPAS = ['pedido', 'entrega', 'traslado', 'nc', 'sunat'];
  const ETAPA_LABEL = { pedido: 'Pedido VA01', entrega: 'Entrega VL01N', traslado: 'Traslado MIGO 321', nc: 'NC', sunat: 'SUNAT' };
  const PREFIJO = { pedido: '20', entrega: '40', traslado: '49' };
  const ESTADOS_SAP = ['en_sap', 'con_observaciones', 'nc_emitida', 'cerrado'];

  function siguienteNumero(etapa) {
    const nums = DB.documento_sap.filter((d) => d.etapa === etapa && d.numero).map((d) => Number(d.numero));
    return String(nums.length ? Math.max(...nums) + 7 : Number(PREFIJO[etapa] + '00000001'));
  }

  // Estado SAP de un registro: documentos, siguiente etapa y error (si lo hay).
  function avanceSap(registroId) {
    const docs = docsDe(registroId);
    const error = docs.find((d) => d.estado === 'error') || null;
    const hechas = ETAPAS.filter((e) => docs.some((d) => d.etapa === e && d.estado === 'completado'));
    const siguiente = error ? error.etapa : ETAPAS.find((e) => !hechas.includes(e)) || null;
    return { docs, error, hechas, siguiente, completo: hechas.length === ETAPAS.length };
  }

  // Registros que están (o estuvieron) en SAP: los que tienen factura en casos aprobados.
  function registrosSap() {
    return DB.reporte.filter((r) => ESTADOS_SAP.includes(r.estado)).flatMap((rep) => {
      const pct = porcentaje(rep) ?? 100;
      return registrosDe(rep.id).map((reg) => ({ rep, reg, cruce: cruceDe(reg.id), pct }))
        .filter((x) => x.cruce && x.cruce.estado === 'LLENADO' && x.cruce.factura_id)
        .map((x) => ({ ...x, factura: facturas[x.cruce.factura_id], avance: avanceSap(x.reg.id) }));
    });
  }

  function crearLineaNc(fac, und, kg) {
    const nros = DB.factura_sap.filter((f) => f.tipo === 'NC').map((f) => Number(f.nro_factura.split('--')[1]));
    const docs = DB.factura_sap.filter((f) => f.tipo !== 'FA').map((f) => Number(f.doc_facturacion));
    const fila = {
      ...fac, id: Math.max(...DB.factura_sap.map((f) => f.id)) + 1, fecha_factura: window.U.HOY,
      nro_factura: `07-F030--${String(Math.max(...nros) + 1).padStart(7, '0')}`, doc_facturacion: String(Math.max(...docs) + 11),
      ctd_factura: -und, peso_neto: -kg, valor_neto: -Math.round((fac.valor_neto / fac.peso_neto) * kg * 100) / 100,
      tipo: 'NC', factura_ref: fac.nro_factura,
    };
    DB.factura_sap.push(fila);
    facturas[fila.id] = fila;
    return fila;
  }

  // Registra la siguiente etapa de un registro (o reprocesa la que tiene error).
  function avanzarSap(registroId, actor) {
    const reg = DB.registro.find((r) => r.id === registroId);
    const rep = DB.reporte.find((r) => r.id === reg.reporte_id);
    const av = avanceSap(registroId);
    if (av.completo) return null;
    const fecha = ahora();
    if (av.error) {
      Object.assign(av.error, { estado: 'completado', numero: siguienteNumero(av.error.etapa), fecha, mensaje: 'Liberado y reprocesado' });
      registrarEvento(rep, actor, 'sap', `${ETAPA_LABEL[av.error.etapa]} de ${reg.placa} (${reg.sexo.toLowerCase()}) reprocesado tras liberar el bloqueo.`);
      return av.error;
    }
    const etapa = av.siguiente;
    let numero, mensaje;
    if (etapa === 'nc' || etapa === 'sunat') {
      const cr = cruceDe(registroId);
      const pct = porcentaje(rep) ?? 100;
      if (etapa === 'nc') {
        const und = Math.round((cr.und * pct) / 100);
        const kg = Math.round(cr.kg * pct) / 100;
        const linea = crearLineaNc(facturas[cr.factura_id], und, kg);
        numero = linea.doc_facturacion;
        mensaje = 'NC creada desde el pool de facturación';
      } else {
        const nc = av.docs.find((d) => d.etapa === 'nc');
        numero = DB.factura_sap.find((f) => f.doc_facturacion === nc.numero).nro_factura;
        mensaje = 'Aceptada por SUNAT';
      }
    } else {
      numero = siguienteNumero(etapa);
      mensaje = { pedido: 'Pedido de devolución creado', entrega: 'Entrega y entrada de mercancías registradas', traslado: 'Mov. 321: calidad → libre utilización' }[etapa];
    }
    const doc = { id: Math.max(0, ...DB.documento_sap.map((d) => d.id)) + 1, registro_id: registroId, etapa, numero, fecha, clase: etapa === 'pedido' ? 'ZRE3' : null, estado: 'completado', mensaje };
    DB.documento_sap.push(doc);

    // ¿Todos los registros del caso llegaron a SUNAT? → NC emitida.
    if (etapa === 'sunat' && rep.estado === 'en_sap') {
      const pendientes = registrosSap().filter((x) => x.rep.id === rep.id && !x.avance.completo);
      if (!pendientes.length) {
        rep.estado = 'nc_emitida';
        const n = registrosSap().filter((x) => x.rep.id === rep.id).length;
        registrarEvento(rep, 'SUNAT', 'sunat', `${n} NC aceptadas por SUNAT. Listo para el correo al auditor.`);
      }
    }
    return doc;
  }

  // ---------- Correo de NC ----------
  // Filas del correo: una por NC emitida (columnas en el orden del correo actual).
  function filasCorreo(c) {
    if (c.correo) return c.correo.filas;
    return c.ncs.map((d) => {
      const reg = DB.registro.find((r) => r.id === d.registro_id);
      const cr = cruceDe(reg.id);
      const f = facturas[cr.factura_id];
      const nc = DB.factura_sap.find((x) => x.doc_facturacion === d.numero);
      const und = -nc.ctd_factura;
      const kg = -nc.peso_neto;
      return {
        fecha_factura: f.fecha_factura, nro_factura: f.nro_factura, ctd_factura: f.ctd_factura, peso_neto: f.peso_neto,
        placa: reg.placa, gr: reg.guia, cliente: f.cliente_codigo, razon_social: f.razon_social, denom_centro: f.denom_centro,
        centro: f.centro, material: f.material, factura: f.doc_facturacion, lote: f.lote, und, kg,
        prom: Math.round((kg / und) * 100) / 100, v_net_dev: Math.round((f.valor_neto / f.peso_neto) * kg * 100) / 100,
      };
    });
  }

  function enviarCorreo(numero, actor) {
    const rep = reportePorNumero(numero);
    const c = caso(rep);
    const correo = {
      id: DB.correo.length + 1, reporte_id: rep.id, para: c.auditor.correo, cc: 'facturacion@sanfernando.example',
      asunto: `RE: ${rep.asunto_correo}`, fecha_envio: ahora(), enviado_por: actor, filas: filasCorreo(c),
    };
    DB.correo.push(correo);
    rep.estado = 'cerrado';
    registrarEvento(rep, actor, 'correo', `Correo de NC enviado a ${correo.para} en respuesta al mismo hilo.`);
    return correo;
  }

  // ---------- Facturación diaria (extracción ZSDR005) ----------
  function calendarioExtraccion(desde = '2026-10-01', hasta = window.U.HOY) {
    const dias = [];
    for (let d = new Date(desde + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const cargas = DB.extraccion_sap.filter((e) => e.fecha_facturacion === iso);
      const lineas = DB.factura_sap.filter((f) => f.fecha_factura === iso);
      let estado = 'cargado';
      if (!cargas.length) estado = iso >= window.U.HOY ? 'por_cargar' : 'hueco';
      else if (cargas.some((e) => e.estado === 'duplicado')) estado = 'duplicado';
      dias.push({ fecha: iso, estado, cargas, lineas });
    }
    return dias;
  }

  // Registros sin factura cuya ventana de fechas (saca ±1) incluye este día.
  function afectadosPorDia(fecha) {
    return DB.registro.filter((reg) => {
      const cr = cruceDe(reg.id);
      if (!cr || cr.estado !== 'SIN FACTURA EN BBDD') return false;
      const rep = DB.reporte.find((r) => r.id === reg.reporte_id);
      const dif = Math.abs((new Date(fecha + 'T12:00:00Z') - new Date(rep.fecha_saca + 'T12:00:00Z')) / 86400000);
      return dif <= 1;
    });
  }

  // Simula cargar el Excel de SAP de un día faltante: agrega sus líneas y vuelve a cruzar los registros afectados.
  function cargarExtraccion(fecha, actor) {
    const nuevas = [];
    const sig = { nro: Math.max(...DB.factura_sap.filter((f) => f.tipo === 'FA').map((f) => Number(f.nro_factura.split('--')[1]))),
      doc: Math.max(...DB.factura_sap.filter((f) => f.tipo === 'FA').map((f) => Number(f.doc_facturacion))),
      lote: Math.max(...DB.factura_sap.map((f) => Number(f.lote.slice(2)))) };
    const centros = [...new Map(DB.factura_sap.map((f) => [f.centro, f.denom_centro])).entries()];
    const linea = (cli, sexo, ctd, i) => {
      const mat = sexo === 'Macho' ? '45138' : '42243';
      const [centro, denom] = centros[i % centros.length];
      const peso = Math.round(ctd * (sexo === 'Macho' ? 2.9 : 2.5) * 100) / 100;
      const id = Math.max(...DB.factura_sap.map((f) => f.id)) + 1;
      const fila = {
        id, fecha_factura: fecha, nro_factura: `01-F030--${String(++sig.nro).padStart(7, '0')}`, doc_facturacion: String(sig.doc += 23),
        cliente_codigo: cli.codigo, razon_social: cli.razon_social, denom_centro: denom, centro, material: mat,
        material_desc: sexo === 'Macho' ? 'POLLO VIVO MACHO' : 'POLLO VIVO HEMBRA', sexo, lote: `PG${sig.lote += 9}`,
        ctd_factura: ctd, peso_neto: peso, valor_neto: Math.round(peso * 8.2 * 100) / 100, placa: null, guia: null, tipo: 'FA', factura_ref: null,
      };
      DB.factura_sap.push(fila);
      facturas[id] = fila;
      nuevas.push(fila);
    };
    // Facturas de los registros que estaban sin factura por este hueco.
    const afectados = afectadosPorDia(fecha);
    afectados.forEach((reg, i) => {
      const cli = DB.cliente.find((c) => window.Cruce.normalizar(c.razon_social) === window.Cruce.normalizar(reg.razon_social));
      if (cli) linea(cli, reg.sexo, reg.carga_aves, i);
    });
    // Resto de la facturación del día.
    for (let i = 0; i < 8; i++) linea(DB.cliente[(i * 3 + fecha.charCodeAt(9)) % DB.cliente.length], i % 2 ? 'Hembra' : 'Macho', 1850 + ((i * 397) % 1600), i + 1);

    DB.extraccion_sap.push({
      id: Math.max(...DB.extraccion_sap.map((e) => e.id)) + 1, fecha_facturacion: fecha,
      archivo: `ZSDR005_RALDAZA_${fecha.replace(/-/g, '')}.xlsx`, fecha_carga: ahora(), filas: nuevas.length, usuario: actor, estado: 'cargado',
    });

    // Volver a cruzar los afectados.
    const resueltos = [];
    for (const reg of afectados) {
      const rep = DB.reporte.find((r) => r.id === reg.reporte_id);
      const nuevo = window.Cruce.cruzarRegistro(reg, rep.fecha_saca, DB.factura_sap);
      const cr = cruceDe(reg.id);
      Object.assign(cr, nuevo);
      if (nuevo.estado === 'LLENADO') {
        resueltos.push(reg);
        registrarEvento(rep, 'Sistema', 'cruce', `Se cargó la extracción SAP del ${window.U.fmt.fecha(fecha)}: el registro ${reg.placa} (${reg.sexo.toLowerCase()}) ahora tiene factura.`);
        if (rep.estado === 'con_observaciones' && !caso(rep).pendientes.length) rep.estado = 'en_sap';
      }
    }
    return { filas: nuevas.length, resueltos };
  }

  function descartarDuplicado(id) {
    const i = DB.extraccion_sap.findIndex((e) => e.id === id && e.estado === 'duplicado');
    if (i >= 0) DB.extraccion_sap.splice(i, 1);
  }

  // ---------- Portal auditor ----------
  const siguienteNumeroReporte = () => Math.max(...DB.reporte.map((r) => r.numero)) + 1;

  // Crea el caso a partir del archivo que sube el auditor (estado Recibido).
  function crearReporte({ flujo, fechaSaca, archivo, filas, auditorId, actor, comentario }) {
    const numero = siguienteNumeroReporte();
    const rep = {
      id: Math.max(...DB.reporte.map((r) => r.id)) + 1, numero, flujo, fecha_saca: fechaSaca, fecha_envio: ahora(), auditor_id: auditorId,
      asunto_correo: window.U.asuntoReporte(flujo, numero, fechaSaca), archivo, estado: 'recibido',
    };
    DB.reporte.push(rep);
    let id = Math.max(...DB.registro.map((r) => r.id));
    for (const f of filas) {
      DB.registro.push({ id: ++id, reporte_id: rep.id, ...f, procede: f.und_reconocer > 0 && f.kg_reconocer > 0 });
    }
    const aud = auditores[auditorId];
    const proceden = filas.filter((f) => f.und_reconocer > 0 && f.kg_reconocer > 0).length;
    registrarEvento(rep, actor, 'recepcion', `${aud.nombre} envió "${archivo}" (${filas.length} registros).${comentario ? ` Comentario: "${comentario}"` : ''}`);
    registrarEvento(rep, 'Sistema', 'recepcion', `Archivo leído: ${filas.length} registros, ${proceden} proceden a NC. En cola para el cruce.`);
    return rep;
  }

  window.S = {
    auditores, facturas, cruceDe, reportePorNumero, registrosDe, docsDe, eventosDe, porcentaje,
    caso, casos, motivoAtencion, severidad, saldoFacturas,
    impacto, ejecutarCruce, asignarFactura, pasarASap, aprobar, rechazar,
    ETAPAS, ETAPA_LABEL, avanceSap, registrosSap, avanzarSap, filasCorreo, enviarCorreo,
    calendarioExtraccion, afectadosPorDia, cargarExtraccion, descartarDuplicado,
    siguienteNumeroReporte, crearReporte,
  };
})();
