// Dashboard: analítica de mortalidad reconocida y notas de crédito.
// Gráficos en HTML/CSS (barras), con tooltip al pasar el mouse o enfocar, leyenda y vista en tabla.
(function () {
  'use strict';
  const { fmt, esc, ESTADO_CRUCE } = window.U;
  const { seccionCab, kpi } = window.C;

  let flujo = '';
  const SERIES = { despacho: { label: 'Despacho', var: '--serie-1' }, postdescarga: { label: 'Post descarga', var: '--serie-2' } };

  // Registros que proceden, con el kg/aves que se reconocen (aplicando el % aprobado en post descarga).
  function base() {
    return window.S.casos()
      .filter((c) => (!flujo || c.flujo === flujo) && c.estado !== 'rechazado')
      .flatMap((c) => c.registros.filter((r) => r.procede).map((r) => {
        const pct = c.pct ?? 100;
        return { c, r, und: Math.round((r.und_reconocer * pct) / 100), kg: Math.round(r.kg_reconocer * pct) / 100 };
      }));
  }

  function ncsEmitidas(casos) {
    return casos.flatMap((c) => c.ncs.map((d) => window.DB.factura_sap.find((f) => f.doc_facturacion === d.numero)).filter(Boolean));
  }

  const tablaHtml = (cab, filas) => `<details class="viz-tabla"><summary>Ver como tabla</summary><div class="tabla-wrap"><table class="tabla tabla--mini">
    <thead><tr>${cab.map((h, i) => `<th class="${i ? 'der' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((v, i) => `<td class="${i ? 'der mono' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;

  // Escala "redonda" para el eje.
  function techo(max) {
    if (max <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= max);
  }

  // Columnas apiladas por semana de saca (despacho + post descarga).
  function graficoSemanas(regs) {
    const semanas = [...new Set(regs.map((x) => window.U.semana(x.c.fecha_saca)))].sort((a, b) => a - b);
    const series = flujo ? [flujo] : ['despacho', 'postdescarga'];
    const datos = semanas.map((s) => {
      const v = {};
      series.forEach((k) => { v[k] = Math.round(regs.filter((x) => window.U.semana(x.c.fecha_saca) === s && x.c.flujo === k).reduce((a, x) => a + x.kg, 0) * 100) / 100; });
      return { s, v, total: series.reduce((a, k) => a + v[k], 0) };
    });
    const max = techo(Math.max(...datos.map((d) => d.total)));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
    return `
      ${series.length > 1 ? `<div class="leyenda">${series.map((k) => `<span><i style="background:var(${SERIES[k].var})"></i>${SERIES[k].label}</span>`).join('')}</div>` : ''}
      <div class="cols" role="img" aria-label="Kg a reconocer por semana de saca">
        <div class="cols__eje">${ticks.slice().reverse().map((t) => `<span>${fmt.num(t)}</span>`).join('')}</div>
        <div class="cols__area">
          ${ticks.map((t) => `<span class="cols__grid" style="bottom:${(t / max) * 100}%"></span>`).join('')}
          ${datos.map((d) => `<div class="cols__col">
            <div class="cols__pila" style="height:${(d.total / max) * 100}%">
              <span class="cols__total mono">${fmt.num(d.total, 0)}</span>
              ${series.slice().reverse().map((k) => d.v[k] ? `<span class="cols__seg" tabindex="0" style="flex:${d.v[k]};background:var(${SERIES[k].var})"
                data-tip="Semana ${d.s} · ${SERIES[k].label}|${fmt.num(d.v[k], 2)} kg"></span>` : '').join('')}
            </div>
            <span class="cols__etq mono">Sem. ${d.s}</span>
          </div>`).join('')}
        </div>
      </div>
      ${tablaHtml(['Semana', ...series.map((k) => SERIES[k].label + ' (kg)'), 'Total (kg)'], datos.map((d) => [`Semana ${d.s}`, ...series.map((k) => fmt.num(d.v[k], 2)), fmt.num(d.total, 2)]))}`;
  }

  // Barras horizontales de una sola serie.
  function barrasH(items, { unidad, dec = 0, sufijo = '' }) {
    const max = Math.max(...items.map((i) => i.v));
    return `<div class="barras">${items.map((i) => `
      <div class="barras__fila">
        <span class="barras__etq">${esc(i.label)}</span>
        <span class="barras__pista"><span class="barras__barra" tabindex="0" style="width:${(i.v / max) * 100}%" data-tip="${esc(i.label)}|${fmt.num(i.v, dec)}${sufijo} ${unidad}${i.extra ? ` · ${esc(i.extra)}` : ''}"></span></span>
        <span class="barras__valor mono">${fmt.num(i.v, dec)}${sufijo}</span>
      </div>`).join('')}</div>`;
  }

  function render() {
    const regs = base();
    const casos = window.S.casos().filter((c) => !flujo || c.flujo === flujo);
    const ncs = ncsEmitidas(casos);
    const aves = ncs.reduce((a, f) => a - f.ctd_factura, 0);
    const kg = ncs.reduce((a, f) => a - f.peso_neto, 0);
    const soles = ncs.reduce((a, f) => a - f.valor_neto, 0);
    const cerrados = casos.filter((c) => c.correo);
    const ciclo = cerrados.map((c) => ({ c, dias: (new Date(c.correo.fecha_envio) - new Date(c.fecha_envio)) / 86400000 }));
    const cicloProm = ciclo.length ? ciclo.reduce((a, x) => a + x.dias, 0) / ciclo.length : 0;
    const cruces = casos.flatMap((c) => c.cruces);
    const auto = cruces.filter((x) => ['LLENADO', 'YA REGISTRADO'].includes(x.estado) && !/^Asignada manualmente/.test(x.detalle));
    const enProceso = regs.filter((x) => !['nc_emitida', 'cerrado'].includes(x.c.estado));

    // Top clientes (kg a reconocer); el resto se agrupa en "Otros".
    const porCliente = {};
    regs.forEach((x) => { porCliente[x.r.cliente] = (porCliente[x.r.cliente] || 0) + x.kg; });
    const ordenCli = Object.entries(porCliente).sort((a, b) => b[1] - a[1]);
    const topCli = ordenCli.slice(0, 6).map(([label, v]) => ({ label, v }));
    const otros = ordenCli.slice(6).reduce((a, [, v]) => a + v, 0);
    if (otros) topCli.push({ label: `Otros (${ordenCli.length - 6})`, v: otros });

    // Mortalidad reportada por plantel (muertos / carga).
    const plan = {};
    casos.forEach((c) => c.registros.forEach((r) => {
      plan[r.plantel] = plan[r.plantel] || { m: 0, c: 0 };
      plan[r.plantel].m += r.muertos; plan[r.plantel].c += r.carga_aves;
    }));
    const porPlantel = Object.entries(plan).map(([label, v]) => ({ label, v: (v.m / v.c) * 100, extra: `${fmt.num(v.m)} muertos de ${fmt.num(v.c)} aves` })).sort((a, b) => b.v - a.v);

    // Resultado del cruce (estado → color de estado, con etiqueta).
    const ordenCruce = ['LLENADO', 'YA REGISTRADO', 'REVISAR', 'CONFLICTO', 'SIN COINCIDENCIA DE UNIDADES', 'SIN FACTURA EN BBDD'];
    const conteoCruce = ordenCruce.map((e) => ({ e, n: cruces.filter((x) => x.estado === e).length })).filter((x) => x.n);

    const html = `
      <div class="filtros-rapidos" role="group" aria-label="Filtrar por flujo">
        ${[['', 'Todos los flujos'], ['despacho', 'Despacho'], ['postdescarga', 'Post descarga']].map(([k, l]) => `<button type="button" class="pildora ${flujo === k ? 'pildora--activa' : ''}" data-flujo="${k}">${l}</button>`).join('')}
        <span class="sutil" style="align-self:center">Octubre 2026 · fecha de saca</span>
      </div>

      <section class="seccion">
        ${seccionCab('MES', 'Notas de crédito emitidas', `${ncs.length} NC aceptadas por SUNAT`)}
        <div class="kpis kpis--5">
          ${kpi({ icono: 'nc', num: fmt.num(aves), etiqueta: 'Aves reconocidas', tono: 'azul', detalle: `+${fmt.num(enProceso.reduce((a, x) => a + x.und, 0))} en proceso` })}
          ${kpi({ icono: 'dashboard', num: fmt.num(kg, 0), etiqueta: 'Kg reconocidos', tono: 'azul', detalle: `+${fmt.num(enProceso.reduce((a, x) => a + x.kg, 0), 0)} kg en proceso` })}
          ${kpi({ icono: 'devoluciones', num: fmt.num(soles, 0), etiqueta: 'V.NET/DEV (S/)', tono: 'violeta', detalle: 'Valor neto ÷ peso neto × kg' })}
          ${kpi({ icono: 'reloj', num: fmt.num(cicloProm, 1), etiqueta: 'Días de ciclo', tono: 'celeste', detalle: `Promedio del envío al correo · ${ciclo.length} casos` })}
          ${kpi({ icono: 'cruce', num: cruces.length ? `${fmt.num((auto.length / cruces.length) * 100, 0)} %` : '—', etiqueta: 'Cruce automático', tono: 'verde', detalle: `${auto.length} de ${cruces.length} registros sin intervención` })}
        </div>
      </section>

      <div class="viz-grid">
        <section class="panel viz viz--ancho">
          <div class="panel__cab"><h2 class="panel__titulo">Kg a reconocer por semana de saca</h2><span class="panel__nota">Post descarga al % aprobado · sin rechazados</span></div>
          ${graficoSemanas(regs)}
        </section>

        <section class="panel viz">
          <div class="panel__cab"><h2 class="panel__titulo">Clientes con más kg a reconocer</h2></div>
          ${barrasH(topCli, { unidad: 'kg', dec: 1 })}
          ${tablaHtml(['Cliente', 'Kg'], topCli.map((i) => [i.label, fmt.num(i.v, 2)]))}
        </section>

        <section class="panel viz">
          <div class="panel__cab"><h2 class="panel__titulo">Mortalidad reportada por plantel</h2><span class="panel__nota">Muertos ÷ carga de aves</span></div>
          ${barrasH(porPlantel, { unidad: 'de mortalidad', dec: 2, sufijo: ' %' })}
          ${tablaHtml(['Plantel', '% mortalidad', 'Detalle'], porPlantel.map((i) => [i.label, `${fmt.num(i.v, 2)} %`, i.extra]))}
        </section>

        <section class="panel viz">
          <div class="panel__cab"><h2 class="panel__titulo">Resultado del cruce</h2><span class="panel__nota">${cruces.length} registros cruzados</span></div>
          <div class="pila100" role="img" aria-label="Distribución del resultado del cruce">
            ${conteoCruce.map((x) => `<span class="pila100__seg pila100--${ESTADO_CRUCE[x.e].tono}" tabindex="0" style="flex:${x.n}" data-tip="${esc(x.e)}|${x.n} registros · ${fmt.num((x.n / cruces.length) * 100, 1)} %"></span>`).join('')}
          </div>
          <ul class="pila100__leyenda">${conteoCruce.map((x) => `<li>${window.U.chipCruce(x.e)}<b class="mono">${x.n}</b><span class="sutil mono">${fmt.num((x.n / cruces.length) * 100, 1)} %</span></li>`).join('')}</ul>
        </section>

        <section class="panel viz">
          <div class="panel__cab"><h2 class="panel__titulo">Días de ciclo por caso cerrado</h2><span class="panel__nota">Del envío del auditor al correo de NC</span></div>
          ${ciclo.length ? barrasH(ciclo.sort((a, b) => a.c.numero - b.c.numero).map((x) => ({ label: `Reporte ${x.c.numero}`, v: x.dias, extra: window.U.FLUJO[x.c.flujo].label })), { unidad: 'días', dec: 1 }) : '<p class="vacio">Aún no hay casos cerrados.</p>'}
          ${tablaHtml(['Caso', 'Días'], ciclo.map((x) => [`Reporte ${x.c.numero}`, fmt.num(x.dias, 1)]))}
        </section>
      </div>
      <div class="viz-tip" id="viz-tip" role="tooltip" hidden></div>`;

    return {
      titulo: 'Dashboard',
      subtitulo: 'Mortalidad reconocida, notas de crédito y tiempos del proceso.',
      html,
      montar(vista) {
        vista.addEventListener('click', (e) => {
          const b = e.target.closest('[data-flujo]');
          if (b) { flujo = b.dataset.flujo; window.App.render(); }
        });
        const tip = vista.querySelector('#viz-tip');
        const mostrar = (el, x, y) => {
          const [t, v] = el.dataset.tip.split('|');
          tip.innerHTML = `<b>${esc(t)}</b><span class="mono">${esc(v)}</span>`;
          tip.hidden = false;
          const w = tip.offsetWidth;
          tip.style.left = `${Math.min(Math.max(8, x - w / 2), innerWidth - w - 8)}px`;
          tip.style.top = `${y - tip.offsetHeight - 12}px`;
        };
        vista.addEventListener('mousemove', (e) => {
          const el = e.target.closest('[data-tip]');
          if (el) mostrar(el, e.clientX, e.clientY); else tip.hidden = true;
        });
        vista.addEventListener('mouseleave', () => { tip.hidden = true; });
        vista.addEventListener('focusin', (e) => {
          const el = e.target.closest('[data-tip]');
          if (!el) return;
          const r = el.getBoundingClientRect();
          mostrar(el, r.left + r.width / 2, r.top);
        });
        vista.addEventListener('focusout', () => { tip.hidden = true; });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.dashboard = render;
})();
