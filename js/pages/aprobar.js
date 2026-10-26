// Bandeja "Por aprobar": archivos de post descarga que esperan el % del jefe de facturación, e historial.
(function () {
  'use strict';
  const { fmt, esc, chip, chipEstadoCaso, icono } = window.U;
  const { seccionCab, dato } = window.C;

  function tarjeta(c, perfil) {
    const imp = window.S.impacto(c, 100);
    const dias = Math.round((new Date(window.U.HOY + 'T12:00:00') - new Date(c.fecha_envio.slice(0, 10) + 'T12:00:00')) / 86400000);
    const antiguedad = dias >= 3 ? chip(`Esperando ${dias} días`, 'rojo') : chip(dias === 0 ? 'Llegó hoy' : `Esperando ${dias} día${dias > 1 ? 's' : ''}`, 'naranja');
    return `<article class="aprob-card">
      <header class="aprob-card__cab">
        <span class="aviso__num"><small>REP.</small>${c.numero}</span>
        <div class="aprob-card__titulo">
          <h3>${esc(c.archivo)}</h3>
          <div class="aviso__linea">${antiguedad} ${c.pendientes.length ? chip(`${c.pendientes.length} registro sin factura`, 'rojo') : chip('Cruce completo', 'verde')}</div>
        </div>
      </header>
      <div class="aprob-card__datos">
        ${dato('Auditor', esc(c.auditor.nombre), true)}
        ${dato('Fecha de saca', fmt.fecha(c.fecha_saca))}
        ${dato('Recibido', fmt.fechaHora(c.fecha_envio))}
        ${dato('Registros', `${c.registros.length} · ${c.nProcede} proceden`)}
      </div>
      <div class="aprob-card__cifras">
        <div><span class="etiqueta">Aves al 100 %</span><b class="mono">${fmt.num(imp.und)}</b></div>
        <div><span class="etiqueta">Kg al 100 %</span><b class="mono">${fmt.num(imp.kg, 2)}</b></div>
        <div><span class="etiqueta">V.NET/DEV al 100 %</span><b class="mono">${fmt.soles(imp.monto)}</b></div>
      </div>
      <footer class="aprob-card__pie">
        <span class="sutil">${esc(c.asunto_correo)}</span>
        <a class="btn" href="#/caso/${c.numero}${perfil === 'jefe' ? '/aprobar' : ''}">${perfil === 'jefe' ? 'Definir % de aprobación' : 'Ver caso'}</a>
      </footer>
    </article>`;
  }

  function render() {
    const perfil = window.App.perfil;
    const casos = window.S.casos();
    const pendientes = casos.filter((c) => c.estado === 'pendiente_aprobacion').sort((a, b) => a.fecha_envio.localeCompare(b.fecha_envio));
    const historial = window.DB.aprobacion.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map((a) => {
      const c = casos.find((x) => x.id === a.reporte_id);
      return { a, c, imp: a.resultado === 'aprobado' ? window.S.impacto(c, a.porcentaje) : null };
    });

    const html = `
      <section class="seccion">
        ${seccionCab('POR APROBAR', perfil === 'jefe' ? 'Archivos que esperan tu aprobación' : 'Archivos en espera del jefe de facturación', `${pendientes.length} archivo${pendientes.length === 1 ? '' : 's'} · el más antiguo primero`)}
        ${pendientes.length
          ? `<div class="aprob-lista">${pendientes.map((c) => tarjeta(c, perfil)).join('')}</div>`
          : `<div class="panel proximo"><span class="proximo__icono">${icono('check')}</span><div><h2 class="panel__titulo">Nada pendiente</h2><p class="sutil" style="margin:4px 0 0">Todos los archivos de post descarga tienen su % de aprobación.</p></div></div>`}
        <p class="nota-detalle">El % se aplica al archivo completo. Despacho no requiere aprobación.</p>
      </section>

      <section class="seccion">
        ${seccionCab('HISTORIAL', 'Aprobaciones anteriores', `${historial.length} registradas`)}
        <div class="panel panel--tabla"><div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Reporte</th><th>Fecha</th><th>Aprobador</th><th class="der">%</th><th>Resultado</th><th class="der">Aves</th><th class="der">Kg</th><th class="der">V.NET/DEV</th><th>Comentario</th><th>Estado del caso</th></tr></thead>
          <tbody>${historial.map(({ a, c, imp }) => `
            <tr class="fila-click" data-href="#/caso/${c.numero}">
              <td><a class="num-caso mono" href="#/caso/${c.numero}">${c.numero}</a></td>
              <td class="mono nowrap">${fmt.fechaHora(a.fecha)}</td>
              <td class="nowrap">${esc(a.aprobador)}</td>
              <td class="der mono fuerte">${a.resultado === 'aprobado' ? `${a.porcentaje} %` : '—'}</td>
              <td>${a.resultado === 'aprobado' ? chip('Aprobado', 'verde') : chip('Rechazado', 'rojo')}</td>
              <td class="der mono">${imp ? fmt.num(imp.und) : '—'}</td>
              <td class="der mono">${imp ? fmt.num(imp.kg, 2) : '—'}</td>
              <td class="der mono">${imp ? fmt.soles(imp.monto) : '—'}</td>
              <td class="col-razon">${a.comentario ? esc(a.comentario) : '<span class="sutil">Sin comentario</span>'}</td>
              <td>${chipEstadoCaso(c.estado)}</td>
            </tr>`).join('')}</tbody>
        </table></div></div>
      </section>`;

    return {
      titulo: 'Por aprobar',
      subtitulo: 'Archivos de post descarga: el jefe de facturación define el % que se reconoce del archivo completo.',
      html,
      montar(vista) {
        vista.addEventListener('click', (e) => {
          const fila = e.target.closest('.fila-click');
          if (fila && !e.target.closest('a')) location.hash = fila.dataset.href;
        });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages['por-aprobar'] = render;
})();
