// Panel general: KPIs del momento, casos que requieren atención y ciclo del último caso cerrado.
(function () {
  'use strict';
  const { fmt, esc, chipEstadoCaso, chipFlujo, HOY } = window.U;
  const { seccionCab, kpi, cinta, dato } = window.C;

  function extraccionAvisos() {
    const ex = window.DB.extraccion_sap;
    const cargados = new Set(ex.map((e) => e.fecha_facturacion));
    const huecos = [];
    const ultimo = ex.map((e) => e.fecha_facturacion).sort().pop();
    for (let d = new Date(ex[0].fecha_facturacion + 'T12:00:00'); d.toISOString().slice(0, 10) <= ultimo; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!cargados.has(iso)) huecos.push(iso);
    }
    const dup = ex.filter((e) => e.estado === 'duplicado').map((e) => e.fecha_facturacion);
    return { huecos, dup };
  }

  function render() {
    const casos = window.S.casos();
    const cuenta = (e) => casos.filter((c) => c.estado === e).length;
    const semana = casos.filter((c) => fmt.hace(c.fecha_envio) === 'hoy' || /hace [1-6] días|ayer/.test(fmt.hace(c.fecha_envio)));
    const ncs = casos.flatMap((c) => c.ncs);
    const errores = casos.flatMap((c) => c.errores);
    const regPend = casos.filter((c) => c.estado === 'en_cruce').reduce((a, c) => a + c.pendientes.length, 0);
    const porAprobar = casos.filter((c) => c.estado === 'pendiente_aprobacion');
    const correos = window.DB.correo.slice().sort((a, b) => b.fecha_envio.localeCompare(a.fecha_envio));
    const montoDevuelto = correos.flatMap((c) => c.filas).reduce((a, f) => a + f.v_net_dev, 0);

    const kpis = [
      { icono: 'recibido', num: cuenta('recibido'), etiqueta: 'Reportes recibidos', tono: 'gris', detalle: `${semana.length} recibidos en los últimos 7 días`, href: '#/casos' },
      { icono: 'cruce', num: cuenta('en_cruce') + cuenta('con_observaciones'), etiqueta: 'En cruce', tono: 'azul', detalle: `${regPend + casos.filter((c) => c.estado === 'con_observaciones').reduce((a, c) => a + c.pendientes.length, 0)} registros por resolver`, href: '#/casos' },
      { icono: 'aprobar', num: porAprobar.length, etiqueta: 'Por aprobar', tono: 'naranja', detalle: porAprobar.length ? `Post descarga · el más antiguo ${fmt.hace(porAprobar[porAprobar.length - 1].fecha_envio)}` : 'Nada pendiente', href: '#/por-aprobar' },
      { icono: 'sap', num: cuenta('en_sap'), etiqueta: 'En SAP', tono: 'celeste', detalle: errores.length ? `<span style="color:var(--rojo);font-weight:700">${errores.length} documento${errores.length > 1 ? 's' : ''} SAP con error</span>` : 'Sin errores', href: '#/documentos' },
      { icono: 'nc', num: ncs.length, etiqueta: 'NC emitidas', tono: 'violeta', detalle: `Octubre · ${cuenta('nc_emitida')} caso sin correo` },
      { icono: 'correo', num: correos.length, etiqueta: 'Correos enviados', tono: 'verde', detalle: `${fmt.soles(montoDevuelto)} devueltos` },
    ];

    // Casos que requieren atención
    const atencion = casos
      .map((c) => ({ c, motivos: window.S.motivoAtencion(c) }))
      .filter((x) => x.motivos)
      .sort((a, b) => window.S.severidad(a.c) - window.S.severidad(b.c) || b.c.fecha_envio.localeCompare(a.c.fecha_envio));
    const ex = extraccionAvisos();

    const avisoExtraccion = (ex.huecos.length || ex.dup.length) ? `
      <a class="aviso" href="#/facturacion">
        <span class="aviso__num"><small>SAP</small>ZSDR005</span>
        <span class="aviso__linea"><span class="aviso__titulo">Extracción diaria de facturas</span>
          ${ex.huecos.length ? window.U.chip(`${ex.huecos.length} días faltantes`, 'rojo') : ''}
          ${ex.dup.length ? window.U.chip(`${ex.dup.length} duplicados`, 'naranja') : ''}</span>
        <span class="aviso__motivo">Faltan ${ex.huecos.map((d) => fmt.fecha(d)).join(' y ')}. Cargados dos veces: ${ex.dup.map((d) => fmt.fecha(d)).join(' y ')}. Un día faltante deja registros sin factura.</span>
        <span class="aviso__ir">Revisar →</span>
      </a>` : '';

    const avisos = atencion.map(({ c, motivos }) => `
      <a class="aviso" href="#/caso/${c.numero}">
        <span class="aviso__num"><small>REP.</small>${c.numero}</span>
        <span class="aviso__linea">${chipFlujo(c.flujo)} ${chipEstadoCaso(c.estado)}</span>
        <span class="aviso__motivo">${motivos.map(esc).join(' ')}</span>
        <span class="aviso__ir">Ver caso →</span>
      </a>`).join('');

    // Ciclo: último caso cerrado
    const ultimoCorreo = correos[0];
    const cerrado = casos.find((c) => c.id === ultimoCorreo.reporte_id);
    const filas = ultimoCorreo.filas;
    const totUnd = filas.reduce((a, f) => a + f.und, 0);
    const totKg = filas.reduce((a, f) => a + f.kg, 0);
    const totSoles = filas.reduce((a, f) => a + f.v_net_dev, 0);

    const html = `
      <section class="seccion" aria-labelledby="s-hoy">
        ${seccionCab('HOY', 'Estado de la operación', `Corte al ${fmt.fecha(HOY)}`).replace('class="seccion__titulo"', 'class="seccion__titulo" id="s-hoy"')}
        <div class="kpis">${kpis.map(kpi).join('')}</div>
      </section>

      <section class="seccion" aria-labelledby="s-atencion">
        ${seccionCab('ATENCIÓN', 'Casos que requieren atención', `${atencion.length} casos`).replace('class="seccion__titulo"', 'class="seccion__titulo" id="s-atencion"')}
        <div class="atencion">${avisoExtraccion}${avisos}</div>
      </section>

      <section class="seccion" aria-labelledby="s-ciclo">
        ${seccionCab('CICLO', 'Último caso cerrado', `Reporte ${cerrado.numero}`).replace('class="seccion__titulo"', 'class="seccion__titulo" id="s-ciclo"')}
        <div class="panel ciclo">
          <div class="panel__cab" style="margin-bottom:0">
            <h3 class="panel__titulo">Reporte ${cerrado.numero} · ${esc(window.U.FLUJO[cerrado.flujo].label)}</h3>
            ${chipEstadoCaso(cerrado.estado)}
            <span class="panel__nota">${esc(cerrado.asunto_correo)}</span>
          </div>
          ${cinta(cerrado)}
          <div class="ciclo__resumen">
            ${dato('Auditor', esc(cerrado.auditor.nombre), true)}
            ${dato('Fecha de saca', esc(fmt.fecha(cerrado.fecha_saca)))}
            ${dato('Registros', `${cerrado.registros.length} · ${cerrado.nProcede} proceden`)}
            ${dato('Aves reconocidas', fmt.num(totUnd))}
            ${dato('Kg reconocidos', fmt.num(totKg, 2))}
            ${dato('NC emitidas', String(filas.length))}
            ${dato('V.NET/DEV', fmt.soles(totSoles))}
          </div>
          <div><a class="btn btn--sec" href="#/caso/${cerrado.numero}">Abrir el caso completo</a></div>
        </div>
      </section>`;

    return {
      titulo: 'Panel general',
      subtitulo: 'Notas de crédito por mortalidad de aves vivas: reportes del auditor, cruce con facturas, SAP y cierre por correo.',
      html,
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.panel = render;
})();
