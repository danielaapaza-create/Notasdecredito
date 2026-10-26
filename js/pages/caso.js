// Detalle del caso: resumen + línea de tiempo, registros con su cruce, saldo por factura e hilo de eventos.
(function () {
  'use strict';
  const { fmt, esc, chip, chipEstadoCaso, chipFlujo, chipCruce, sinDato, icono, FLUJO } = window.U;
  const { seccionCab, cinta, dato } = window.C;
  const { SEXO_MATERIAL, normalizar } = window.Cruce;

  const PENDIENTES = ['SIN FACTURA EN BBDD', 'SIN COINCIDENCIA DE UNIDADES', 'CONFLICTO', 'REVISAR'];
  const FILTROS_REG = {
    todos: { label: 'Todos', fn: () => true },
    llenado: { label: 'Con factura', fn: (r, c) => c?.estado === 'LLENADO' },
    pendientes: { label: 'Pendientes', fn: (r, c) => c && PENDIENTES.includes(c.estado) },
    existente: { label: 'NC existente', fn: (r, c) => c?.estado === 'YA REGISTRADO' },
    noprocede: { label: 'No procede', fn: (r) => !r.procede },
  };
  let filtroReg = 'todos';
  let abiertos = new Set(); // registros con el detalle desplegado
  let casoAnterior = null;

  const ETAPAS = [
    ['pedido', 'Pedido VA01'], ['entrega', 'Entrega VL01N'], ['traslado', 'Traslado MIGO 321'], ['nc', 'NC'], ['sunat', 'SUNAT'],
  ];

  const dif = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);
  const ok = (b, txt) => `<span class="regla ${b === true ? 'regla--ok' : b === 'parcial' ? 'regla--parcial' : 'regla--no'}">${icono(b === true ? 'check' : 'alerta')}${esc(txt)}</span>`;

  // Tabla de facturas candidatas con el cumplimiento de cada regla.
  function candidatas(reg, cr, c, puedeAsignar) {
    if (!cr.candidatas?.length) {
      if (cr.estado === 'SIN FACTURA EN BBDD') {
        return `<p class="nota-detalle">No hay líneas de factura que revisar. Si la factura existe en SAP, puede faltar la extracción de ese día:
          <a href="#/facturacion">revisar Facturación diaria</a>.</p>`;
      }
      return '';
    }
    const lineas = cr.candidatas.map((id) => window.S.facturas[id]);
    const totalPorFactura = {};
    for (const l of window.DB.factura_sap) {
      if (l.tipo === 'FA' && SEXO_MATERIAL[l.material] === reg.sexo) totalPorFactura[l.nro_factura] = (totalPorFactura[l.nro_factura] || 0) + l.ctd_factura;
    }
    const objetivo = normalizar(reg.razon_social);
    return `<div class="tabla-wrap"><table class="tabla tabla--mini">
      <thead><tr>${puedeAsignar ? '<th><span class="sr-only">Acción</span></th>' : ''}<th>Fecha</th><th>Nro. factura</th><th>Razón social SAP</th><th>Material</th><th>Lote</th><th class="der">Ctd.</th><th class="der">Peso neto</th><th>Reglas</th></tr></thead>
      <tbody>${lineas.map((l) => {
        const d = dif(l.fecha_factura, c.fecha_saca);
        const n = normalizar(l.razon_social);
        const rs = n === objetivo ? true : (n.includes(objetivo) || objetivo.includes(n)) ? 'parcial' : false;
        const tot = totalPorFactura[l.nro_factura];
        const asignada = cr.factura_id === l.id;
        return `<tr class="${asignada ? 'fila-asignada' : ''}">
          ${puedeAsignar ? `<td><button type="button" class="btn btn--mini" data-asignar="${l.id}" data-registro="${reg.id}">Asignar</button></td>` : ''}
          <td class="mono nowrap">${fmt.fecha(l.fecha_factura)}</td>
          <td class="mono nowrap">${esc(l.nro_factura)}${asignada ? ' <span class="chip c-verde chip--sin-punto">Asignada</span>' : ''}</td>
          <td>${esc(l.razon_social)}</td>
          <td class="mono">${esc(l.material)}<div class="sutil">${esc(l.sexo)}</div></td>
          <td class="mono">${esc(l.lote)}</td>
          <td class="der mono">${fmt.num(l.ctd_factura)}</td>
          <td class="der mono">${fmt.num(l.peso_neto, 2)}</td>
          <td><div class="reglas">
            ${ok(Math.abs(d) <= 1, d === 0 ? 'Fecha = saca' : `Fecha ${d > 0 ? '+' : ''}${d} día`)}
            ${ok(rs, rs === 'parcial' ? 'Razón social parcial' : 'Razón social')}
            ${ok(SEXO_MATERIAL[l.material] === reg.sexo, `Sexo ${SEXO_MATERIAL[l.material]?.toLowerCase()}`)}
            ${ok(tot === reg.carga_aves, `Unidades ${fmt.num(tot)} / ${fmt.num(reg.carga_aves)}`)}
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function docsRegistro(reg) {
    const docs = window.S.docsDe(reg.id);
    if (!docs.length) return '';
    return `<div class="docs-reg"><span class="etiqueta">Documentos SAP</span>
      <div class="docs-reg__lista">${ETAPAS.map(([k, label]) => {
        const d = docs.find((x) => x.etapa === k);
        if (!d) return `<span class="doc-sap doc-sap--pend"><span>${label}</span><b class="mono">Pendiente</b></span>`;
        if (d.estado === 'error') return `<span class="doc-sap doc-sap--error" title="${esc(d.mensaje)}"><span>${label}</span><b>${esc(d.mensaje)}</b></span>`;
        return `<span class="doc-sap doc-sap--ok" title="${esc(d.mensaje)}"><span>${label}${d.clase ? ` · ${d.clase}` : ''}</span><b class="mono">${esc(d.numero)}</b></span>`;
      }).join('<span class="docs-reg__flecha" aria-hidden="true">→</span>')}</div>
      <span class="sutil">Secuencia de etapas por confirmar.</span></div>`;
  }

  function tablaRegistros(c, puedeEditar) {
    const conPct = c.flujo === 'postdescarga' && c.pct != null;
    const facturasRepetidas = {};
    c.cruces.forEach((cr) => {
      if (!cr.factura_id) return;
      const nro = window.S.facturas[cr.factura_id].nro_factura;
      facturasRepetidas[nro] = (facturasRepetidas[nro] || 0) + 1;
    });
    const filtro = FILTROS_REG[filtroReg].fn;
    const regs = c.registros.filter((r) => filtro(r, window.S.cruceDe(r.id)));
    const cols = conPct ? 15 : 13;

    const filas = regs.map((r, i) => {
      const cr = window.S.cruceDe(r.id);
      const f = cr?.factura_id ? window.S.facturas[cr.factura_id] : null;
      const abierto = abiertos.has(r.id);
      const amarilla = f && facturasRepetidas[f.nro_factura] > 1;
      const puedeAsignar = puedeEditar && cr && PENDIENTES.includes(cr.estado) && cr.estado !== 'SIN FACTURA EN BBDD';
      const pctUnd = c.pct == null ? null : Math.round((r.und_reconocer * c.pct) / 100);
      const pctKg = c.pct == null ? null : Math.round(r.kg_reconocer * c.pct) / 100;
      return `
      <tr class="${r.procede ? '' : 'fila-apagada'}">
        <td>${cr ? `<button type="button" class="btn-icono" data-toggle="${r.id}" aria-expanded="${abierto}" aria-label="${abierto ? 'Ocultar' : 'Ver'} detalle del registro ${i + 1}">${icono(abierto ? 'arriba' : 'abajo')}</button>` : ''}</td>
        <td class="mono sutil">${c.registros.indexOf(r) + 1}</td>
        <td class="mono nowrap">${esc(r.placa)}<div class="guia sutil">${esc(r.guia).replace(' y ', '<br>y ')}</div></td>
        <td class="col-razon">${esc(r.razon_social)}<div class="sutil">${esc(r.cliente)}</div></td>
        <td class="nowrap">${esc(r.plantel)}<div class="sutil">${esc(r.galpon)}</div></td>
        <td>${esc(r.sexo)}</td>
        <td class="der mono">${fmt.num(r.carga_aves)}</td>
        <td class="der mono">${fmt.num(r.muertos)}</td>
        <td class="der mono fuerte">${fmt.num(r.und_reconocer)}</td>
        <td class="der mono fuerte">${fmt.num(r.kg_reconocer, 2)}</td>
        ${conPct ? `<td class="der mono">${pctUnd == null ? '—' : fmt.num(pctUnd)}</td><td class="der mono">${pctKg == null ? '—' : fmt.num(pctKg, 2)}</td>` : ''}
        <td>${!r.procede ? chip('No procede', 'gris', 'chip--sin-punto') : cr ? chipCruce(cr.estado) : sinDato()}</td>
        <td class="mono nowrap ${amarilla ? 'celda-amarilla' : ''}">${f ? esc(f.nro_factura) : sinDato()}</td>
        <td class="mono">${f ? esc(f.lote) : '—'}</td>
      </tr>
      ${cr && abierto ? `<tr class="fila-detalle"><td colspan="${cols}">
        <div class="detalle">
          <p class="detalle__texto">${chipCruce(cr.estado)} ${esc(cr.detalle)}</p>
          ${candidatas(r, cr, c, puedeAsignar)}
          ${docsRegistro(r)}
        </div>
      </td></tr>` : ''}`;
    }).join('');

    return `
      <div class="filtros-rapidos" role="group" aria-label="Filtrar registros">
        ${Object.entries(FILTROS_REG).map(([k, v]) => {
          const n = c.registros.filter((r) => v.fn(r, window.S.cruceDe(r.id))).length;
          return `<button type="button" class="pildora ${filtroReg === k ? 'pildora--activa' : ''}" data-filtro-reg="${k}">${v.label} <b class="mono">${n}</b></button>`;
        }).join('')}
      </div>
      <div class="tabla-wrap">
        <table class="tabla">
          <thead><tr>
            <th><span class="sr-only">Detalle</span></th><th>#</th><th>Placa · GR</th><th>Razón social (auditor)</th><th>Plantel</th><th>Sexo</th>
            <th class="der">Carga</th><th class="der">Muertos</th><th class="der">UND</th><th class="der">KG</th>
            ${conPct ? `<th class="der">UND ${c.pct ?? '?'} %</th><th class="der">KG ${c.pct ?? '?'} %</th>` : ''}
            <th>Cruce</th><th>Factura</th><th>Lote</th>
          </tr></thead>
          <tbody>${filas || `<tr><td colspan="${cols}" class="vacio">No hay registros con este filtro.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function tablaSaldo(c) {
    const filas = window.S.saldoFacturas(c);
    if (!filas.length) return `<p class="vacio">Aún no hay facturas asignadas.</p>`;
    const repetidas = {};
    filas.forEach((f) => { repetidas[f.factura.nro_factura] = (repetidas[f.factura.nro_factura] || 0) + 1; });
    const par = (u, k, cls = '') => `<td class="der mono ${cls}">${fmt.num(u)}</td><td class="der mono ${cls}">${fmt.num(k, 2)}</td>`;
    return `<div class="tabla-wrap"><table class="tabla tabla--saldo">
      <thead>
        <tr><th rowspan="2">Factura</th><th rowspan="2">Lote</th><th rowspan="2">Sexo</th>
          <th colspan="2" class="centro grupo">Facturado</th><th colspan="2" class="centro grupo">Devuelto antes</th>
          <th colspan="2" class="centro grupo">Este caso</th><th colspan="2" class="centro grupo">Disponible</th></tr>
        <tr><th class="der">UND</th><th class="der">KG</th><th class="der">UND</th><th class="der">KG</th><th class="der">UND</th><th class="der">KG</th><th class="der">UND</th><th class="der">KG</th></tr>
      </thead>
      <tbody>${filas.map((f) => `
        <tr>
          <td class="mono nowrap ${repetidas[f.factura.nro_factura] > 1 ? 'celda-amarilla' : ''}">${esc(f.factura.nro_factura)}<div class="sutil">${fmt.fecha(f.factura.fecha_factura)} · ${esc(f.factura.doc_facturacion)}</div></td>
          <td class="mono">${esc(f.factura.lote)}</td>
          <td>${esc(f.factura.sexo)}</td>
          ${par(f.factura.ctd_factura, f.factura.peso_neto)}
          ${f.otrasNc.length
            ? `<td class="der mono" title="${esc(f.otrasNc.map((n) => n.nro_factura).join(', '))}">${fmt.num(f.otrosUnd)}<div class="sutil">${f.otrasNc.length} NC</div></td><td class="der mono">${fmt.num(f.otrosKg, 2)}</td>`
            : par(0, 0, 'sutil')}
          ${par(f.esteUnd, f.esteKg, 'fuerte')}
          ${par(f.dispUnd, f.dispKg, f.dispUnd < 0 ? 'txt-rojo' : 'txt-verde')}
        </tr>`).join('')}</tbody>
    </table></div>`;
  }

  const TONO_EVENTO = { recepcion: 'gris', cruce: 'azul', aprobacion: 'naranja', sap: 'celeste', nc: 'violeta', sunat: 'violeta', correo: 'verde', observacion: 'rojo' };
  const ICONO_EVENTO = { recepcion: 'recibido', cruce: 'cruce', aprobacion: 'aprobar', sap: 'sap', nc: 'nc', sunat: 'nc', correo: 'correo', observacion: 'alerta' };

  function hilo(c) {
    return `<ol class="hilo">${c.eventos.map((e) => `
      <li class="hilo__item t-${TONO_EVENTO[e.tipo] || 'gris'}">
        <span class="hilo__punto">${icono(ICONO_EVENTO[e.tipo] || 'reloj')}</span>
        <div class="hilo__cuerpo">
          <div class="hilo__meta"><b>${esc(e.actor)}</b><span class="mono">${fmt.fechaHora(e.fecha_hora)}</span></div>
          <p>${esc(e.descripcion)}</p>
        </div>
      </li>`).join('')}
    </ol>`;
  }

  // Siguiente paso que le toca al perfil actual, con su botón.
  function siguientePaso(c, perfil) {
    if (perfil !== 'analista') {
      if (c.estado === 'pendiente_aprobacion' && perfil === 'jefe') {
        return { tono: 'naranja', texto: 'Este archivo espera que definas el % de aprobación.', boton: '<button type="button" class="btn" data-accion="ir-aprobacion">Definir % de aprobación</button>' };
      }
      return rechazo(c);
    }
    if (c.estado === 'recibido') {
      return { tono: 'azul', texto: `El archivo tiene ${c.registros.length} registros (${c.nProcede} proceden) y aún no se cruza con la BBDD de facturas.`, boton: '<button type="button" class="btn" data-accion="cruzar">Ejecutar cruce</button>' };
    }
    if (c.estado === 'en_cruce') {
      if (c.pendientes.length) {
        return { tono: 'rojo', texto: `Quedan ${c.pendientes.length} registros pendientes. Ábrelos para ver las facturas candidatas y asignar la correcta.`, boton: '<button type="button" class="btn btn--sec" data-accion="ver-pendientes">Ver pendientes</button>' };
      }
      return c.flujo === 'postdescarga'
        ? { tono: 'verde', texto: 'Cruce completo. El archivo pasa al jefe de facturación para el % de aprobación.', boton: '<button type="button" class="btn" data-accion="sap">Enviar a aprobación</button>' }
        : { tono: 'verde', texto: 'Cruce completo. Todos los registros que proceden tienen factura.', boton: '<button type="button" class="btn" data-accion="sap">Pasar a SAP</button>' };
    }
    if (c.estado === 'con_observaciones') {
      return { tono: 'rojo', texto: `${c.pendientes.length} registro sin factura: se consultó al auditor. Los demás siguen en SAP.`, boton: '<button type="button" class="btn btn--sec" data-accion="ver-pendientes">Ver pendientes</button>' };
    }
    if (c.estado === 'pendiente_aprobacion') return { tono: 'naranja', texto: 'Esperando que el jefe de facturación defina el % de aprobación del archivo.', boton: '' };
    if (c.estado === 'nc_emitida') return { tono: 'violeta', texto: `${c.ncs.length} NC emitidas y aceptadas por SUNAT. Falta enviar el correo de NC al auditor.`, boton: '<button type="button" class="btn" data-accion="ir-correo">Preparar correo</button>' };
    if (c.estado === 'en_sap') return { tono: 'azul', texto: 'Los registros avanzan en SAP: pedido, entrega, traslado, NC y SUNAT.', boton: `<a class="btn btn--sec" href="#/documentos/${c.numero}">Ver en Documentos SAP</a>` };
    return rechazo(c);
  }

  function rechazo(c) {
    if (c.estado !== 'rechazado' || !c.aprobacion) return null;
    return { tono: 'rojo', texto: `Archivo rechazado por ${c.aprobacion.aprobador} el ${fmt.fechaHora(c.aprobacion.fecha)}. Motivo: "${c.aprobacion.comentario.replace(/\.$/, '')}". No se emiten NC.`, boton: '' };
  }

  // ---------- Correo de NC al auditor (respuesta al mismo hilo) ----------
  let correoConfirmar = false;
  const COLUMNAS_CORREO = [
    ['fecha_factura', 'Fecha factura'], ['nro_factura', 'NRO. FACTURA'], ['ctd_factura', 'Ctd.factura UME'], ['peso_neto', 'Peso neto'],
    ['placa', 'PLACA'], ['gr', 'GR'], ['cliente', 'CLIENTE'], ['razon_social', 'Razón Social: Dest.Merc.'], ['denom_centro', 'Denom.Centro'],
    ['centro', 'Centro'], ['material', 'Material'], ['factura', 'Factura'], ['lote', 'Lote'], ['und', 'UND'], ['kg', 'KG'], ['prom', 'PROM'],
    ['v_net_dev', 'V.NET/DEV'],
  ];
  const fechaSap = (iso) => iso.split('-').reverse().join('.');
  function valorCorreo(f, k) {
    if (k === 'fecha_factura') return fechaSap(f[k]);
    if (k === 'ctd_factura' || k === 'und') return fmt.num(f[k]);
    if (k === 'peso_neto' || k === 'kg' || k === 'prom' || k === 'v_net_dev') return fmt.num(f[k], 2);
    return f[k];
  }
  function tsvCorreo(filas) {
    return [COLUMNAS_CORREO.map(([, h]) => h).join('\t'), ...filas.map((f) => COLUMNAS_CORREO.map(([k]) => valorCorreo(f, k)).join('\t'))].join('\n');
  }

  function seccionCorreo(c, perfil) {
    const filas = window.S.filasCorreo(c);
    const enviado = c.correo;
    const repetidas = {};
    filas.forEach((f) => { repetidas[f.nro_factura] = (repetidas[f.nro_factura] || 0) + 1; });
    const remitente = enviado ? enviado.enviado_por : (window.DB.usuario.find((u) => u.perfil === 'analista') || {}).nombre;
    const tot = (k) => filas.reduce((a, f) => a + f[k], 0);
    const puedeEnviar = perfil === 'analista' && c.estado === 'nc_emitida';
    const amarillas = new Set(['nro_factura', 'factura']);
    return `<section class="seccion" id="sec-correo">
      ${seccionCab('CORREO', enviado ? 'Correo de NC enviado' : 'Correo de NC al auditor', 'Respuesta en el mismo hilo del reporte')}
      <div class="panel correo">
        <dl class="correo__cab">
          <dt>De</dt><dd>${esc(remitente)} &lt;facturacion@sanfernando.example&gt;</dd>
          <dt>Para</dt><dd class="mono">${esc(enviado ? enviado.para : c.auditor.correo)}</dd>
          <dt>CC</dt><dd class="mono">${esc(enviado ? enviado.cc : 'facturacion@sanfernando.example')}</dd>
          <dt>Asunto</dt><dd><b>RE: ${esc(c.asunto_correo)}</b></dd>
          ${enviado ? `<dt>Enviado</dt><dd class="mono">${fmt.fechaHora(enviado.fecha_envio)}</dd>` : ''}
        </dl>
        <div class="correo__cuerpo">
          <p>Buenas noches, se realizaron las siguientes NC:</p>
          <div class="tabla-wrap"><table class="tabla-correo" id="tabla-correo">
            <thead><tr>${COLUMNAS_CORREO.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${filas.map((f) => `<tr>${COLUMNAS_CORREO.map(([k]) => {
              const num = ['ctd_factura', 'peso_neto', 'und', 'kg', 'prom', 'v_net_dev'].includes(k);
              const am = amarillas.has(k) && repetidas[f.nro_factura] > 1;
              return `<td class="${num ? 'der' : ''} ${am ? 'celda-amarilla' : ''}">${esc(valorCorreo(f, k))}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="13">Total</td><td class="der">${fmt.num(tot('und'))}</td><td class="der">${fmt.num(tot('kg'), 2)}</td><td></td><td class="der">${fmt.num(tot('v_net_dev'), 2)}</td></tr></tfoot>
          </table></div>
          <p>Saludos,<br>${esc(remitente)}<br>Facturación · San Fernando</p>
          <blockquote class="correo__cita">
            <b>De:</b> ${esc(c.auditor.contacto)} &lt;${esc(c.auditor.correo)}&gt;<br>
            <b>Enviado:</b> ${fmt.fechaHora(c.fecha_envio)}<br>
            <b>Asunto:</b> ${esc(c.asunto_correo)}<br>
            <b>Adjunto:</b> <span class="mono">${esc(c.archivo)}</span>
          </blockquote>
        </div>
        <div class="correo__acciones" id="correo-acciones">
          ${perfil === 'auditor' ? '<span class="sutil">Esta respuesta llegó a tu correo, en el mismo hilo de tu reporte.</span>' : correoConfirmar && puedeEnviar ? `<div class="confirmar confirmar--verde" role="alert">
              <p>Vas a enviar ${filas.length} NC a <b>${esc(c.auditor.correo)}</b> en respuesta al correo "${esc(c.asunto_correo)}". El caso queda cerrado.</p>
              <div class="confirmar__botones"><button type="button" class="btn" data-correo="confirmar">${icono('envios')} Confirmar envío</button><button type="button" class="btn btn--sec" data-correo="cancelar">Cancelar</button></div>
            </div>` : `
            <button type="button" class="btn btn--sec" data-correo="copiar">Copiar tabla</button>
            ${puedeEnviar ? `<button type="button" class="btn" data-correo="enviar">${icono('envios')} Enviar</button>` : ''}
            <span class="sutil">${enviado ? `Enviado por ${esc(enviado.enviado_por)}.` : 'V.NET/DEV = (valor neto ÷ peso neto) × KG. PROM = KG ÷ UND. En amarillo, la factura con 2 filas (macho y hembra).'}</span>`}
        </div>
      </div>
    </section>`;
  }

  // ---------- Aprobación del archivo (jefe de facturación, solo post descarga) ----------
  let aprob = null; // { numero, pct, comentario, confirmar, error }

  function ultimoAprobado() {
    return window.DB.aprobacion.filter((a) => a.resultado === 'aprobado').sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
  }

  function impactoHtml(c) {
    const imp = window.S.impacto(c, aprob.pct || 0);
    const total = window.S.impacto(c, 100);
    return `
      <div class="impacto__cifra"><span class="etiqueta">Aves a reconocer</span><b class="mono">${fmt.num(imp.und)}</b><span class="sutil mono">de ${fmt.num(total.und)}</span></div>
      <div class="impacto__cifra"><span class="etiqueta">Kg a reconocer</span><b class="mono">${fmt.num(imp.kg, 2)}</b><span class="sutil mono">de ${fmt.num(total.kg, 2)}</span></div>
      <div class="impacto__cifra impacto__cifra--monto"><span class="etiqueta">V.NET/DEV estimado</span><b class="mono">${fmt.soles(imp.monto)}</b><span class="sutil mono">de ${fmt.soles(total.monto)}</span></div>
      ${imp.sinFactura.length ? `<p class="impacto__aviso">${icono('alerta')} ${imp.sinFactura.length} registro sin factura no entra en el cálculo. Se reconocerá con el mismo % cuando se resuelva.</p>` : ''}`;
  }

  function tablaImpactoHtml(c) {
    const imp = window.S.impacto(c, aprob.pct || 0);
    return `<table class="tabla tabla--mini">
      <thead><tr><th>Placa</th><th>Sexo</th><th>Factura</th><th class="der">UND</th><th class="der">KG</th><th class="der">UND ${aprob.pct || 0} %</th><th class="der">KG ${aprob.pct || 0} %</th><th class="der">V.NET/DEV</th></tr></thead>
      <tbody>${imp.filas.map((x) => `<tr>
        <td class="mono">${esc(x.registro.placa)}</td><td>${esc(x.registro.sexo)}</td>
        <td class="mono">${x.factura ? esc(x.factura.nro_factura) : chipCruce(x.cruce?.estado || 'SIN FACTURA EN BBDD')}</td>
        <td class="der mono">${fmt.num(x.registro.und_reconocer)}</td><td class="der mono">${fmt.num(x.registro.kg_reconocer, 2)}</td>
        <td class="der mono fuerte">${fmt.num(x.und)}</td><td class="der mono fuerte">${fmt.num(x.kg, 2)}</td>
        <td class="der mono">${x.monto == null ? '—' : fmt.soles(x.monto)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="5">Total con factura</td><td class="der mono">${fmt.num(imp.und)}</td><td class="der mono">${fmt.num(imp.kg, 2)}</td><td class="der mono">${fmt.soles(imp.monto)}</td></tr></tfoot>
    </table>`;
  }

  function accionesHtml(c) {
    if (aprob.confirmar === 'aprobar') {
      const imp = window.S.impacto(c, aprob.pct);
      return `<div class="confirmar confirmar--verde" role="alert">
        <p>Vas a aprobar el <b>${aprob.pct} %</b> del reporte ${c.numero}: ${fmt.num(imp.und)} aves, ${fmt.num(imp.kg, 2)} kg y ${fmt.soles(imp.monto)} estimados. El caso pasa a SAP.</p>
        <div class="confirmar__botones"><button type="button" class="btn" data-aprob="confirmar-aprobar">Confirmar aprobación</button><button type="button" class="btn btn--sec" data-aprob="cancelar">Cancelar</button></div>
      </div>`;
    }
    if (aprob.confirmar === 'rechazar') {
      return `<div class="confirmar confirmar--rojo" role="alert">
        <p>Vas a <b>rechazar</b> el reporte ${c.numero}. No se emitirán NC y el auditor verá tu comentario.</p>
        <div class="confirmar__botones"><button type="button" class="btn btn--peligro" data-aprob="confirmar-rechazar">Confirmar rechazo</button><button type="button" class="btn btn--sec" data-aprob="cancelar">Cancelar</button></div>
      </div>`;
    }
    return `<div class="confirmar__botones">
      <button type="button" class="btn" data-aprob="aprobar" ${aprob.pct >= 1 && aprob.pct <= 100 ? '' : 'disabled'}>Aprobar ${aprob.pct || 0} %</button>
      <button type="button" class="btn btn--sec btn--sec-rojo" data-aprob="rechazar">Rechazar</button>
    </div>`;
  }

  function seccionAprobacion(c) {
    if (!aprob || aprob.numero !== c.numero) {
      const ult = ultimoAprobado();
      aprob = { numero: c.numero, pct: ult ? ult.porcentaje : 100, comentario: '', confirmar: null, error: '' };
    }
    const ult = ultimoAprobado();
    const ultRep = ult && window.DB.reporte.find((r) => r.id === ult.reporte_id);
    return `<section class="seccion" id="sec-aprobacion">
      ${seccionCab('POR APROBAR', 'Aprobación del archivo completo', 'El % se aplica a todos los registros del archivo')}
      <div class="panel aprob">
        <form class="aprob__control" id="form-aprob" autocomplete="off">
          <div class="campo">
            <label class="etiqueta" for="pct">% de aprobación</label>
            <div class="aprob__pct">
              <input type="range" id="pct-rango" min="0" max="100" step="5" value="${aprob.pct}" aria-label="% de aprobación (deslizador)">
              <span class="aprob__num"><input type="number" id="pct" min="1" max="100" step="1" value="${aprob.pct}" inputmode="numeric"><span>%</span></span>
            </div>
            <div class="aprob__rapidos" role="group" aria-label="Porcentajes frecuentes">
              ${[25, 50, 70, 100].map((v) => `<button type="button" class="pildora ${aprob.pct === v ? 'pildora--activa' : ''}" data-pct="${v}">${v} %</button>`).join('')}
            </div>
            ${ult ? `<span class="sutil">Último % aprobado: ${ult.porcentaje} % (reporte ${ultRep.numero}, ${fmt.fecha(ult.fecha)}).</span>` : ''}
          </div>
          <div class="campo">
            <label class="etiqueta" for="comentario">Comentario</label>
            <textarea id="comentario" rows="3" placeholder="Opcional al aprobar. Obligatorio si rechazas." aria-describedby="comentario-error">${esc(aprob.comentario)}</textarea>
            <span class="campo__error" id="comentario-error">${esc(aprob.error)}</span>
          </div>
          <div id="aprob-acciones">${accionesHtml(c)}</div>
        </form>
        <div class="aprob__impacto">
          <div class="impacto" id="aprob-impacto" aria-live="polite">${impactoHtml(c)}</div>
          <p class="sutil" style="margin:0">V.NET/DEV = (valor neto ÷ peso neto de la factura) × kg devueltos. Fórmula por confirmar.</p>
        </div>
        <div class="aprob__detalle">
          <span class="etiqueta">Detalle por registro</span>
          <div class="tabla-wrap" id="aprob-tabla">${tablaImpactoHtml(c)}</div>
        </div>
      </div>
    </section>`;
  }

  function montarAprobacion(vista, c) {
    const form = vista.querySelector('#form-aprob');
    if (!form) return;
    const refrescar = (acciones = true) => {
      vista.querySelector('#aprob-impacto').innerHTML = impactoHtml(c);
      vista.querySelector('#aprob-tabla').innerHTML = tablaImpactoHtml(c);
      vista.querySelectorAll('[data-pct]').forEach((b) => b.classList.toggle('pildora--activa', Number(b.dataset.pct) === aprob.pct));
      vista.querySelector('#comentario-error').textContent = aprob.error;
      if (acciones) vista.querySelector('#aprob-acciones').innerHTML = accionesHtml(c);
    };
    const fijarPct = (v, origen) => {
      aprob.pct = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      aprob.confirmar = null;
      if (origen !== 'rango') vista.querySelector('#pct-rango').value = aprob.pct;
      if (origen !== 'numero') vista.querySelector('#pct').value = aprob.pct;
      refrescar();
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    vista.querySelector('#pct-rango').addEventListener('input', (e) => fijarPct(e.target.value, 'rango'));
    vista.querySelector('#pct').addEventListener('input', (e) => fijarPct(e.target.value, 'numero'));
    vista.querySelector('#comentario').addEventListener('input', (e) => {
      aprob.comentario = e.target.value;
      if (aprob.error && aprob.comentario.trim()) { aprob.error = ''; refrescar(false); }
    });
    form.addEventListener('click', (e) => {
      const r = e.target.closest('[data-pct]');
      if (r) { fijarPct(r.dataset.pct); return; }
      const a = e.target.closest('[data-aprob]')?.dataset.aprob;
      if (!a) return;
      const actor = window.App.usuario().nombre;
      if (a === 'aprobar') aprob.confirmar = 'aprobar';
      else if (a === 'rechazar') {
        if (!aprob.comentario.trim()) {
          aprob.error = 'Escribe el motivo del rechazo: el auditor lo verá en su caso.';
          refrescar();
          vista.querySelector('#comentario').focus();
          return;
        }
        aprob.confirmar = 'rechazar';
      } else if (a === 'cancelar') aprob.confirmar = null;
      else if (a === 'confirmar-aprobar') {
        window.S.aprobar(c.numero, aprob.pct, aprob.comentario.trim(), actor);
        window.App.toast(`Reporte ${c.numero} aprobado al ${aprob.pct} %. Pasa a SAP.`);
        aprob = null;
        window.App.render();
        return;
      } else if (a === 'confirmar-rechazar') {
        window.S.rechazar(c.numero, aprob.comentario.trim(), actor);
        window.App.toast(`Reporte ${c.numero} rechazado.`, 'rojo');
        aprob = null;
        window.App.render();
        return;
      }
      refrescar();
      const btn = vista.querySelector('#aprob-acciones button');
      if (btn) btn.focus();
    });
  }

  function render({ params }) {
    // El auditor (externo) tiene su propia vista, sin información interna.
    if (window.App.perfil === 'auditor') return window.EnvioAuditor.detalle(params);
    const rep = window.S.reportePorNumero(params[0]);
    if (!rep) {
      return { titulo: 'Caso no encontrado', subtitulo: '', html: `<div class="panel"><p>No existe el reporte ${esc(params[0] || '')}. <a href="#/casos">Volver a Casos</a></p></div>` };
    }
    if (casoAnterior !== rep.numero) { filtroReg = 'todos'; abiertos = new Set(); casoAnterior = rep.numero; correoConfirmar = false; }
    const perfil = window.App.perfil;
    const c = window.S.caso(rep);
    const puedeEditar = perfil === 'analista' && ['en_cruce', 'con_observaciones'].includes(c.estado);
    const paso = siguientePaso(c, perfil);
    const volver = c.flujo === 'postdescarga' ? '#/postdescarga' : '#/despacho';

    const html = `
      <a class="volver" href="${volver}">${icono('atras')} ${FLUJO[c.flujo].label}</a>

      <section class="panel resumen">
        <div class="panel__cab">
          <h2 class="panel__titulo">Reporte ${c.numero}</h2>
          ${chipFlujo(c.flujo)} ${chipEstadoCaso(c.estado)}
          <span class="panel__nota mono">${esc(c.archivo)}</span>
        </div>
        <div class="resumen__datos">
          ${dato('Auditor', esc(c.auditor.nombre), true)}
          ${dato('Fecha de saca', fmt.fecha(c.fecha_saca))}
          ${dato('Recibido', fmt.fechaHora(c.fecha_envio))}
          ${dato('Registros', `${c.registros.length} · ${c.nProcede} proceden`)}
          ${dato('Aves a reconocer', fmt.num(c.undTotal))}
          ${dato('Kg a reconocer', fmt.num(c.kgTotal, 2))}
          ${dato('% de aprobación', c.flujo === 'despacho' ? 'No aplica' : c.pct == null ? 'Pendiente' : `${c.pct} %`)}
        </div>
        ${cinta(c)}
        ${paso ? `<div class="siguiente siguiente--${paso.tono}"><p>${esc(paso.texto)}</p>${paso.boton}</div>` : ''}
      </section>

      ${perfil === 'jefe' && c.estado === 'pendiente_aprobacion' ? seccionAprobacion(c) : ''}
      ${['nc_emitida', 'cerrado'].includes(c.estado) ? seccionCorreo(c, perfil) : ''}

      <section class="seccion" id="sec-registros">
        ${seccionCab('REGISTROS', 'Registros y cruce con facturas SAP', `Fecha de saca ±1 día · razón social · sexo · unidades`)}
        <div class="panel panel--tabla">${tablaRegistros(c, puedeEditar)}</div>
      </section>

      <div class="dos-col">
        <section class="seccion">
          ${seccionCab('SALDO', 'Saldo devuelto por factura', c.flujo === 'postdescarga' && c.pct == null ? 'Este caso al 100 % hasta la aprobación' : '')}
          <div class="panel panel--tabla">${tablaSaldo(c)}
            <p class="nota-detalle">Una NC puede venir por partes. "Devuelto antes" suma las NC de otros casos sobre el mismo lote. En amarillo, la factura con 2 filas (macho y hembra).</p>
          </div>
        </section>
        <section class="seccion">
          ${seccionCab('HILO', 'Todo lo que pasó con este reporte', `${c.eventos.length} eventos`)}
          <div class="panel">
            <p class="hilo__asunto"><span class="etiqueta">Correo del auditor</span><span class="mono">${esc(c.asunto_correo)}</span></p>
            ${hilo(c)}
          </div>
        </section>
      </div>`;

    return {
      titulo: `Reporte ${c.numero}`,
      subtitulo: `${FLUJO[c.flujo].label} · ${c.auditor.nombre} · saca del ${fmt.fecha(c.fecha_saca)}`,
      html,
      montar(vista) {
        montarAprobacion(vista, c);
        const ancla = { aprobar: '#sec-aprobacion', correo: '#sec-correo' }[params[1]];
        if (ancla && vista.querySelector(ancla)) requestAnimationFrame(() => vista.querySelector(ancla).scrollIntoView());
        vista.addEventListener('click', (e) => {
          if (e.target.closest('#form-aprob')) return;
          const co = e.target.closest('[data-correo]')?.dataset.correo;
          if (co === 'copiar') {
            const texto = tsvCorreo(window.S.filasCorreo(c));
            const seleccionar = () => {
              const r = document.createRange();
              r.selectNodeContents(vista.querySelector('#tabla-correo'));
              const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
              window.App.toast('Tabla seleccionada: cópiala con Ctrl+C.', 'azul');
            };
            try {
              navigator.clipboard.writeText(texto).then(() => window.App.toast('Tabla copiada. Pégala en Outlook o Excel.'), seleccionar);
            } catch { seleccionar(); }
            return;
          }
          if (co === 'enviar' || co === 'cancelar') { correoConfirmar = co === 'enviar'; window.App.render(); return; }
          if (co === 'confirmar') {
            const correo = window.S.enviarCorreo(c.numero, window.App.usuario().nombre);
            correoConfirmar = false;
            window.App.toast(`Correo enviado a ${correo.para}. Caso cerrado.`);
            window.App.render();
            return;
          }
          if (e.target.closest('[data-accion="ir-correo"]')) {
            vista.querySelector('#sec-correo').scrollIntoView({ behavior: 'smooth' });
            return;
          }
          if (e.target.closest('[data-accion="ir-aprobacion"]')) {
            vista.querySelector('#sec-aprobacion').scrollIntoView({ behavior: 'smooth' });
            vista.querySelector('#pct').focus({ preventScroll: true });
            return;
          }
          const t = e.target.closest('[data-toggle]');
          if (t) {
            const id = Number(t.dataset.toggle);
            abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id);
            window.App.render();
            return;
          }
          const f = e.target.closest('[data-filtro-reg]');
          if (f) { filtroReg = f.dataset.filtroReg; window.App.render(); return; }
          const a = e.target.closest('[data-asignar]');
          if (a) {
            const u = window.App.usuario();
            window.S.asignarFactura(Number(a.dataset.registro), Number(a.dataset.asignar), u.nombre);
            window.App.toast('Factura asignada. El registro quedó como LLENADO.');
            window.App.render();
            return;
          }
          const acc = e.target.closest('[data-accion]')?.dataset.accion;
          if (acc === 'cruzar') {
            const r = window.S.ejecutarCruce(c.numero, window.App.usuario().nombre);
            window.App.toast(`Cruce ejecutado: ${r.porEstado['LLENADO'] || 0} con factura, ${r.pendientes.length} pendientes.`);
            window.App.render();
          } else if (acc === 'sap') {
            window.S.pasarASap(c.numero, window.App.usuario().nombre);
            window.App.toast(c.flujo === 'postdescarga' ? 'Enviado al jefe de facturación.' : 'Caso pasado a SAP.');
            window.App.render();
          } else if (acc === 'ver-pendientes') {
            filtroReg = 'pendientes';
            c.pendientes.forEach((p) => abiertos.add(p.registro_id));
            window.App.render();
            document.getElementById('sec-registros').scrollIntoView({ behavior: 'smooth' });
          }
        });
      },
    };
  }

  window.Pages = window.Pages || {};
  window.Pages.caso = render;
  window.CasoUI = { seccionCorreo };
})();
