// Pantallas que llegan en las siguientes entregas del prototipo.
(function () {
  'use strict';
  const { esc, icono } = window.U;

  const PROXIMAS = {
    subir: { titulo: 'Subir reporte', sub: 'Portal del auditor.', entrega: 5, items: ['Elegir Despacho o Post descarga', 'Carga simulada con vista previa de filas'] },
    dashboard: { titulo: 'Dashboard', sub: 'Analítica de mortalidad y notas de crédito.', entrega: 6, items: ['Aves y kg reconocidos por semana, cliente y plantel', 'Tiempo de ciclo del caso'] },
    devoluciones: { titulo: 'Mis devoluciones', sub: 'Portal del cliente.', entrega: 6, items: ['Devoluciones del cliente y su estado'] },
  };

  function render({ ruta, params }) {
    const p = PROXIMAS[ruta] || { titulo: 'Página', sub: '', entrega: '—', items: [] };
    const titulo = ruta === 'caso' && params[0] ? `Reporte ${params[0]}` : p.titulo;
    return {
      titulo,
      subtitulo: p.sub,
      html: `<div class="panel proximo">
        <span class="proximo__icono">${icono('obra')}</span>
        <div>
          <h2 class="panel__titulo">Llega en la entrega ${esc(p.entrega)}</h2>
          <ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      </div>`,
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.pendiente = render;
})();
