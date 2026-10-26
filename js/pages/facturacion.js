// Facturación diaria: extracción SAP ZSDR005 (layout /RALDAZA) día por día, con huecos y duplicados.
(function () {
  'use strict';
  const { fmt, esc, chip, icono } = window.U;
  const { seccionCab, kpi } = window.C;

  const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const ESTADO_DIA = {
    cargado: { label: 'Cargado', tono: 'verde' },
    duplicado: { label: 'Duplicado', tono: 'naranja' },
    hueco: { label: 'Falta', tono: 'rojo' },
    por_cargar: { label: 'Hoy', tono: 'gris' },
  };
  let seleccionado = null;

  function calendario(dias) {
    const primero = (new Date(dias[0].fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const celdas = Array.from({ length: primero }, () => '<span class="cal__vacio" aria-hidden="true"></span>');
    for (const d of dias) {
      const e = ESTADO_DIA[d.estado];
      const fa = d.lineas.filter((l) => l.tipo === 'FA').length;
      celdas.push(`<button type="button" class="cal__dia cal__dia--${d.estado} ${seleccionado === d.fecha ? 'cal__dia--sel' : ''}" data-dia="${d.fecha}"
        aria-pressed="${seleccionado === d.fecha}" aria-label="${fmt.fecha(d.fecha)}: ${e.label}${d.cargas.length ? `, ${d.lineas.length} líneas` : ''}">
        <span class="cal__num mono">${Number(d.fecha.slice(8))}</span>
        <span class="cal__estado">${d.estado === 'duplicado' ? `×${d.cargas.length}` : e.label}</span>
        <span class="cal__filas mono">${d.cargas.length ? `${fa} FA` : '—'}</span>
      </button>`);
    }
    return `<div class="cal" role="grid" aria-label="Octubre 2026">
      ${DIAS_SEMANA.map((d) => `<span class="cal__cab">${d}</span>`).join('')}
      ${celdas.join('')}
    </div>`;
  }

  function porResolver(dias, puede) {
    const huecos = dias.filter((d) => d.estado === 'hueco');
    const dups = dias.filter((d) => d.estado === 'duplicado');
    if (!huecos.length && !dups.length) return `<p class="vacio">Sin huecos ni duplicados. La BBDD de facturas está completa hasta ayer.</p>`;
    const itemHueco = (d) => {
      const af = window.S.afectadosPorDia(d.fecha);
      const reps = [...new Set(af.map((r) => window.DB.reporte.find((x) => x.id === r.reporte_id).numero))];
      return `<li class="resolver resolver--rojo">
        <div><b>${fmt.fecha(d.fecha)} · falta la extracción</b>
          <p>${af.length ? `Deja ${af.length} registro${af.length > 1 ? 's' : ''} sin factura en ${reps.map((n) => `<a href="#/caso/${n}">reporte ${n}</a>`).join(', ')}.` : 'No afecta a ningún reporte por ahora.'}</p></div>
        ${puede ? `<button type="button" class="btn btn--mini" data-cargar="${d.fecha}">${icono('subir')} Cargar ZSDR005</button>` : ''}
      </li>`;
    };
    const itemDup = (d) => {
      const dup = d.cargas.find((c) => c.estado === 'duplicado');
      return `<li class="resolver resolver--naranja">
        <div><b>${fmt.fecha(d.fecha)} · cargado 2 veces</b>
          <p><span class="mono">${esc(dup.archivo)}</span> repite ${dup.filas} líneas. El cruce no las cuenta dos veces (clave: documento + lote).</p></div>
        ${puede ? `<button type="button" class="btn btn--mini btn--sec" data-descartar="${dup.id}">Descartar duplicado</button>` : ''}
      </li>`;
    };
    return `<ul class="resolver-lista">${huecos.map(itemHueco).join('')}${dups.map(itemDup).join('')}</ul>`;
  }

  function detalleDia(d) {
    if (!d) return '';
    const e = ESTADO_DIA[d.estado];
    const tipos = { FA: 'verde', NC: 'violeta', ND: 'gris' };
    return `<section class="panel panel--tabla" id="detalle-dia">
      <div class="panel__cab">
        <h2 class="panel__titulo">${fmt.fecha(d.fecha)}</h2> ${chip(e.label, e.tono)}
        <span class="panel__nota">${d.lineas.length} líneas en la BBDD</span>
      </div>
      ${d.cargas.length ? `<div class="cargas">${d.cargas.map((c) => `
        <div class="carga ${c.estado === 'duplicado' ? 'carga--dup' : ''}">
          ${icono('sap')}<div><b class="mono">${esc(c.archivo)}</b>
          <span class="sutil">Cargado el ${fmt.fechaHora(c.fecha_carga)} por ${esc(c.usuario)} · ${c.filas} filas</span></div>
          ${c.estado === 'duplicado' ? chip('Duplicado', 'naranja') : chip('Cargado', 'verde')}
        </div>`).join('')}</div>` : `<p class="nota-detalle">No se cargó la extracción de este día. Las facturas emitidas en SAP ese día no están en la BBDD.</p>`}
      ${d.lineas.length ? `<div class="tabla-wrap"><table class="tabla tabla--mini">
        <thead><tr><th>Tipo</th><th>Nro. factura</th><th>Doc. fact.</th><th>Razón social</th><th>Centro</th><th>Material</th><th>Lote</th><th class="der">Ctd.</th><th class="der">Peso neto</th><th class="der">Valor neto</th></tr></thead>
        <tbody>${d.lineas.map((l) => `<tr class="${l.tipo !== 'FA' ? 'fila-apagada' : ''}">
          <td>${chip(l.tipo, tipos[l.tipo], 'chip--sin-punto')}</td>
          <td class="mono nowrap">${esc(l.nro_factura)}</td><td class="mono">${esc(l.doc_facturacion)}</td>
          <td class="col-razon">${esc(l.razon_social)}</td><td class="nowrap">${esc(l.denom_centro)}<div class="sutil">${esc(l.centro)}</div></td>
          <td class="mono">${esc(l.material)}<div class="sutil">${esc(l.sexo)}</div></td><td class="mono">${esc(l.lote)}</td>
          <td class="der mono">${fmt.num(l.ctd_factura)}</td><td class="der mono">${fmt.num(l.peso_neto, 2)}</td><td class="der mono">${fmt.soles(l.valor_neto)}</td>
        </tr>`).join('')}</tbody></table></div>
        <p class="nota-detalle">El cruce ignora las NC (07-), las ND (08-) y las cantidades negativas.</p>` : ''}
    </section>`;
  }

  function render() {
    const puede = window.App.perfil === 'analista';
    const dias = window.S.calendarioExtraccion();
    if (!seleccionado || !dias.some((d) => d.fecha === seleccionado)) {
      seleccionado = (dias.find((d) => d.estado === 'hueco') || dias[dias.length - 2]).fecha;
    }
    const cargados = dias.filter((d) => d.cargas.length).length;
    const huecos = dias.filter((d) => d.estado === 'hueco').length;
    const dups = dias.filter((d) => d.estado === 'duplicado').length;
    const fs = window.DB.factura_sap;

    const html = `
      <section class="seccion">
        ${seccionCab('BBDD', 'Base de facturas', 'Hoy: Excel consolidado · a futuro: SQL')}
        <div class="kpis kpis--4">
          ${kpi({ icono: 'calendario', num: cargados, etiqueta: 'Días cargados', tono: 'verde', detalle: `Del ${fmt.fecha(dias[0].fecha)} a ayer` })}
          ${kpi({ icono: 'alerta', num: huecos, etiqueta: 'Días faltantes', tono: huecos ? 'rojo' : 'gris', detalle: huecos ? 'Pueden dejar registros sin factura' : 'Sin huecos' })}
          ${kpi({ icono: 'casos', num: dups, etiqueta: 'Cargas duplicadas', tono: dups ? 'naranja' : 'gris', detalle: 'Mismo día cargado más de una vez' })}
          ${kpi({ icono: 'sap', num: fmt.num(fs.length), etiqueta: 'Líneas en BBDD', tono: 'azul', detalle: `${fs.filter((f) => f.tipo === 'FA').length} FA · ${fs.filter((f) => f.tipo === 'NC').length} NC · ${fs.filter((f) => f.tipo === 'ND').length} ND` })}
        </div>
      </section>

      <div class="fact-grid">
        <section class="panel">
          <div class="panel__cab"><h2 class="panel__titulo">Octubre 2026</h2><span class="panel__nota">ZSDR005 · layout /RALDAZA · una carga por día</span></div>
          ${calendario(dias)}
          <div class="cal__leyenda">${Object.values(ESTADO_DIA).map((e) => chip(e.label, e.tono)).join('')}</div>
        </section>
        <section class="panel">
          <div class="panel__cab"><h2 class="panel__titulo">Por resolver</h2></div>
          ${porResolver(dias, puede)}
        </section>
      </div>

      ${detalleDia(dias.find((d) => d.fecha === seleccionado))}`;

    return {
      titulo: 'Facturación diaria',
      subtitulo: 'Extracción diaria de SAP (ZSDR005, layout /RALDAZA) consolidada en la BBDD de facturas.',
      html,
      montar(vista) {
        vista.addEventListener('click', (e) => {
          const dia = e.target.closest('[data-dia]');
          if (dia) {
            seleccionado = dia.dataset.dia;
            window.App.render();
            document.getElementById('detalle-dia')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          const cargar = e.target.closest('[data-cargar]');
          if (cargar) {
            const r = window.S.cargarExtraccion(cargar.dataset.cargar, window.App.usuario().nombre);
            seleccionado = cargar.dataset.cargar;
            window.App.toast(`Extracción cargada: ${r.filas} líneas.${r.resueltos.length ? ` ${r.resueltos.length} registro ahora tiene factura.` : ''}`);
            window.App.render();
            return;
          }
          const desc = e.target.closest('[data-descartar]');
          if (desc) {
            window.S.descartarDuplicado(Number(desc.dataset.descartar));
            window.App.toast('Carga duplicada descartada.');
            window.App.render();
          }
        });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.facturacion = render;
})();
