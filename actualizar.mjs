// Aroscopio: baja los partidos de la NBA, calcula las probabilidades y guarda los datos de la web.
// Se ejecuta solo todos los días desde GitHub Actions. No necesita instalar nada.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.balldontlie.io/v1';
const CLAVE = process.env.BALLDONTLIE_API_KEY;
const PRUEBA = process.env.AROSCOPIO_MOCK;          // archivo con partidos falsos, solo para pruebas
const CARPETA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

// Parámetros del modelo (sistema Elo)
const ELO_INICIAL = 1500;
const MEDIA = 1505;      // hacia dónde vuelven los equipos entre temporadas
const ARRASTRE = 0.75;   // cuánto se conserva de una temporada a otra
const K = 20;            // qué tan rápido cambia la fuerza después de cada partido
const LOCALIA = 100;     // ventaja de jugar en casa, en puntos Elo
const CANSANCIO = 40;    // castigo por haber jugado el día anterior

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const prob = (dif) => 1 / (1 + Math.pow(10, -dif / 400));

function fechaEn(zona, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diasEntre(a, b) {
  return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
}

async function pedir(url, intento = 1) {
  const r = await fetch(url, { headers: { Authorization: CLAVE } });
  if (r.status === 429 && intento <= 5) {
    console.log('Límite de la API alcanzado, espero un minuto...');
    await esperar(65000);
    return pedir(url, intento + 1);
  }
  if (!r.ok) throw new Error(`La API respondió ${r.status}. Revisá la clave BALLDONTLIE_API_KEY.`);
  return r.json();
}

async function traerTemporada(temporada) {
  const todos = [];
  let cursor = null;
  do {
    const url = new URL(API + '/games');
    url.searchParams.append('seasons[]', String(temporada));
    url.searchParams.set('per_page', '100');
    if (cursor) url.searchParams.set('cursor', String(cursor));
    const json = await pedir(url);
    todos.push(...json.data);
    cursor = json.meta && json.meta.next_cursor;
    console.log(`Temporada ${temporada}: ${todos.length} partidos leídos`);
    await esperar(13000); // el plan gratis permite 5 consultas por minuto
  } while (cursor);
  return todos;
}

const equipo = (t) => ({ id: t.id, nombre: t.name, ciudad: t.city, abrev: t.abbreviation });

function normalizar(g) {
  const final = g.status === 'Final';
  return {
    id: g.id,
    fecha: String(g.date).slice(0, 10),
    hora: g.datetime || null,
    temporada: g.season,
    playoffs: !!g.postseason,
    estado: final ? 'final' : (g.period > 0 ? 'en juego' : 'programado'),
    local: equipo(g.home_team),
    visitante: equipo(g.visitor_team),
    pl: g.home_team_score,
    pv: g.visitor_team_score
  };
}

const orden = (a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')) || a.id - b.id;

async function leerJSON(archivo, porDefecto) {
  try { return JSON.parse(await fs.readFile(archivo, 'utf8')); } catch { return porDefecto; }
}

async function main() {
  const hoy = process.env.AROSCOPIO_HOY || fechaEn('America/New_York');
  const [anio, mes] = hoy.split('-').map(Number);
  const temporada = mes >= 9 ? anio : anio - 1;

  let crudos;
  if (PRUEBA) {
    crudos = JSON.parse(await fs.readFile(PRUEBA, 'utf8'));
  } else {
    if (!CLAVE) throw new Error('Falta la clave BALLDONTLIE_API_KEY (se carga como secreto en GitHub).');
    const anterior = await traerTemporada(temporada - 1);
    const actual = await traerTemporada(temporada);
    crudos = [...anterior, ...actual];
  }

  const juegos = crudos
    .filter((g) => g.home_team && g.visitor_team && g.home_team.id <= 30 && g.visitor_team.id <= 30)
    .map(normalizar)
    .sort(orden);

  // Fechas en que juega cada equipo (para saber quién jugó ayer y cuántos días descansó)
  const fechasEquipo = new Map();
  for (const g of juegos) {
    for (const t of [g.local.id, g.visitante.id]) {
      if (!fechasEquipo.has(t)) fechasEquipo.set(t, new Set());
      fechasEquipo.get(t).add(g.fecha);
    }
  }
  const jugoAyer = (id, fecha) => fechasEquipo.get(id)?.has(sumarDias(fecha, -1)) || false;
  const diasDescanso = (id, fecha) => {
    const previas = [...(fechasEquipo.get(id) || [])].filter((f) => f < fecha).sort();
    if (!previas.length) return null;
    return diasEntre(previas[previas.length - 1], fecha) - 1;
  };

  // Recorremos todos los partidos terminados, en orden, actualizando la fuerza de cada equipo
  const elo = new Map();
  const fuerza = (id) => elo.get(id) ?? ELO_INICIAL;
  const arrastrar = () => { for (const [id, v] of elo) elo.set(id, ARRASTRE * v + (1 - ARRASTRE) * MEDIA); };

  function analizar(g) {
    const cL = jugoAyer(g.local.id, g.fecha);
    const cV = jugoAyer(g.visitante.id, g.fecha);
    const d0 = fuerza(g.local.id) - fuerza(g.visitante.id);
    const d1 = d0 + LOCALIA;
    const d2 = d1 + (cV ? CANSANCIO : 0) - (cL ? CANSANCIO : 0);
    const lim = (x) => Math.min(99, Math.max(1, Math.round(x * 100)));
    const r0 = lim(prob(d0)), r1 = lim(prob(d1)), r2 = lim(prob(d2));
    return { d2, r0, r1, r2, cL, cV };
  }

  const prePartido = new Map(); // probabilidad calculada antes de cada partido ya jugado
  let temporadaEnCurso = null;
  const prueba = { partidos: 0, aciertos: 0 };
  for (const g of juegos.filter((x) => x.estado === 'final')) {
    if (g.temporada !== temporadaEnCurso) {
      if (temporadaEnCurso !== null) arrastrar();
      temporadaEnCurso = g.temporada;
    }
    const a = analizar(g);
    const ganoLocal = g.pl > g.pv ? 1 : 0;
    prePartido.set(g.id, a.r2);
    if (g.temporada === temporada) {
      prueba.partidos++;
      if ((a.r2 >= 50) === (ganoLocal === 1)) prueba.aciertos++;
    }
    const esperado = prob(a.d2);
    const margen = Math.abs(g.pl - g.pv);
    const difGanador = ganoLocal ? a.d2 : -a.d2;
    const mult = Math.pow(margen + 3, 0.8) / (7.5 + 0.006 * difGanador);
    const delta = K * mult * (ganoLocal - esperado);
    elo.set(g.local.id, fuerza(g.local.id) + delta);
    elo.set(g.visitante.id, fuerza(g.visitante.id) - delta);
  }
  if (temporadaEnCurso !== null && temporadaEnCurso !== temporada) arrastrar();

  // Estadísticas de la temporada actual
  const finalesTemporada = juegos.filter((g) => g.temporada === temporada && g.estado === 'final');
  const uno = (x) => Math.round(x * 10) / 10;
  function estadisticas(id) {
    let g = 0, p = 0, gl = 0, plo = 0, gv = 0, pvi = 0, pf = 0, pc = 0;
    const res = [];
    for (const x of finalesTemporada) {
      const esLocal = x.local.id === id;
      if (!esLocal && x.visitante.id !== id) continue;
      const propio = esLocal ? x.pl : x.pv;
      const rival = esLocal ? x.pv : x.pl;
      const gano = propio > rival;
      gano ? g++ : p++;
      if (esLocal) { gano ? gl++ : plo++; } else { gano ? gv++ : pvi++; }
      pf += propio; pc += rival;
      res.push(gano ? 'G' : 'P');
    }
    const n = g + p;
    const u10 = res.slice(-10);
    const g10 = u10.filter((r) => r === 'G').length;
    return {
      record: `${g}-${p}`,
      ultimos10: `${g10}-${u10.length - g10}`,
      enCasa: `${gl}-${plo}`,
      deVisitante: `${gv}-${pvi}`,
      puntosFavor: n ? uno(pf / n) : null,
      puntosContra: n ? uno(pc / n) : null,
      ultimos5: res.slice(-5)
    };
  }

  function factores(g, a, eL) {
    const L = g.local.nombre, V = g.visitante.nombre;
    let descanso;
    if (a.cL && a.cV) descanso = 'Los dos equipos jugaron ayer, así que el cansancio se compensa.';
    else if (a.cV) descanso = `${V} jugó ayer y ${L} no: llega más descansado el local.`;
    else if (a.cL) descanso = `${L} jugó ayer y ${V} no: llega más descansado el visitante.`;
    else descanso = 'Ninguno de los dos jugó ayer.';
    return [
      { nombre: 'Nivel de los equipos', efecto: a.r0 - 50,
        nota: `En cancha neutral, el modelo le daría ${L} ${a.r0}% y ${V} ${100 - a.r0}%, por sus resultados de esta temporada y la anterior.` },
      { nombre: 'Localía', efecto: a.r1 - a.r0,
        nota: `Juegan en la cancha de ${L}, que esta temporada va ${eL.enCasa} de local.` },
      { nombre: 'Descanso', efecto: a.r2 - a.r1, nota: descanso }
    ];
  }

  const dias = { ayer: sumarDias(hoy, -1), hoy, manana: sumarDias(hoy, 1) };
  const enVista = juegos.filter((g) => g.fecha >= dias.ayer && g.fecha <= dias.manana);

  const partidos = enVista.map((g) => {
    const eL = estadisticas(g.local.id);
    const eV = estadisticas(g.visitante.id);
    const cara = finalesTemporada
      .filter((x) => x.id !== g.id && [x.local.id, x.visitante.id].includes(g.local.id) && [x.local.id, x.visitante.id].includes(g.visitante.id))
      .map((x) => ({ fecha: x.fecha, local: x.local.nombre, pl: x.pl, visitante: x.visitante.nombre, pv: x.pv }));
    const base = {
      id: g.id, fecha: g.fecha, hora: g.hora, estado: g.estado, playoffs: g.playoffs,
      local: { ...g.local, ...eL, descanso: diasDescanso(g.local.id, g.fecha) },
      visitante: { ...g.visitante, ...eV, descanso: diasDescanso(g.visitante.id, g.fecha) },
      cara
    };
    if (g.estado === 'final') {
      const p = prePartido.get(g.id);
      return { ...base, probLocal: p, marcador: { local: g.pl, visitante: g.pv }, acierto: (p >= 50) === (g.pl > g.pv), factores: null };
    }
    const a = analizar(g);
    return { ...base, probLocal: a.r2, factores: factores(g, a, eL) };
  });

  // Historial público: se guarda la predicción antes del partido y después se completa el resultado
  const archivoHist = path.join(CARPETA, 'historial.json');
  const historial = await leerJSON(archivoHist, []);
  const porId = new Map(historial.map((h) => [h.id, h]));
  for (const p of partidos) {
    if (p.fecha !== hoy || p.estado !== 'programado') continue;
    const previo = porId.get(p.id);
    if (previo && previo.resultado) continue;
    const entrada = { id: p.id, fecha: p.fecha, local: p.local.nombre, visitante: p.visitante.nombre, probLocal: p.probLocal, guardado: new Date().toISOString() };
    if (previo) Object.assign(previo, entrada); else { historial.push(entrada); porId.set(p.id, entrada); }
  }
  const juegoPorId = new Map(juegos.map((g) => [g.id, g]));
  for (const h of historial) {
    if (h.resultado) continue;
    const g = juegoPorId.get(h.id);
    if (g && g.estado === 'final') {
      h.resultado = { local: g.pl, visitante: g.pv };
      h.acierto = (h.probLocal >= 50) === (g.pl > g.pv);
    }
  }
  historial.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);

  const salida = {
    actualizado: new Date().toISOString(),
    temporada: `${temporada}-${String(temporada + 1).slice(2)}`,
    dias,
    pruebaHaciaAtras: prueba,
    partidos
  };
  await fs.mkdir(CARPETA, { recursive: true });
  await fs.writeFile(path.join(CARPETA, 'hoy.json'), JSON.stringify(salida));
  await fs.writeFile(archivoHist, JSON.stringify(historial, null, 1));
  console.log(`Listo: ${partidos.length} partidos entre ayer y mañana, ${historial.length} en el historial.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
