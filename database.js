/**
 * Cinemática Rapaz — TechLex CNC
 * Módulo de Base de Datos Relacional SQLite (techlex.db)
 * Tablas: herramientas_qr, vocabulario_cnc, historial_escaneos + Auto-Seed desde catalogo.json
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'techlex.db');
const CATALOGO_PATH = path.join(__dirname, 'public', 'catalogo.json');

// Conector híbrido SQLite: usa el paquete 'sqlite3' o el motor nativo SQLite de Node ('node:sqlite')
let db = null;
let syncDb = null;

try {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database(DB_PATH);
  console.log(`🗄️  Conectado a SQLite (driver sqlite3): ${DB_PATH}`);
} catch (_) {
  const { DatabaseSync } = require('node:sqlite');
  syncDb = new DatabaseSync(DB_PATH);
  console.log(`🗄️  Conectado a SQLite nativo (techlex.db): ${DB_PATH}`);
}

// Ejecutar sentencias INSERT / UPDATE / CREATE
function runSQL(sql, params = []) {
  if (syncDb) {
    return new Promise((resolve, reject) => {
      try {
        if (params.length === 0) {
          syncDb.exec(sql);
          resolve({ lastID: 0, changes: 0 });
        } else {
          const stmt = syncDb.prepare(sql);
          const info = stmt.run(...params);
          resolve({ lastID: Number(info.lastInsertRowid || 0), changes: Number(info.changes || 0) });
        }
      } catch (err) {
        reject(err);
      }
    });
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Obtener una sola fila
function getSQL(sql, params = []) {
  if (syncDb) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = syncDb.prepare(sql);
        const row = stmt.get(...params);
        resolve(row || null);
      } catch (err) {
        reject(err);
      }
    });
  }
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Obtener múltiples filas
function allSQL(sql, params = []) {
  if (syncDb) {
    return new Promise((resolve, reject) => {
      try {
        const stmt = syncDb.prepare(sql);
        const rows = stmt.all(...params);
        resolve(rows || []);
      } catch (err) {
        reject(err);
      }
    });
  }
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Normalizador de texto para comparaciones sin acentos
function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["""']/g, '')
    .trim();
}

// Diccionario de raíces singulares/plurales para complementar las consultas a vocabulario_cnc
const ROOT_TECH_TERMS = [
  {
    es: 'machuelo métrico',
    en: 'Metric tap',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: "Machuelo métrico" se traduce como "Metric tap" (herramienta para tallar rosca métrica ISO interna).'
  },
  {
    es: 'rima recta',
    en: 'Straight reamer',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: "Rima recta" es un escariador de flautas rectas para acabado H7 y se traduce como "Straight reamer".'
  },
  {
    es: 'machuelo',
    en: 'Tap',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: En maquinado CNC, "machuelo" es la herramienta para tallar roscas internas y se traduce como "Tap" (nunca literalmente como "little male" o "mule").'
  },
  {
    es: 'machuelos',
    en: 'Taps',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: "Machuelos" corresponde a "Taps" (herramientas de roscado interno).'
  },
  {
    es: 'rima',
    en: 'Reamer',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: En taller mecánico, "rima" es un escariador de precisión para barrenos y se traduce como "Reamer" (jamás literalmente como "rhyme").'
  },
  {
    es: 'rimas',
    en: 'Reamers',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: "Rimas" equivale a "Reamers" (escariadores de precisión).'
  },
  {
    es: 'cortador vertical',
    en: 'End mill',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: Un "cortador vertical" o fresa frontal se denomina universalmente en la industria CNC como "End mill" (no "vertical cutter").'
  },
  {
    es: 'cortadores verticales',
    en: 'End mills',
    clasificacion: 'Herramientas de corte',
    nota: 'Traducción Técnica Industrial: "Cortadores verticales" se traduce técnicamente como "End mills".'
  },
  {
    es: 'broquero',
    en: 'Drill chuck',
    clasificacion: 'Dispositivos de sujeción',
    nota: 'Traducción Técnica Industrial: "Broquero" (portabrocas de tres mordazas) se traduce exactamente como "Drill chuck".'
  },
  {
    es: 'boquilla',
    en: 'Collet',
    clasificacion: 'Dispositivos de sujeción',
    nota: 'Traducción Técnica Industrial: En portaherramientas CNC (ER40, R8, 5C), "boquilla" se traduce como "Collet" (no "nozzle").'
  },
  {
    es: 'prensa',
    en: 'Vise',
    clasificacion: 'Dispositivos de sujeción',
    nota: 'Traducción Técnica Industrial: La prensa o mordaza de mesa fresadora se traduce como "Vise" (no "press").'
  },
  {
    es: 'birlo',
    en: 'Clamping stud',
    clasificacion: 'Dispositivos de sujeción',
    nota: 'Traducción Técnica Industrial: En sujeción de mesas CNC, un "birlo" o espárrago roscado se traduce como "Clamping stud" o "Threaded stud".'
  },
  {
    es: 'rondana',
    en: 'Washer',
    clasificacion: 'Dispositivos de sujeción',
    nota: 'Traducción Técnica Industrial: "Rondana" (arandela de apoyo o seguridad) se traduce técnicamente como "Washer".'
  }
];

/**
 * Inicializa las 3 tablas relacionales y realiza el Seed automático desde public/catalogo.json si están vacías
 */
async function initDatabase() {
  // 1. Crear tabla herramientas_qr
  await runSQL(`
    CREATE TABLE IF NOT EXISTS herramientas_qr (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_qr TEXT UNIQUE NOT NULL,
      nombre_es TEXT NOT NULL,
      nombre_en TEXT NOT NULL,
      clasificacion TEXT NOT NULL,
      norma TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      especificaciones_json TEXT NOT NULL,
      modelo_3d TEXT NOT NULL
    )
  `);

  // 2. Crear tabla vocabulario_cnc
  await runSQL(`
    CREATE TABLE IF NOT EXISTS vocabulario_cnc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clasificacion TEXT NOT NULL,
      termino_es TEXT NOT NULL,
      termino_en TEXT NOT NULL,
      nota_tecnica TEXT DEFAULT ''
    )
  `);

  // 3. Crear tabla historial_escaneos
  await runSQL(`
    CREATE TABLE IF NOT EXISTS historial_escaneos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_o_termino TEXT NOT NULL,
      tipo_accion TEXT NOT NULL,
      ip_cliente TEXT NOT NULL,
      fecha_hora TEXT NOT NULL
    )
  `);

  // Leer datos semilla desde public/catalogo.json
  let seedData = { herramientasQR: [], vocabularioCNC: [] };
  if (fs.existsSync(CATALOGO_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf8'));
      seedData.herramientasQR = Array.isArray(raw) ? raw : (raw.herramientasQR || []);
      seedData.vocabularioCNC = Array.isArray(raw) ? [] : (raw.vocabularioCNC || []);
    } catch (err) {
      console.error('Error leyendo catalogo.json para seed:', err.message);
    }
  }

  // Seed automático para herramientas_qr si está vacía
  const countHerramientas = await getSQL(`SELECT COUNT(*) AS total FROM herramientas_qr`);
  if (!countHerramientas || countHerramientas.total === 0) {
    console.log('🌱 Poblando tabla SQLite [herramientas_qr] con las 10 piezas principales...');
    for (const item of seedData.herramientasQR) {
      const codigoQr = item.id;
      const nombreEs = item.idiomas?.es?.nombre || '';
      const nombreEn = item.idiomas?.en?.nombre || '';
      const clasificacion = item.categoria || '';
      const norma = `${item.norma}${item.subnorma ? ' / ' + item.subnorma : ''}`;
      const descripcion = item.idiomas?.es?.definicion || '';
      const especificacionesJson = JSON.stringify({
        subcategoria: item.subcategoria,
        resumenCorto: item.resumenCorto,
        norma: item.norma,
        subnorma: item.subnorma,
        especificaciones: item.especificaciones,
        idiomas: item.idiomas
      });
      const modelo3d = `models/${codigoQr.toLowerCase()}.glb`;

      await runSQL(
        `INSERT INTO herramientas_qr (codigo_qr, nombre_es, nombre_en, clasificacion, norma, descripcion, especificaciones_json, modelo_3d)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [codigoQr, nombreEs, nombreEn, clasificacion, norma, descripcion, especificacionesJson, modelo3d]
      );
    }
    console.log(`✅ [herramientas_qr]: ${seedData.herramientasQR.length} herramientas insertadas.`);
  }

  // Seed automático para vocabulario_cnc si está vacía
  const countVocab = await getSQL(`SELECT COUNT(*) AS total FROM vocabulario_cnc`);
  if (!countVocab || countVocab.total === 0) {
    console.log('🌱 Poblando tabla SQLite [vocabulario_cnc] con los 145 términos del PDF...');
    await runSQL('BEGIN TRANSACTION');
    try {
      for (const v of seedData.vocabularioCNC) {
        await runSQL(
          `INSERT INTO vocabulario_cnc (clasificacion, termino_es, termino_en, nota_tecnica)
           VALUES (?, ?, ?, ?)`,
          [v.clasificacion, v.es, v.en, v.nota || 'Traducción técnica industrial normalizada de Fresado CNC.']
        );
      }
      await runSQL('COMMIT');
      console.log(`✅ [vocabulario_cnc]: ${seedData.vocabularioCNC.length} términos oficiales insertados.`);
    } catch (err) {
      await runSQL('ROLLBACK');
      console.error('Error en seed de vocabulario_cnc:', err.message);
    }
  }
}

/**
 * Formatea una fila de herramientas_qr para que sea compatible tanto con la App Android (campos planos SQL)
 * como con el Frontend Web (objetos especificaciones e idiomas)
 */
function formatHerramientaRow(row) {
  if (!row) return null;
  let extra = {};
  try {
    extra = JSON.parse(row.especificaciones_json || '{}');
  } catch (_) {}

  return {
    id: row.codigo_qr,
    db_id: row.id,
    codigo_qr: row.codigo_qr,
    nombre_es: row.nombre_es,
    nombre_en: row.nombre_en,
    clasificacion: row.clasificacion,
    categoria: row.clasificacion,
    subcategoria: extra.subcategoria || row.clasificacion,
    resumenCorto: extra.resumenCorto || row.norma,
    norma: extra.norma || row.norma,
    subnorma: extra.subnorma || '',
    descripcion: row.descripcion,
    modelo_3d: row.modelo_3d,
    especificaciones: extra.especificaciones || {},
    especificaciones_json: row.especificaciones_json,
    idiomas: extra.idiomas || {
      es: { nombre: row.nombre_es, sinonimo: row.nombre_es, fonetica: '', definicion: row.descripcion, aplicacion: '', mantenimiento: '' },
      en: { nombre: row.nombre_en, sinonimo: row.nombre_en, fonetica: '', definicion: '', aplicacion: '', mantenimiento: '' }
    }
  };
}

/**
 * Devuelve todas las herramientas con QR desde SQLite
 */
async function getAllHerramientas() {
  const rows = await allSQL(`SELECT * FROM herramientas_qr ORDER BY id ASC`);
  return rows.map(formatHerramientaRow);
}

/**
 * Busca una pieza específica por su código QR en SQLite
 */
async function getHerramientaByCodigo(codigo) {
  const cleanCode = String(codigo || '').trim().toUpperCase();
  const row = await getSQL(`SELECT * FROM herramientas_qr WHERE UPPER(codigo_qr) = ?`, [cleanCode]);
  return formatHerramientaRow(row);
}

/**
 * Devuelve el vocabulario CNC desde SQLite permitiendo filtrar por ?q=texto o ?categoria=nombre con SQL LIKE
 */
async function getVocabulario({ q = '', categoria = '' } = {}) {
  let sql = `
    SELECT
      id,
      clasificacion,
      termino_es,
      termino_en,
      nota_tecnica,
      termino_es AS es,
      termino_en AS en,
      nota_tecnica AS nota
    FROM vocabulario_cnc
    WHERE 1=1
  `;
  const params = [];

  if (categoria && categoria !== 'Todos') {
    sql += ` AND clasificacion LIKE ?`;
    params.push(`%${categoria.trim()}%`);
  }

  if (q && q.trim() !== '') {
    const searchPattern = `%${q.trim()}%`;
    sql += ` AND (termino_es LIKE ? OR termino_en LIKE ? OR clasificacion LIKE ?)`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  sql += ` ORDER BY id ASC`;
  return await allSQL(sql, params);
}

/**
 * Traduce un término o frase técnica consultando la base de datos SQLite
 */
async function translateTermSQL({ texto = '', idioma = 'auto' } = {}) {
  const rawInput = String(texto || '').trim();
  if (!rawInput) {
    return {
      original: '',
      traduccion: '',
      clasificacion: '',
      explicacion_tecnica: 'Ingresa un término o frase de taller CNC para obtener su traducción técnica industrial.',
      variantes: []
    };
  }

  const allVocab = await allSQL(`
    SELECT id, clasificacion, termino_es AS es, termino_en AS en, nota_tecnica AS nota
    FROM vocabulario_cnc
    ORDER BY id ASC
  `);

  const normInput = normalizeText(rawInput);
  const combinedPool = [...allVocab, ...ROOT_TECH_TERMS];

  // 1. Coincidencia exacta
  const exactEs = combinedPool.find(item => normalizeText(item.es) === normInput);
  const exactEn = combinedPool.find(item => normalizeText(item.en) === normInput);

  if (exactEs || exactEn) {
    const matched = exactEs || exactEn;
    const isFromEs = Boolean(exactEs) && idioma !== 'en-es';
    const traduccion = isFromEs ? matched.en : matched.es;

    const variantes = allVocab.filter(v =>
      (normalizeText(v.es).includes(normInput) || normalizeText(v.en).includes(normInput)) &&
      normalizeText(v.es) !== normalizeText(matched.es)
    ).slice(0, 6);

    return {
      original: rawInput,
      traduccion,
      idioma_detectado: isFromEs ? 'es' : 'en',
      idioma_salida: isFromEs ? 'en' : 'es',
      clasificacion: matched.clasificacion,
      explicacion_tecnica: matched.nota,
      variantes
    };
  }

  // 2. Coincidencia parcial en SQL / Pool (para 1 a 3 palabras)
  const partialMatches = allVocab.filter(item =>
    normalizeText(item.es).includes(normInput) || normalizeText(item.en).includes(normInput)
  );

  if (partialMatches.length > 0 && rawInput.split(/\s+/).length <= 3) {
    const best = partialMatches[0];
    const isQueryEs = normalizeText(best.es).includes(normInput);
    const traduccion = isQueryEs ? best.en : best.es;

    return {
      original: rawInput,
      traduccion,
      idioma_detectado: isQueryEs ? 'es' : 'en',
      idioma_salida: isQueryEs ? 'en' : 'es',
      clasificacion: best.clasificacion,
      explicacion_tecnica: `${best.nota} (Término oficial en base de datos: "${best.es}" ↔ "${best.en}").`,
      variantes: partialMatches.slice(0, 6)
    };
  }

  // 3. Traducción de frase de taller con múltiples términos técnicos CNC
  let workingSentence = rawInput;
  const detectedTerms = [];
  const sortedPool = [...combinedPool].sort((a, b) => b.es.length - a.es.length);

  sortedPool.forEach(entry => {
    const esEscaped = entry.es.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexEs = new RegExp(`\\b${esEscaped}\\b`, 'gi');
    if (regexEs.test(workingSentence)) {
      detectedTerms.push(entry);
      workingSentence = workingSentence.replace(regexEs, `[${entry.en.toUpperCase()}]`);
    }
  });

  const connectors = [
    [/\bnecesito un\b/gi, 'I need a'],
    [/\bnecesito una\b/gi, 'I need a'],
    [/\bnecesito\b/gi, 'I need'],
    [/\binstalar un\b/gi, 'install a'],
    [/\binstalar una\b/gi, 'install a'],
    [/\bcambiar el\b/gi, 'change the'],
    [/\bcambiar la\b/gi, 'change the'],
    [/\bmedir con\b/gi, 'measure with'],
    [/\bsujetar con\b/gi, 'clamp with'],
    [/\ben el\b/gi, 'in the'],
    [/\ben la\b/gi, 'in the'],
    [/\bcon un\b/gi, 'with a'],
    [/\bcon una\b/gi, 'with a'],
    [/\bpara\b/gi, 'for'],
    [/\by un\b/gi, 'and a'],
    [/\by una\b/gi, 'and a'],
    [/\by\b/gi, 'and'],
    [/\bun\b/gi, 'a'],
    [/\buna\b/gi, 'a']
  ];

  if (detectedTerms.length > 0) {
    connectors.forEach(([rgx, rep]) => {
      workingSentence = workingSentence.replace(rgx, rep);
    });
    return {
      original: rawInput,
      traduccion: workingSentence,
      idioma_detectado: 'es',
      idioma_salida: 'en',
      clasificacion: 'Frase Técnica de Taller CNC',
      explicacion_tecnica: `Se detectaron ${detectedTerms.length} términos técnicos industriales en la base de datos SQLite y se tradujeron con su nomenclatura normalizada (no literal).`,
      variantes: detectedTerms.slice(0, 6)
    };
  }

  return {
    original: rawInput,
    traduccion: 'Sin coincidencia exacta en la base de datos CNC',
    idioma_detectado: 'es',
    idioma_salida: 'en',
    clasificacion: 'Consulta General',
    explicacion_tecnica: 'Prueba con términos del catálogo de Fresado CNC como "machuelo", "rima", "cortador vertical", "broquero", "tuercas de sujeción T" o "rondanas de seguridad".',
    variantes: []
  };
}

/**
 * Registra un evento en la tabla historial_escaneos
 */
async function registrarEscaneo({ codigo_o_termino, tipo_accion, ip_cliente }) {
  const now = new Date();
  const fechaHora = now.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const result = await runSQL(
    `INSERT INTO historial_escaneos (codigo_o_termino, tipo_accion, ip_cliente, fecha_hora)
     VALUES (?, ?, ?, ?)`,
    [String(codigo_o_termino || 'N/A'), String(tipo_accion || 'CONSULTA'), String(ip_cliente || '127.0.0.1'), fechaHora]
  );

  return {
    id: result.lastID,
    codigo_o_termino,
    tipo_accion,
    ip_cliente,
    fecha_hora: fechaHora
  };
}

/**
 * Obtiene los últimos N registros de historial_escaneos
 */
async function getHistorialAuditoria(limit = 50) {
  return await allSQL(
    `SELECT id, codigo_o_termino, tipo_accion, ip_cliente, fecha_hora
     FROM historial_escaneos
     ORDER BY id DESC
     LIMIT ?`,
    [Number(limit) || 50]
  );
}

module.exports = {
  db,
  initDatabase,
  getAllHerramientas,
  getHerramientaByCodigo,
  getVocabulario,
  translateTermSQL,
  registrarEscaneo,
  getHistorialAuditoria
};
