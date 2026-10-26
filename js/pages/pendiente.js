// Pantallas que llegan en las siguientes entregas del prototipo.
(function () {
  'use strict';
  const { esc, icono } = window.U;

  const PROXIMAS = {
    casos: { titulo: 'Casos', sub: 'Bandeja de reportes del auditor con filtros.', entrega: 2, items: ['Filtros por flujo, estado, fecha y auditor', 'Una fila por reporte con avance del cruce y de SAP'] },
    caso: { titulo: 'Detalle del caso', sub: 'Todo lo que pasó con un reporte, en un solo hilo.', entrega: 2, items: ['Línea de tiempo del caso', 'Tabla de registros con el resultado del cruce', 'Saldo devuelto por factura (facturado / devuelto / disponible)'] },
    despacho: { titulo: 'Despacho', sub: 'Reportes "Mort Pro" de Ayacucho y Apurímac.', entrega: 2, items: ['Bandeja de casos filtrada por flujo despacho'] },
    postdescarga: { titulo: 'Post descarga', sub: 'Reportes "Evaluación postdescarga".', entrega: 2, items: ['Bandeja de casos filtrada por flujo post descarga'] },
    'por-aprobar': { titulo: 'Por aprobar', sub: 'Archivos de post descarga que esperan el % de aprobación.', entrega: 3, items: ['Bandeja del jefe de facturación', '% de aprobación para el archivo completo, comentario, Aprobar / Rechazar'] },
    documentos: { titulo: 'Documentos SAP', sub: 'Avance por registro: pedido, entrega, traslado, NC y SUNAT.', entrega: 4, items: ['Números de documento SAP por etapa', 'Errores de SAP con su mensaje', 'Vista previa del correo de NC y botón Enviar (simulado)'] },
    facturacion: { titulo: 'Facturación diaria', sub: 'Extracción ZSDR005 (layout /RALDAZA) y BBDD de facturas.', entrega: 4, items: ['Calendario de días cargados', 'Días faltantes y cargas duplicadas'] },
    subir: { titulo: 'Subir reporte', sub: 'Portal del auditor.', entrega: 5, items: ['Elegir Despacho o Post descarga', 'Carga simulada con vista previa de filas'] },
    envios: { titulo: 'Mis envíos', sub: 'Portal del auditor.', entrega: 5, items: ['Envíos del auditor con su estado', 'Detalle del caso en solo lectura'] },
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
