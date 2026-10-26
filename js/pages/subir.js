// Portal auditor · Subir reporte: tipo → archivo → vista previa con validaciones → enviado.
// La lectura del Excel es simulada: la vista previa usa filas de ejemplo armadas con facturas reales de la BBDD.
(function () {
  'use strict';
  const { fmt, esc, chip, icono, FLUJO } = window.U;
  const { seccionCab } = window.C;

  const FECHA_EJEMPLO = '2026-10-22';
  const PASOS = ['Tipo de reporte', 'Archivo', 'Revisar', 'Enviado'];
  const TIPOS = {
    despacho: {
      titulo: 'Despacho', icono: 'camion', archivo: (n) => `Mort Pro ${n} Ayacucho y Apurímac.xlsx`,
      desc: 'Mortalidad al cargar o al llegar el camión ("Mort Pro … Ayacucho y Apurímac").', nota: 'No requiere aprobación.',
    },
    postdescarga: {
      titulo: 'Post descarga', icono: 'descarga', archivo: () => 'EVALUACIÓN POSTDESCARGA.xlsx',
      desc: 'Evaluación después de la descarga en el cliente ("Evaluación postdescarga").', nota: 'San Fernando define el % de aprobación del archivo.',
    },
  };
  const nuevo = () => ({ paso: 0, flujo: null, fecha: FECHA_EJEMPLO, archivo: null, filas: [], comentario: '', creado: null });
  let st = nuevo();

  function auditorActual() {
    const u = window.App.usuario();
    return { u, a: window.S.auditores[u.auditor_id] };
  }

  // Filas de ejemplo: una por línea de factura (camión × sexo) de facturas aún no reclamadas.
  function filasEjemplo(flujo) {
    const usadas = new Set(window.DB.cruce.flatMap((c) => [c.factura_id, ...(c.candidatas || [])]));
    const lineas = window.DB.factura_sap.filter((f) => f.tipo === 'FA' && f.fecha_factura === FECHA_EJEMPLO && f.placa && !usadas.has(f.id));
    const filas = lineas.slice(0, 7).map((l, i) => {
      const cli = window.DB.cliente.find((c) => c.codigo === l.cliente_codigo);
      const muertos = flujo === 'despacho' ? (l.ctd_factura % 29) + 3 : (l.ctd_factura % 17) + 2;
      const und = muertos;
      return {
        cliente: cli.nombre_corto, razon_social: cli.nombre_auditor, placa: l.placa, guia: l.guia,
        plantel: l.denom_centro.split(' ').slice(0, 2).join(' '), galpon: `G-${String((l.ctd_factura % 13) + 1).padStart(2, '0')}`,
        sexo: l.sexo, carga_aves: l.ctd_factura, muertos, und_reconocer: und,
        kg_reconocer: Math.round(und * (l.peso_neto / l.ctd_factura) * 0.98 * 100) / 100,
        _aviso: null,
      };
    });
    // Una fila sin KG (error típico del Excel) y una que no procede.
    if (filas.length > 4) { filas[3].kg_reconocer = 0; filas[3]._aviso = 'Falta KG a reconocer'; }
    if (filas.length > 1) { const f = filas[filas.length - 1]; f.muertos = 1; f.und_reconocer = 0; f.kg_reconocer = 0; f._aviso = 'Sin aves a reconocer'; }
    return filas;
  }

  function stepper() {
    return `<ol class="stepper" aria-label="Pasos">${PASOS.map((p, i) => `
      <li class="stepper__paso ${i < st.paso ? 'stepper__paso--hecho' : i === st.paso ? 'stepper__paso--actual' : ''}" ${i === st.paso ? 'aria-current="step"' : ''}>
        <span class="stepper__num mono">${i < st.paso ? icono('check') : i + 1}</span><span>${p}</span>
      </li>`).join('')}</ol>`;
  }

  function pasoTipo() {
    return `<div class="tipos" role="radiogroup" aria-label="Tipo de reporte">
      ${Object.entries(TIPOS).map(([k, t]) => `
        <button type="button" class="tipo ${st.flujo === k ? 'tipo--sel' : ''}" role="radio" aria-checked="${st.flujo === k}" data-flujo="${k}">
          <span class="tipo__icono">${icono(t.icono)}</span>
          <span class="tipo__titulo">${t.titulo}</span>
          <span class="tipo__desc">${t.desc}</span>
          <span class="tipo__nota">${t.nota}</span>
        </button>`).join('')}
    </div>`;
  }

  function pasoArchivo() {
    const t = TIPOS[st.flujo];
    return `<div class="carga-archivo">
      <div class="carga-archivo__fila">
        <span class="chip c-${FLUJO[st.flujo].tono} chip--sin-punto">${t.titulo}</span>
        <button type="button" class="enlace" data-ir="0">Cambiar tipo</button>
      </div>
      <label class="campo" style="max-width:240px"><span class="etiqueta">Fecha de saca</span>
        <input type="date" id="fecha-saca" value="${st.fecha}" max="${window.U.HOY}"></label>
      <label class="zona" id="zona" for="archivo">
        ${icono('subir')}
        <b>Arrastra aquí el Excel del reporte</b>
        <span class="sutil">o haz clic para elegirlo · .xlsx, .xls o .csv</span>
        <input type="file" id="archivo" accept=".xlsx,.xls,.csv" class="sr-only">
      </label>
      <div class="carga-archivo__fila">
        <span class="sutil">¿No tienes uno a mano?</span>
        <button type="button" class="btn btn--sec btn--mini" data-ejemplo>Usar archivo de ejemplo</button>
      </div>
      <p class="nota-detalle">Prototipo: el contenido del archivo no se lee; la vista previa muestra filas de ejemplo con el formato del reporte.</p>
    </div>`;
  }

  function pasoLeyendo() {
    return `<div class="leyendo" role="status">
      ${icono('sap')}<b>Leyendo ${esc(st.archivo.nombre)}…</b>
      <div class="leyendo__barra"><span></span></div>
      <span class="sutil">Reconociendo columnas y validando filas</span>
    </div>`;
  }

  function validaciones() {
    const v = [];
    const n = st.filas.length;
    v.push(['ok', `${n} filas leídas · 12 de 12 columnas reconocidas`]);
    v.push(['ok', `Fecha de saca ${fmt.fecha(st.fecha)} en todas las filas`]);
    v.push(['ok', 'Sexo válido en todas las filas (macho / hembra)']);
    const sinKg = st.filas.filter((f) => f._aviso === 'Falta KG a reconocer').length;
    if (sinKg) v.push(['alerta', `${sinKg} fila sin KG a reconocer: no procederá a NC hasta que la corrijas`]);
    const cero = st.filas.filter((f) => f._aviso === 'Sin aves a reconocer').length;
    if (cero) v.push(['info', `${cero} fila sin aves a reconocer: no procede (es normal)`]);
    const { a } = auditorActual();
    const previo = window.DB.reporte.find((r) => r.flujo === st.flujo && r.fecha_saca === st.fecha && r.auditor_id === a.id);
    if (previo) v.push(['alerta', `Ya enviaste un reporte de ${TIPOS[st.flujo].titulo.toLowerCase()} con esta fecha de saca (reporte ${previo.numero}). Revisa que no sea el mismo.`]);
    return v;
  }

  function pasoRevisar() {
    const proceden = st.filas.filter((f) => f.und_reconocer > 0 && f.kg_reconocer > 0);
    const numero = window.S.siguienteNumeroReporte();
    const asunto = window.U.asuntoReporte(st.flujo, numero, st.fecha);
    const ICON = { ok: 'check', alerta: 'alerta', info: 'alerta' };
    return `<div class="revisar">
      <div class="revisar__resumen">
        <div class="carga">${icono('sap')}<div><b class="mono">${esc(st.archivo.nombre)}</b>
          <span class="sutil">${esc(st.archivo.tamano)} · ${TIPOS[st.flujo].titulo} · saca del ${fmt.fecha(st.fecha)}</span></div>
          <button type="button" class="enlace" data-ir="1">Cambiar archivo</button></div>
        <div class="aprob-card__cifras">
          <div><span class="etiqueta">Filas</span><b class="mono">${st.filas.length}</b></div>
          <div><span class="etiqueta">Proceden a NC</span><b class="mono">${proceden.length}</b></div>
          <div><span class="etiqueta">Aves · kg a reconocer</span><b class="mono">${fmt.num(proceden.reduce((s, f) => s + f.und_reconocer, 0))} · ${fmt.num(proceden.reduce((s, f) => s + f.kg_reconocer, 0), 2)}</b></div>
        </div>
      </div>
      <ul class="validaciones">${validaciones().map(([t, txt]) => `<li class="val val--${t}">${icono(ICON[t])}<span>${esc(txt)}</span></li>`).join('')}</ul>
      <div class="tabla-wrap"><table class="tabla tabla--mini">
        <thead><tr><th>Fecha saca</th><th>Cliente</th><th>Razón social</th><th>Placa</th><th>GR</th><th>Plantel</th><th>Galpón</th><th>Sexo</th>
          <th class="der">Carga aves</th><th class="der">Muertos</th><th class="der">N° aves a reconocer</th><th class="der">KG a reconocer</th><th>Procede</th></tr></thead>
        <tbody>${st.filas.map((f) => {
          const ok = f.und_reconocer > 0 && f.kg_reconocer > 0;
          return `<tr class="${f._aviso === 'Falta KG a reconocer' ? 'fila-error' : ok ? '' : 'fila-apagada'}">
            <td class="mono nowrap">${fmt.fechaCorta(st.fecha)}</td><td>${esc(f.cliente)}</td><td class="col-razon">${esc(f.razon_social)}</td>
            <td class="mono nowrap">${esc(f.placa)}</td><td class="mono nowrap">${esc(f.guia)}</td><td class="nowrap">${esc(f.plantel)}</td><td>${esc(f.galpon)}</td><td>${esc(f.sexo)}</td>
            <td class="der mono">${fmt.num(f.carga_aves)}</td><td class="der mono">${fmt.num(f.muertos)}</td>
            <td class="der mono fuerte">${fmt.num(f.und_reconocer)}</td>
            <td class="der mono fuerte">${f.kg_reconocer ? fmt.num(f.kg_reconocer, 2) : '<span class="txt-rojo">vacío</span>'}</td>
            <td>${ok ? chip('Sí', 'verde') : chip(f._aviso || 'No', f._aviso === 'Falta KG a reconocer' ? 'rojo' : 'gris')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="revisar__envio">
        <div class="campo"><span class="etiqueta">Asunto con el que se registra</span><span class="mono asunto">${esc(asunto)}</span></div>
        <label class="campo"><span class="etiqueta">Comentario para San Fernando (opcional)</span>
          <textarea id="comentario-auditor" rows="2" placeholder="Ej.: el camión ABC-123 llegó con 2 horas de retraso.">${esc(st.comentario)}</textarea></label>
        <div class="confirmar__botones">
          <button type="button" class="btn" data-enviar>${icono('envios')} Enviar reporte</button>
          <button type="button" class="btn btn--sec" data-ir="1">Cambiar archivo</button>
        </div>
      </div>
    </div>`;
  }

  function pasoEnviado() {
    const rep = st.creado;
    const post = rep.flujo === 'postdescarga';
    return `<div class="enviado">
      <span class="enviado__check">${icono('check')}</span>
      <h2>Recibimos tu reporte</h2>
      <p class="mono asunto">${esc(rep.asunto_correo)}</p>
      <p>Lo registramos como <b>reporte ${rep.numero}</b>. Puedes seguir su avance en Mis envíos.</p>
      <ol class="enviado__pasos">
        <li>Facturación cruza cada fila con las facturas de San Fernando.</li>
        ${post ? '<li>El jefe de facturación define el % de aprobación del archivo.</li>' : ''}
        <li>Se emiten las notas de crédito en SAP y SUNAT.</li>
        <li>Te respondemos en el mismo hilo con el detalle de las NC.</li>
      </ol>
      <div class="confirmar__botones" style="justify-content:center">
        <a class="btn" href="#/caso/${rep.numero}">Ver mi envío</a>
        <button type="button" class="btn btn--sec" data-otro>Subir otro reporte</button>
      </div>
    </div>`;
  }

  function render() {
    const { u, a } = auditorActual();
    const cuerpo = [pasoTipo, pasoArchivo, pasoRevisar, pasoEnviado][st.paso];
    const html = `
      <div class="remitente">
        ${icono('correo')}<span>Enviando como <b>${esc(a.nombre)}</b> · ${esc(u.nombre)} · <span class="mono">${esc(a.correo)}</span></span>
      </div>
      ${stepper()}
      <section class="panel subir" id="panel-subir">
        ${st.paso === 0 ? `<div class="panel__cab"><h2 class="panel__titulo">¿Qué reporte vas a enviar?</h2></div>` : ''}
        ${st.leyendo ? pasoLeyendo() : cuerpo()}
      </section>`;

    return {
      titulo: 'Subir reporte',
      subtitulo: 'Envía tu Excel de mortalidad. San Fernando lo cruza con sus facturas y te responde en el mismo hilo.',
      html,
      montar(vista) {
        const leer = (nombre, tamano) => {
          st.archivo = { nombre, tamano };
          st.leyendo = true;
          window.App.render();
          setTimeout(() => { st.leyendo = false; st.filas = filasEjemplo(st.flujo); st.paso = 2; window.App.render(); }, 900);
        };
        const input = vista.querySelector('#archivo');
        if (input) {
          input.addEventListener('change', () => {
            const f = input.files[0];
            if (f) leer(f.name, `${fmt.num(f.size / 1024, 0)} KB`);
          });
          const zona = vista.querySelector('#zona');
          ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('zona--activa'); }));
          ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove('zona--activa')));
          zona.addEventListener('drop', (e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) leer(f.name, `${fmt.num(f.size / 1024, 0)} KB`);
          });
          vista.querySelector('#fecha-saca').addEventListener('change', (e) => { st.fecha = e.target.value || FECHA_EJEMPLO; });
        }
        const com = vista.querySelector('#comentario-auditor');
        if (com) com.addEventListener('input', (e) => { st.comentario = e.target.value; });
        vista.addEventListener('click', (e) => {
          const t = e.target.closest('[data-flujo]');
          if (t) { st.flujo = t.dataset.flujo; st.paso = 1; window.App.render(); return; }
          const ir = e.target.closest('[data-ir]');
          if (ir) { st.paso = Number(ir.dataset.ir); window.App.render(); return; }
          if (e.target.closest('[data-ejemplo]')) {
            leer(TIPOS[st.flujo].archivo(window.S.siguienteNumeroReporte()), '48 KB');
            return;
          }
          if (e.target.closest('[data-enviar]')) {
            st.creado = window.S.crearReporte({
              flujo: st.flujo, fechaSaca: st.fecha, archivo: st.archivo.nombre, auditorId: a.id, actor: u.nombre,
              comentario: st.comentario.trim(),
              filas: st.filas.map(({ _aviso, ...f }) => f),
            });
            st.paso = 3;
            window.App.toast(`Reporte ${st.creado.numero} enviado.`);
            window.App.render();
            return;
          }
          if (e.target.closest('[data-otro]')) { st = nuevo(); window.App.render(); }
        });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.subir = render;
})();
