// Portal cliente (externo): sus notas de crédito por mortalidad y lo que aún está en proceso.
// Sin información interna: ni auditor, ni cruce, ni SAP, ni % de aprobación.
(function () {
  'use strict';
  const { fmt, esc, chip, icono } = window.U;
  const { seccionCab, kpi } = window.C;

  function clienteActual() {
    const u = window.App.usuario();
    return { u, cli: window.DB.cliente.find((c) => c.codigo === u.cliente_codigo) };
  }

  function render() {
    const { cli } = clienteActual();
    const fs = window.DB.factura_sap;
    const ncs = fs.filter((f) => f.tipo === 'NC' && f.cliente_codigo === cli.codigo).sort((a, b) => b.fecha_factura.localeCompare(a.fecha_factura) || b.nro_factura.localeCompare(a.nro_factura));
    const original = (nc) => fs.find((f) => f.tipo === 'FA' && f.nro_factura === nc.factura_ref && f.lote === nc.lote);

    // En proceso: camiones del cliente con mortalidad reconocida cuya NC aún no se emite.
    const enProceso = window.S.casos().filter((c) => c.estado !== 'rechazado').flatMap((c) => c.registros.map((r) => {
      const cr = window.S.cruceDe(r.id);
      if (!cr || cr.estado !== 'LLENADO' || !cr.factura_id) return null;
      const f = window.S.facturas[cr.factura_id];
      if (f.cliente_codigo !== cli.codigo) return null;
      if (window.S.docsDe(r.id).some((d) => d.etapa === 'nc' && d.estado === 'completado')) return null;
      return { c, r, f, estado: c.estado === 'en_sap' ? ['Emitiendo NC', 'azul'] : ['En evaluación', 'naranja'] };
    }).filter(Boolean)).sort((a, b) => b.c.fecha_saca.localeCompare(a.c.fecha_saca));

    const und = ncs.reduce((a, f) => a - f.ctd_factura, 0);
    const kg = ncs.reduce((a, f) => a - f.peso_neto, 0);
    const soles = ncs.reduce((a, f) => a - f.valor_neto, 0);
    const porFactura = {};
    ncs.forEach((nc) => { porFactura[nc.factura_ref] = (porFactura[nc.factura_ref] || 0) + 1; });

    // Saldo por línea de factura con devoluciones.
    const lineas = [...new Map(ncs.map((nc) => [nc.factura_ref + nc.lote, original(nc)]).filter(([, f]) => f)).values()].map((f) => {
      const dev = ncs.filter((n) => n.factura_ref === f.nro_factura && n.lote === f.lote);
      const u = dev.reduce((a, n) => a - n.ctd_factura, 0);
      return { f, n: dev.length, und: u, kg: dev.reduce((a, n) => a - n.peso_neto, 0) };
    });

    const html = `
      <div class="remitente">${icono('devoluciones')}<span><b>${esc(cli.razon_social)}</b> · RUC <span class="mono">${esc(cli.ruc)}</span> · código <span class="mono">${esc(cli.codigo)}</span></span></div>

      <section class="seccion">
        ${seccionCab('RESUMEN', 'Tus devoluciones por mortalidad', 'Octubre 2026')}
        <div class="kpis kpis--4">
          ${kpi({ icono: 'nc', num: ncs.length, etiqueta: 'Notas de crédito', tono: 'violeta', detalle: 'Aceptadas por SUNAT' })}
          ${kpi({ icono: 'devoluciones', num: fmt.num(und), etiqueta: 'Aves devueltas', tono: 'azul', detalle: `${fmt.num(kg, 2)} kg` })}
          ${kpi({ icono: 'sap', num: fmt.num(soles, 2), etiqueta: 'Monto (S/)', tono: 'verde', detalle: 'Valor neto de las NC' })}
          ${kpi({ icono: 'reloj', num: enProceso.length, etiqueta: 'En proceso', tono: enProceso.length ? 'naranja' : 'gris', detalle: 'Camiones con NC por emitir' })}
        </div>
      </section>

      <section class="seccion">
        ${seccionCab('NC', 'Notas de crédito emitidas', `${ncs.length} documentos`)}
        <div class="panel panel--tabla">
          ${ncs.length ? `<div class="tabla-wrap"><table class="tabla">
            <thead><tr><th>Fecha NC</th><th>Nota de crédito</th><th>Factura</th><th>Placa · GR</th><th>Lote</th><th>Producto</th>
              <th class="der">Aves</th><th class="der">Kg</th><th class="der">Monto</th><th>SUNAT</th></tr></thead>
            <tbody>${ncs.map((nc) => {
              const f = original(nc);
              return `<tr>
                <td class="mono nowrap">${fmt.fecha(nc.fecha_factura)}</td>
                <td class="mono nowrap fuerte">${esc(nc.nro_factura)}</td>
                <td class="mono nowrap ${porFactura[nc.factura_ref] > 1 ? 'celda-amarilla' : ''}">${esc(nc.factura_ref)}<div class="sutil">${f ? fmt.fecha(f.fecha_factura) : ''}</div></td>
                <td class="mono nowrap">${esc(nc.placa || '—')}<div class="sutil">${esc(nc.guia || '')}</div></td>
                <td class="mono">${esc(nc.lote)}</td>
                <td class="nowrap">${esc(nc.sexo)}<div class="sutil mono">${esc(nc.material)}</div></td>
                <td class="der mono">${fmt.num(-nc.ctd_factura)}</td>
                <td class="der mono">${fmt.num(-nc.peso_neto, 2)}</td>
                <td class="der mono fuerte">${fmt.soles(-nc.valor_neto)}</td>
                <td class="nowrap">${chip('Aceptada', 'verde')}</td>
              </tr>`;
            }).join('')}</tbody>
            <tfoot><tr><td colspan="6">Total</td><td class="der mono">${fmt.num(und)}</td><td class="der mono">${fmt.num(kg, 2)}</td><td class="der mono">${fmt.soles(soles)}</td><td></td></tr></tfoot>
          </table></div>
          <p class="nota-detalle">En amarillo, las facturas con más de una NC (por ejemplo, macho y hembra del mismo camión).</p>`
          : '<p class="vacio">Aún no tienes notas de crédito por mortalidad.</p>'}
        </div>
      </section>

      <div class="dos-col">
        <section class="seccion">
          ${seccionCab('EN PROCESO', 'Camiones en evaluación', `${enProceso.length} registros`)}
          <div class="panel panel--tabla">
            ${enProceso.length ? `<div class="tabla-wrap"><table class="tabla tabla--mini">
              <thead><tr><th>Fecha de saca</th><th>Placa · GR</th><th>Factura</th><th>Producto</th><th>Estado</th></tr></thead>
              <tbody>${enProceso.map((x) => `<tr>
                <td class="mono nowrap">${fmt.fecha(x.c.fecha_saca)}</td>
                <td class="mono nowrap">${esc(x.r.placa)}<div class="sutil">${esc(x.r.guia)}</div></td>
                <td class="mono nowrap">${esc(x.f.nro_factura)}</td>
                <td class="nowrap">${esc(x.f.sexo)}<div class="sutil mono">${esc(x.f.material)}</div></td>
                <td>${chip(x.estado[0], x.estado[1])}</td>
              </tr>`).join('')}</tbody></table></div>
              <p class="nota-detalle">La cantidad final se confirma al emitir la nota de crédito.</p>`
            : '<p class="vacio">No tienes camiones en evaluación.</p>'}
          </div>
        </section>

        <section class="seccion">
          ${seccionCab('FACTURAS', 'Saldo devuelto por factura', 'Una factura puede tener NC por partes')}
          <div class="panel panel--tabla"><div class="tabla-wrap"><table class="tabla tabla--mini">
            <thead><tr><th>Factura · lote</th><th class="der">Facturado</th><th class="der">Devuelto</th><th class="der">% devuelto</th><th class="der">NC</th></tr></thead>
            <tbody>${lineas.map((x) => `<tr>
              <td class="mono nowrap">${esc(x.f.nro_factura)}<div class="sutil">${esc(x.f.lote)} · ${esc(x.f.sexo)}</div></td>
              <td class="der mono">${fmt.num(x.f.ctd_factura)} aves</td>
              <td class="der mono">${fmt.num(x.und)} aves</td>
              <td class="der mono">${fmt.num((x.und / x.f.ctd_factura) * 100, 2)} %</td>
              <td class="der mono">${x.n}</td>
            </tr>`).join('')}</tbody>
          </table></div></div>
        </section>
      </div>`;

    return {
      titulo: 'Mis devoluciones',
      subtitulo: 'Notas de crédito de San Fernando por mortalidad de aves vivas y su estado.',
      html,
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.devoluciones = render;
})();
