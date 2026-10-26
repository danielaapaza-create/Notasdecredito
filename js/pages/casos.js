// Bandeja de casos con filtros (flujo, estado, fecha de saca, auditor y búsqueda).
// También sirve para los accesos "Despacho" y "Post descarga" (flujo fijo).
(function () {
  'use strict';
  const { fmt, esc, chipEstadoCaso, chipFlujo, ESTADO_CASO, FLUJO, icono } = window.U;

  // Filtros vigentes (se conservan al navegar dentro de la sesión).
  const filtros = { flujo: '', estado: '', auditor: '', desde: '', hasta: '', q: '' };

  function aplicar(casos, flujoFijo) {
    const q = filtros.q.trim().toLowerCase();
    const flujo = flujoFijo || filtros.flujo;
    return casos.filter((c) =>
      (!flujo || c.flujo === flujo) &&
      (!filtros.estado || c.estado === filtros.estado) &&
      (!filtros.auditor || String(c.auditor_id) === filtros.auditor) &&
      (!filtros.desde || c.fecha_saca >= filtros.desde) &&
      (!filtros.hasta || c.fecha_saca <= filtros.hasta) &&
      (!q || String(c.numero).includes(q) || c.asunto_correo.toLowerCase().includes(q) ||
        c.registros.some((r) => r.placa.toLowerCase().includes(q) || r.razon_social.toLowerCase().includes(q) || r.guia.toLowerCase().includes(q))));
  }

  // Barra segmentada con el resultado del cruce.
  function barraCruce(c) {
    if (!c.cruces.length) return '<span class="chip c-gris chip--mono">• Sin cruce</span>';
    const total = c.nProcede;
    const llenos = c.porEstado['LLENADO'] || 0;
    const ya = c.porEstado['YA REGISTRADO'] || 0;
    const pend = c.pendientes.length;
    const seg = (n, cls) => (n ? `<span class="barra__seg ${cls}" style="flex:${n}"></span>` : '');
    return `<div class="barra" title="${llenos} con factura · ${pend} pendientes · ${ya} NC existente">
      <div class="barra__pista">${seg(llenos, 'b-verde')}${seg(ya, 'b-gris')}${seg(pend, 'b-rojo')}</div>
      <span class="barra__txt mono">${llenos}/${total}${pend ? ` <b class="txt-rojo">· ${pend} pend.</b>` : ''}</span>
    </div>`;
  }

  function barraSap(c) {
    const llenos = c.porEstado['LLENADO'] || 0;
    if (!c.docs.length) return '<span class="chip c-gris chip--mono">• Sin dato</span>';
    const nc = c.ncs.length;
    const err = c.errores.length;
    return `<div class="barra" title="${nc} de ${llenos} registros con NC">
      <div class="barra__pista">${nc ? `<span class="barra__seg b-violeta" style="flex:${nc}"></span>` : ''}${llenos - nc > 0 ? `<span class="barra__seg b-celeste" style="flex:${llenos - nc}"></span>` : ''}</div>
      <span class="barra__txt mono">NC ${nc}/${llenos}${err ? ` <b class="txt-rojo">· ${err} error</b>` : ''}</span>
    </div>`;
  }

  function filas(lista) {
    if (!lista.length) {
      return `<tr><td colspan="9" class="vacio">No hay casos con estos filtros. <button type="button" class="enlace" data-accion="limpiar">Limpiar filtros</button></td></tr>`;
    }
    return lista.map((c) => `
      <tr class="fila-click" data-href="#/caso/${c.numero}">
        <td><a class="num-caso mono" href="#/caso/${c.numero}">${c.numero}</a></td>
        <td>${chipFlujo(c.flujo)}</td>
        <td class="mono nowrap">${fmt.fecha(c.fecha_saca)}</td>
        <td class="mono nowrap">${fmt.fecha(c.fecha_envio)}<div class="sutil">${fmt.hora(c.fecha_envio)} · ${fmt.hace(c.fecha_envio)}</div></td>
        <td class="col-auditor">${esc(c.auditor.nombre)}</td>
        <td class="der mono nowrap">${c.nProcede}/${c.registros.length}<div class="sutil">proceden</div></td>
        <td>${barraCruce(c)}</td>
        <td>${barraSap(c)}</td>
        <td>${chipEstadoCaso(c.estado)}</td>
      </tr>`).join('');
  }

  function render({ ruta }) {
    const flujoFijo = ruta === 'despacho' || ruta === 'postdescarga' ? ruta : '';
    const perfil = window.App?.perfil;
    let todos = window.S.casos();
    if (perfil === 'auditor') {
      const u = window.App.usuario();
      todos = todos.filter((c) => c.auditor_id === u.auditor_id);
    }
    const base = flujoFijo ? todos.filter((c) => c.flujo === flujoFijo) : todos;
    const lista = aplicar(todos, flujoFijo);

    const conteo = Object.keys(ESTADO_CASO).map((e) => ({ e, n: base.filter((c) => c.estado === e).length })).filter((x) => x.n);
    const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(label)}</option>`;

    const html = `
      <div class="filtros-rapidos" role="group" aria-label="Filtrar por estado">
        <button type="button" class="pildora ${!filtros.estado ? 'pildora--activa' : ''}" data-estado="">Todos <b class="mono">${base.length}</b></button>
        ${conteo.map(({ e, n }) => `<button type="button" class="pildora pildora--${ESTADO_CASO[e].tono} ${filtros.estado === e ? 'pildora--activa' : ''}" data-estado="${e}">${esc(ESTADO_CASO[e].label)} <b class="mono">${n}</b></button>`).join('')}
      </div>

      <section class="panel">
        <form class="filtros" id="form-filtros" autocomplete="off">
          ${flujoFijo ? '' : `<label class="campo"><span class="etiqueta">Flujo</span>
            <select id="f-flujo" name="flujo">${opt('', 'Todos', filtros.flujo)}${Object.entries(FLUJO).map(([k, v]) => opt(k, v.label, filtros.flujo)).join('')}</select></label>`}
          <label class="campo"><span class="etiqueta">Estado</span>
            <select id="f-estado" name="estado">${opt('', 'Todos', filtros.estado)}${Object.entries(ESTADO_CASO).map(([k, v]) => opt(k, v.label, filtros.estado)).join('')}</select></label>
          <label class="campo"><span class="etiqueta">Auditor</span>
            <select id="f-auditor" name="auditor">${opt('', 'Todos', filtros.auditor)}${window.DB.auditor.map((a) => opt(String(a.id), a.nombre, filtros.auditor)).join('')}</select></label>
          <label class="campo"><span class="etiqueta">Saca desde</span><input id="f-desde" name="desde" type="date" value="${filtros.desde}"></label>
          <label class="campo"><span class="etiqueta">Saca hasta</span><input id="f-hasta" name="hasta" type="date" value="${filtros.hasta}"></label>
          <label class="campo campo--ancho"><span class="etiqueta">Buscar</span>
            <span class="campo__icono">${icono('buscar')}<input id="f-q" name="q" type="search" placeholder="N° de reporte, placa, guía o cliente" value="${esc(filtros.q)}"></span></label>
          <button type="button" class="btn btn--sec" data-accion="limpiar">Limpiar</button>
        </form>
      </section>

      <section class="panel panel--tabla">
        <div class="panel__cab">
          <h2 class="panel__titulo">${flujoFijo ? `Casos de ${FLUJO[flujoFijo].label.toLowerCase()}` : 'Todos los casos'}</h2>
          <span class="panel__nota" id="nota-resultados">${lista.length} de ${base.length} casos</span>
        </div>
        <div class="tabla-wrap">
          <table class="tabla">
            <thead><tr>
              <th>Reporte</th><th>Flujo</th><th>Saca</th><th>Recibido</th><th>Auditor</th>
              <th class="der">Registros</th><th>Cruce</th><th>SAP</th><th>Estado</th>
            </tr></thead>
            <tbody id="tbody-casos">${filas(lista)}</tbody>
          </table>
        </div>
      </section>`;

    const sub = {
      casos: 'Cada reporte del auditor es un caso. Todo lo que pasa después cuelga de él.',
      despacho: 'Reportes "Mort Pro ... Ayacucho y Apurímac", enviados al cargar el camión.',
      postdescarga: 'Reportes "Evaluación postdescarga". Requieren el % de aprobación del jefe.',
    };

    return {
      titulo: perfil === 'auditor' ? 'Mis envíos' : flujoFijo ? FLUJO[flujoFijo].label : 'Casos',
      subtitulo: sub[ruta] || sub.casos,
      html,
      montar(vista) {
        const actualizar = () => {
          const l = aplicar(todos, flujoFijo);
          vista.querySelector('#tbody-casos').innerHTML = filas(l);
          vista.querySelector('#nota-resultados').textContent = `${l.length} de ${base.length} casos`;
          vista.querySelectorAll('.pildora').forEach((b) => b.classList.toggle('pildora--activa', b.dataset.estado === filtros.estado));
        };
        const form = vista.querySelector('#form-filtros');
        form.addEventListener('submit', (e) => e.preventDefault());
        form.addEventListener('input', (e) => {
          if (!e.target.name) return;
          filtros[e.target.name] = e.target.value;
          actualizar();
        });
        vista.addEventListener('click', (e) => {
          const pild = e.target.closest('.pildora');
          if (pild) {
            filtros.estado = pild.dataset.estado;
            vista.querySelector('#f-estado').value = filtros.estado;
            actualizar();
            return;
          }
          if (e.target.closest('[data-accion="limpiar"]')) {
            Object.keys(filtros).forEach((k) => { filtros[k] = ''; });
            form.reset();
            form.querySelectorAll('input').forEach((i) => { i.value = ''; });
            form.querySelectorAll('select').forEach((s) => { s.value = ''; });
            actualizar();
            return;
          }
          const fila = e.target.closest('.fila-click');
          if (fila && !e.target.closest('a')) location.hash = fila.dataset.href;
        });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.casos = render;
  window.Pages.despacho = render;
  window.Pages.postdescarga = render;
  window.Pages.envios = render;
})();
