// Portal auditor (externo): Mis envíos y el detalle de su envío.
// El auditor solo ve lo que envió, un estado simple y la respuesta de San Fernando (el correo de NC).
// Nada interno: ni cruce con facturas, ni SAP, ni saldo, ni % de aprobación, ni el hilo interno.
(function () {
  'use strict';
  const { fmt, esc, chip, icono, FLUJO } = window.U;
  const { seccionCab, dato } = window.C;

  // Estado que ve el auditor.
  const ESTADO_AUDITOR = {
    enviado: { label: 'Enviado', tono: 'gris' },
    revision: { label: 'En revisión', tono: 'azul' },
    respondido: { label: 'Respondido', tono: 'verde' },
    rechazado: { label: 'Rechazado', tono: 'rojo' },
  };
  function estadoAuditor(c) {
    if (c.estado === 'recibido') return 'enviado';
    if (c.estado === 'cerrado') return 'respondido';
    if (c.estado === 'rechazado') return 'rechazado';
    return 'revision';
  }
  const chipAuditor = (c) => { const e = ESTADO_AUDITOR[estadoAuditor(c)]; return chip(e.label, e.tono); };

  function auditorActual() {
    const u = window.App.usuario();
    return { u, a: window.S.auditores[u.auditor_id] };
  }
  const misCasos = () => window.S.casos().filter((c) => c.auditor_id === auditorActual().a.id);

  // ---------- Mis envíos ----------
  const filtros = { estado: '', q: '' };

  function filasLista(lista) {
    if (!lista.length) return '<tr><td colspan="7" class="vacio">No hay envíos con este filtro.</td></tr>';
    return lista.map((c) => `
      <tr class="fila-click" data-href="#/caso/${c.numero}">
        <td><a class="num-caso mono" href="#/caso/${c.numero}">${c.numero}</a></td>
        <td>${chip(FLUJO[c.flujo].label, FLUJO[c.flujo].tono, 'chip--sin-punto')}</td>
        <td class="mono nowrap">${fmt.fecha(c.fecha_saca)}</td>
        <td class="mono nowrap">${fmt.fecha(c.fecha_envio)}<div class="sutil">${fmt.hora(c.fecha_envio)} · ${fmt.hace(c.fecha_envio)}</div></td>
        <td class="col-asunto mono">${esc(c.asunto_correo)}</td>
        <td class="der mono nowrap">${c.registros.length}</td>
        <td>${chipAuditor(c)}</td>
      </tr>`).join('');
  }

  function lista() {
    const todos = misCasos();
    const q = filtros.q.trim().toLowerCase();
    const filtrar = () => todos.filter((c) => (!filtros.estado || estadoAuditor(c) === filtros.estado) &&
      (!q || String(c.numero).includes(q) || c.asunto_correo.toLowerCase().includes(q) || c.registros.some((r) => r.placa.toLowerCase().includes(q))));
    const { a } = auditorActual();
    const html = `
      <div class="remitente">${icono('correo')}<span><b>${esc(a.nombre)}</b> · <span class="mono">${esc(a.correo)}</span></span></div>
      <div class="filtros-rapidos" role="group" aria-label="Filtrar por estado">
        <button type="button" class="pildora ${!filtros.estado ? 'pildora--activa' : ''}" data-estado="">Todos <b class="mono">${todos.length}</b></button>
        ${Object.entries(ESTADO_AUDITOR).map(([k, e]) => {
          const n = todos.filter((c) => estadoAuditor(c) === k).length;
          return n ? `<button type="button" class="pildora ${filtros.estado === k ? 'pildora--activa' : ''}" data-estado="${k}">${e.label} <b class="mono">${n}</b></button>` : '';
        }).join('')}
      </div>
      <section class="panel panel--tabla">
        <div class="panel__cab">
          <h2 class="panel__titulo">Reportes enviados</h2>
          <span class="panel__nota" id="nota-envios"></span>
          <a class="btn btn--mini" href="#/subir">Subir reporte</a>
        </div>
        <label class="campo" style="max-width:420px;flex:none"><span class="etiqueta">Buscar</span>
          <span class="campo__icono">${icono('buscar')}<input id="q-envios" type="search" placeholder="N° de reporte, asunto o placa" value="${esc(filtros.q)}"></span></label>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Reporte</th><th>Tipo</th><th>Saca</th><th>Enviado</th><th>Asunto</th><th class="der">Filas</th><th>Estado</th></tr></thead>
          <tbody id="tbody-envios">${filasLista(filtrar())}</tbody>
        </table></div>
        <p class="nota-detalle">En revisión: San Fernando está procesando tu reporte. Respondido: te enviamos las notas de crédito en el mismo hilo del correo.</p>
      </section>`;
    return {
      titulo: 'Mis envíos',
      subtitulo: 'Los reportes que enviaste a San Fernando y su estado.',
      html,
      montar(vista) {
        const actualizar = () => {
          const l = filtrar();
          vista.querySelector('#tbody-envios').innerHTML = filasLista(l);
          vista.querySelector('#nota-envios').textContent = `${l.length} de ${todos.length} envíos`;
          vista.querySelectorAll('.pildora').forEach((b) => b.classList.toggle('pildora--activa', b.dataset.estado === filtros.estado));
        };
        actualizar();
        vista.querySelector('#q-envios').addEventListener('input', (e) => { filtros.q = e.target.value; actualizar(); });
        vista.addEventListener('click', (e) => {
          const p = e.target.closest('.pildora');
          if (p) { filtros.estado = p.dataset.estado; actualizar(); return; }
          const fila = e.target.closest('.fila-click');
          if (fila && !e.target.closest('a')) location.hash = fila.dataset.href;
        });
      },
    };
  }

  // ---------- Detalle del envío ----------
  function pasos(c) {
    const est = estadoAuditor(c);
    // Inicio de la revisión: el primer paso de San Fernando después de leer el archivo.
    const revision = c.eventos.find((e) => e.tipo !== 'recepcion');
    const lista = [
      { nombre: 'Enviado', icono: 'envios', estado: 'hecho', fecha: c.fecha_envio, desc: `${c.registros.length} filas` },
      { nombre: 'En revisión', icono: 'reloj', estado: est === 'enviado' ? 'pend' : est === 'revision' ? 'actual' : 'hecho', fecha: est === 'enviado' ? null : revision?.fecha_hora, desc: 'San Fernando procesa tu reporte' },
      est === 'rechazado'
        ? { nombre: 'Rechazado', icono: 'alerta', estado: 'alerta', fecha: c.aprobacion?.fecha, desc: 'No se emiten notas de crédito' }
        : { nombre: 'Respondido', icono: 'correo', estado: est === 'respondido' ? 'hecho' : 'pend', fecha: c.correo?.fecha_envio, desc: est === 'respondido' ? 'Notas de crédito enviadas' : 'Pendiente' },
    ];
    const iconoPaso = (p) => p.estado === 'hecho' ? icono('check') : p.estado === 'alerta' ? icono('alerta') : icono(p.icono);
    return `<ol class="cinta" style="--n:${lista.length}" aria-label="Estado de tu envío">
      ${lista.map((p) => `<li class="cinta__paso cinta__paso--${p.estado}" ${['actual', 'alerta'].includes(p.estado) ? 'aria-current="step"' : ''}>
        <span class="cinta__punto">${iconoPaso(p)}</span>
        <span class="cinta__nombre">${esc(p.nombre)}</span>
        <span class="cinta__fecha">${p.fecha ? esc(fmt.fechaHora(p.fecha)) : '&nbsp;'}</span>
        <span class="cinta__desc">${esc(p.desc)}</span>
      </li>`).join('')}
    </ol>`;
  }

  function tablaFilas(c) {
    return `<div class="tabla-wrap"><table class="tabla tabla--mini">
      <thead><tr><th>#</th><th>Cliente</th><th>Razón social</th><th>Placa</th><th>GR</th><th>Plantel</th><th>Galpón</th><th>Sexo</th>
        <th class="der">Carga aves</th><th class="der">Muertos</th><th class="der">N° aves a reconocer</th><th class="der">KG a reconocer</th></tr></thead>
      <tbody>${c.registros.map((r, i) => `<tr>
        <td class="mono sutil">${i + 1}</td><td>${esc(r.cliente)}</td><td class="col-razon">${esc(r.razon_social)}</td>
        <td class="mono nowrap">${esc(r.placa)}</td><td class="mono guia">${esc(r.guia).replace(' y ', '<br>y ')}</td><td class="nowrap">${esc(r.plantel)}</td><td>${esc(r.galpon)}</td><td>${esc(r.sexo)}</td>
        <td class="der mono">${fmt.num(r.carga_aves)}</td><td class="der mono">${fmt.num(r.muertos)}</td>
        <td class="der mono fuerte">${fmt.num(r.und_reconocer)}</td><td class="der mono fuerte">${fmt.num(r.kg_reconocer, 2)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function detalle(params) {
    const rep = window.S.reportePorNumero(params[0]);
    const { a } = auditorActual();
    // Un auditor solo puede abrir sus propios envíos.
    if (!rep || rep.auditor_id !== a.id) {
      return { titulo: 'Envío no encontrado', subtitulo: '', html: `<div class="panel"><p>No encontramos ese envío entre los tuyos. <a href="#/envios">Volver a Mis envíos</a></p></div>` };
    }
    const c = window.S.caso(rep);
    const est = estadoAuditor(c);
    const mensaje = {
      enviado: { tono: 'azul', texto: 'Recibimos tu reporte. En breve empezamos a revisarlo.' },
      revision: { tono: 'azul', texto: 'Estamos revisando tu reporte. Te responderemos en el mismo hilo del correo con las notas de crédito.' },
      respondido: { tono: 'verde', texto: `Te respondimos el ${c.correo ? fmt.fechaHora(c.correo.fecha_envio) : ''} con las notas de crédito. El detalle está abajo.` },
      rechazado: { tono: 'rojo', texto: c.aprobacion ? `San Fernando no aprobó este reporte. Motivo: "${c.aprobacion.comentario.replace(/\.$/, '')}".` : 'San Fernando no aprobó este reporte.' },
    }[est];

    const html = `
      <a class="volver" href="#/envios">${icono('atras')} Mis envíos</a>
      <section class="panel resumen">
        <div class="panel__cab">
          <h2 class="panel__titulo">Reporte ${c.numero}</h2>
          ${chip(FLUJO[c.flujo].label, FLUJO[c.flujo].tono, 'chip--sin-punto')} ${chipAuditor(c)}
          <span class="panel__nota mono">${esc(c.archivo)}</span>
        </div>
        <div class="resumen__datos">
          ${dato('Asunto', esc(c.asunto_correo))}
          ${dato('Fecha de saca', fmt.fecha(c.fecha_saca))}
          ${dato('Enviado', fmt.fechaHora(c.fecha_envio))}
          ${dato('Filas', String(c.registros.length))}
          ${dato('Aves a reconocer', fmt.num(c.registros.reduce((s, r) => s + r.und_reconocer, 0)))}
          ${dato('Kg a reconocer', fmt.num(c.registros.reduce((s, r) => s + r.kg_reconocer, 0), 2))}
        </div>
        ${pasos(c)}
        <div class="siguiente siguiente--${mensaje.tono}"><p>${esc(mensaje.texto)}</p></div>
      </section>

      ${est === 'respondido' ? window.CasoUI.seccionCorreo(c, 'auditor') : ''}

      <section class="seccion">
        ${seccionCab('TU REPORTE', 'Filas que enviaste', `${c.registros.length} filas`)}
        <div class="panel panel--tabla">${tablaFilas(c)}</div>
      </section>`;

    return {
      titulo: `Reporte ${c.numero}`,
      subtitulo: `${FLUJO[c.flujo].label} · saca del ${fmt.fecha(c.fecha_saca)}`,
      html,
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.envios = lista;
  window.EnvioAuditor = { detalle, estadoAuditor };
})();
