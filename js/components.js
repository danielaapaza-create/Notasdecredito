// Componentes de interfaz reutilizables (devuelven HTML como texto).
(function () {
  'use strict';
  const { fmt, esc, icono } = window.U;

  function seccionCab(insignia, titulo, nota = '') {
    return `<div class="seccion__cab">
      <span class="insignia">${esc(insignia)}</span>
      <h2 class="seccion__titulo">${esc(titulo)}</h2>
      ${nota ? `<span class="seccion__nota">${nota}</span>` : ''}
    </div>`;
  }

  function kpi({ icono: ic, num, etiqueta, tono, detalle, href }) {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi t-${tono}" ${href ? `href="${href}"` : ''}>
      <span class="kpi__icono">${icono(ic)}</span>
      <span class="kpi__num">${esc(num)}</span>
      <span class="kpi__etq">${esc(etiqueta)}</span>
      ${detalle ? `<span class="kpi__det">${detalle}</span>` : ''}
    </${tag}>`;
  }

  // Etapas del caso para la línea de tiempo.
  // estado de cada paso: hecho | actual | espera | alerta | pend | na
  function etapasCaso(c) {
    const ev = (tipo) => c.eventos.find((e) => e.tipo === tipo);
    const ultimo = (tipo) => [...c.eventos].reverse().find((e) => e.tipo === tipo);
    const orden = window.U.ESTADO_CASO[c.estado].orden;
    const conCruce = !['recibido'].includes(c.estado);
    const pasoSap = ['con_observaciones', 'en_sap', 'nc_emitida', 'cerrado'].includes(c.estado);
    const llenos = c.porEstado['LLENADO'] || 0;

    const pasos = [];
    pasos.push({
      nombre: 'Reporte recibido', icono: 'recibido', estado: 'hecho', fecha: c.fecha_envio,
      desc: `${c.registros.length} registros · ${c.nProcede} proceden`,
    });

    let eCruce = 'pend';
    if (c.estado === 'recibido') eCruce = 'actual';
    else if (c.estado === 'en_cruce') eCruce = c.pendientes.length ? 'alerta' : 'actual';
    else eCruce = 'hecho';
    pasos.push({
      nombre: 'Cruce con facturas SAP', icono: 'cruce', estado: eCruce, fecha: conCruce ? ev('cruce')?.fecha_hora : null,
      desc: conCruce ? `${llenos} con factura${c.pendientes.length ? ` · ${c.pendientes.length} pendiente${c.pendientes.length > 1 ? 's' : ''}` : ''}` : 'En cola',
    });

    if (c.flujo === 'despacho') {
      pasos.push({ nombre: 'Aprobación', icono: 'aprobar', estado: 'na', fecha: null, desc: 'No aplica en despacho' });
    } else {
      const a = c.aprobacion;
      pasos.push({
        nombre: 'Aprobación del jefe', icono: 'aprobar',
        estado: a ? 'hecho' : c.estado === 'pendiente_aprobacion' ? 'espera' : 'pend',
        fecha: a?.fecha, desc: a ? `Aprobado al ${a.porcentaje} %` : c.estado === 'pendiente_aprobacion' ? 'Esperando % de aprobación' : 'Pendiente',
      });
    }

    let eSap = 'pend';
    if (c.estado === 'en_sap') eSap = c.errores.length ? 'alerta' : 'actual';
    else if (c.estado === 'con_observaciones') eSap = 'alerta';
    else if (orden >= 6) eSap = 'hecho';
    const traslados = c.docs.filter((d) => d.etapa === 'traslado' && d.estado === 'completado').length;
    pasos.push({
      nombre: 'Pedido · entrega · traslado', icono: 'sap', estado: eSap, fecha: pasoSap ? ev('sap')?.fecha_hora : null,
      desc: pasoSap ? `${traslados} de ${llenos} registros con traslado` : 'Pendiente',
    });

    pasos.push({
      nombre: 'NC emitidas · SUNAT', icono: 'nc', estado: orden >= 6 ? 'hecho' : 'pend', fecha: ultimo('sunat')?.fecha_hora,
      desc: orden >= 6 ? `${c.ncs.length} NC aceptadas` : c.ncs.length ? `${c.ncs.length} NC emitidas hasta ahora` : 'Pendiente',
    });

    pasos.push({
      nombre: 'Correo al auditor', icono: 'correo',
      estado: c.correo ? 'hecho' : c.estado === 'nc_emitida' ? 'actual' : 'pend', fecha: c.correo?.fecha_envio,
      desc: c.correo ? 'Respuesta en el mismo hilo' : c.estado === 'nc_emitida' ? 'Listo para enviar' : 'Pendiente',
    });
    return pasos;
  }

  function cinta(c) {
    const pasos = etapasCaso(c);
    const iconoPaso = (p) => p.estado === 'hecho' ? icono('check') : p.estado === 'alerta' ? icono('alerta') : p.estado === 'na' ? icono('guion') : icono(p.icono);
    return `<ol class="cinta" style="--n:${pasos.length}" aria-label="Línea de tiempo del caso">
      ${pasos.map((p) => `<li class="cinta__paso cinta__paso--${p.estado}" ${p.estado === 'actual' || p.estado === 'alerta' || p.estado === 'espera' ? 'aria-current="step"' : ''}>
        <span class="cinta__punto">${iconoPaso(p)}</span>
        <span class="cinta__nombre">${esc(p.nombre)}</span>
        <span class="cinta__fecha">${p.fecha ? esc(fmt.fechaHora(p.fecha)) : '&nbsp;'}</span>
        <span class="cinta__desc">${esc(p.desc)}</span>
      </li>`).join('')}
    </ol>`;
  }

  function dato(etq, valorHtml, texto = false) {
    return `<div class="dato"><span class="etiqueta">${esc(etq)}</span><span class="dato__valor${texto ? ' dato__valor--texto' : ''}">${valorHtml}</span></div>`;
  }

  window.C = { seccionCab, kpi, etapasCaso, cinta, dato };
})();
