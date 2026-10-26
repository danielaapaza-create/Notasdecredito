// Documentos SAP: avance por registro (pedido → entrega → traslado → NC → SUNAT) con sus números de documento.
(function () {
  'use strict';
  const { fmt, esc, chip, chipEstadoCaso, icono } = window.U;
  const { seccionCab } = window.C;

  const filtros = { caso: '', estado: 'curso' };
  const ESTADOS = {
    // En curso: registros sin terminar, más los casos con NC emitida que aún esperan el correo.
    curso: { label: 'En curso', fn: (x) => !x.avance.completo || x.rep.estado === 'nc_emitida' },
    error: { label: 'Con error', fn: (x) => !!x.avance.error },
    completo: { label: 'Completos', fn: (x) => x.avance.completo },
    todos: { label: 'Todos', fn: () => true },
  };
  const CORTO = { pedido: ['Pedido', 'VA01'], entrega: ['Entrega', 'VL01N'], traslado: ['Traslado', 'MIGO 321'], nc: ['NC', 'Pool fact.'], sunat: ['SUNAT', ''] };
  const ACCION = { pedido: 'Crear pedido', entrega: 'Crear entrega', traslado: 'Registrar traslado', nc: 'Emitir NC', sunat: 'Enviar a SUNAT' };

  function celda(x, etapa) {
    const d = x.avance.docs.find((y) => y.etapa === etapa);
    if (!d) return `<td><span class="doc-celda doc-celda--pend ${x.avance.siguiente === etapa ? 'doc-celda--sig' : ''}">Pendiente</span></td>`;
    if (d.estado === 'error') return `<td><span class="doc-celda doc-celda--error">${icono('alerta')} Error</span><div class="msg-error">${esc(d.mensaje)}</div></td>`;
    return `<td><span class="doc-celda doc-celda--ok mono" title="${esc(d.mensaje)} · ${fmt.fechaHora(d.fecha)}">${esc(d.numero)}</span>${d.clase ? `<div class="sutil">${d.clase}</div>` : ''}</td>`;
  }

  function filasCaso(rep, items, puede) {
    const c = window.S.caso(rep);
    const completos = items.filter((x) => x.avance.completo).length;
    const enCurso = items.some((x) => !x.avance.completo);
    return `<tbody class="grupo-caso">
      <tr class="fila-grupo"><td colspan="9">
        <div class="fila-grupo__cont">
          <a class="num-caso mono" href="#/caso/${rep.numero}">${rep.numero}</a>
          ${chipEstadoCaso(rep.estado)}
          <span class="sutil">${completos} de ${items.length} registros con NC aceptada${c.pct != null && c.flujo === 'postdescarga' ? ` · aprobado al ${c.pct} %` : ''}</span>
          <span class="fila-grupo__acc">
            ${puede && enCurso ? `<button type="button" class="btn btn--mini btn--sec" data-avanzar-caso="${rep.id}">Avanzar todo el caso</button>` : ''}
            ${rep.estado === 'nc_emitida' ? `<a class="btn btn--mini" href="#/caso/${rep.numero}/correo">Preparar correo</a>` : ''}
            ${rep.estado === 'cerrado' ? `<a class="btn btn--mini btn--sec" href="#/caso/${rep.numero}/correo">Ver correo</a>` : ''}
          </span>
        </div>
      </td></tr>
      ${items.map((x) => `
      <tr class="${x.avance.error ? 'fila-error' : ''}">
        <td class="col-registro"><span class="mono">${esc(x.reg.placa)}</span> · ${esc(x.reg.sexo)}<div class="sutil">${esc(x.factura.razon_social)}</div></td>
        <td class="mono nowrap">${esc(x.factura.nro_factura)}<div class="sutil">${esc(x.factura.lote)}</div></td>
        <td class="der mono">${fmt.num(Math.round((x.cruce.und * x.pct) / 100))}<div class="sutil">${fmt.num(Math.round(x.cruce.kg * x.pct) / 100, 2)} kg</div></td>
        ${window.S.ETAPAS.map((e) => celda(x, e)).join('')}
        <td>${puede && !x.avance.completo ? `<button type="button" class="btn btn--mini ${x.avance.error ? 'btn--peligro' : ''}" data-avanzar="${x.reg.id}">${x.avance.error ? 'Reprocesar' : ACCION[x.avance.siguiente]}</button>` : x.avance.completo ? chip('Completo', 'verde') : ''}</td>
      </tr>`).join('')}
    </tbody>`;
  }

  function render({ params }) {
    if (params[0]) filtros.caso = params[0];
    const puede = window.App.perfil === 'analista';
    const todos = window.S.registrosSap();
    const casosSap = [...new Map(todos.map((x) => [x.rep.numero, x.rep])).values()].sort((a, b) => b.numero - a.numero);
    const enCurso = todos.filter((x) => !x.avance.completo);
    const conteoEtapa = window.S.ETAPAS.map((e) => ({ e, n: enCurso.filter((x) => x.avance.siguiente === e && !x.avance.error).length }));
    const errores = todos.filter((x) => x.avance.error);

    const lista = todos.filter((x) => (!filtros.caso || String(x.rep.numero) === filtros.caso) && ESTADOS[filtros.estado].fn(x));
    const grupos = casosSap.map((rep) => [rep, lista.filter((x) => x.rep.id === rep.id)]).filter(([, items]) => items.length);

    const html = `
      <section class="seccion">
        ${seccionCab('SAP', 'Dónde está cada registro', `${enCurso.length} registros en curso`)}
        <div class="embudo">
          ${conteoEtapa.map(({ e, n }, i) => `
            <div class="embudo__paso ${n ? 'embudo__paso--activo' : ''}">
              <span class="etiqueta">${i + 1}. ${esc(window.S.ETAPA_LABEL[e])}</span>
              <b class="mono">${n}</b>
              <span class="sutil">${n === 1 ? 'registro espera' : 'registros esperan'} esta etapa</span>
            </div>`).join('<span class="embudo__flecha" aria-hidden="true">›</span>')}
          <div class="embudo__paso embudo__paso--error ${errores.length ? 'embudo__paso--activo' : ''}">
            <span class="etiqueta">Con error</span><b class="mono">${errores.length}</b><span class="sutil">requieren reproceso</span>
          </div>
        </div>
        <p class="nota-detalle">Secuencia por confirmar: Pedido VA01 (clase ZRE3; ZRE4 = diferido) → Entrega VL01N + entrada de mercancías → Traslado MIGO 321 (calidad a libre) → NC (pool de facturación) → SUNAT.</p>
      </section>

      <section class="panel panel--tabla">
        <div class="filtros">
          <label class="campo"><span class="etiqueta">Caso</span>
            <select id="f-caso"><option value="">Todos</option>${casosSap.map((r) => `<option value="${r.numero}" ${filtros.caso === String(r.numero) ? 'selected' : ''}>Reporte ${r.numero}</option>`).join('')}</select></label>
          <div class="filtros-rapidos" role="group" aria-label="Filtrar por avance" style="flex:3 1 300px">
            ${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" class="pildora ${filtros.estado === k ? 'pildora--activa' : ''}" data-estado="${k}">${v.label} <b class="mono">${todos.filter((x) => (!filtros.caso || String(x.rep.numero) === filtros.caso) && v.fn(x)).length}</b></button>`).join('')}
          </div>
        </div>
        <div class="tabla-wrap">
          <table class="tabla tabla--sap">
            <thead><tr>
              <th>Registro · cliente</th><th>Factura · lote</th><th class="der">UND · KG</th>
              ${window.S.ETAPAS.map((e) => `<th>${CORTO[e][0]}${CORTO[e][1] ? `<div class="th-sub">${CORTO[e][1]}</div>` : ''}</th>`).join('')}<th>Acción</th>
            </tr></thead>
            ${grupos.length ? grupos.map(([rep, items]) => filasCaso(rep, items, puede)).join('') : '<tbody><tr><td colspan="9" class="vacio">No hay registros con este filtro.</td></tr></tbody>'}
          </table>
        </div>
        ${puede ? '<p class="nota-detalle">Los botones simulan el registro en SAP y generan números de documento de ejemplo.</p>' : ''}
      </section>`;

    return {
      titulo: 'Documentos SAP',
      subtitulo: 'Avance por registro en SAP, con el número de documento de cada etapa.',
      html,
      montar(vista) {
        vista.querySelector('#f-caso').addEventListener('change', (e) => {
          filtros.caso = e.target.value;
          if (location.hash !== '#/documentos') history.replaceState(null, '', '#/documentos');
          window.App.render();
        });
        vista.addEventListener('click', (e) => {
          const actor = window.App.usuario().nombre;
          const est = e.target.closest('[data-estado]');
          if (est) { filtros.estado = est.dataset.estado; window.App.render(); return; }
          const b = e.target.closest('[data-avanzar]');
          if (b) {
            const doc = window.S.avanzarSap(Number(b.dataset.avanzar), actor);
            window.App.toast(`${window.S.ETAPA_LABEL[doc.etapa]}: documento ${doc.numero}.`);
            window.App.render();
            return;
          }
          const bc = e.target.closest('[data-avanzar-caso]');
          if (bc) {
            const items = window.S.registrosSap().filter((x) => x.rep.id === Number(bc.dataset.avanzarCaso) && !x.avance.completo);
            items.forEach((x) => window.S.avanzarSap(x.reg.id, actor));
            window.App.toast(`${items.length} registros avanzaron una etapa.`);
            window.App.render();
          }
        });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.documentos = render;
})();
