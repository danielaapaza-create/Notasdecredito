// Pantallas que llegan en las siguientes entregas del prototipo.
(function () {
  'use strict';
  const { esc, icono } = window.U;

  const PROXIMAS = {
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
