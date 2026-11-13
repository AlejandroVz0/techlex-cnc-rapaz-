/**
 * Cinemática Rapaz — TechLex CNC v3.0 Full-Stack Frontend
 * Conectado 100% a la API REST + Base de Datos Relacional SQLite (sin lectura de JSON estático):
 * - GET  /api/herramientas
 * - GET  /api/herramientas/:codigo
 * - GET  /api/vocabulario?q=...&categoria=...
 * - POST /api/traducir
 * - GET  /api/auditoria
 */

(function () {
  'use strict';

  let herramientasQR = [];
  let vocabularioCNC = [];
  let currentTool = null;
  let html5QrCode = null;
  let isScanning = false;
  let currentCameraId = null;
  let lastScannedCode = null;
  let lastScanTimestamp = 0;

  // Estado del Traductor Técnico CNC
  let translateDirection = 'es-en';
  let currentVocabCat = 'Todos';
  let lastTranslatedOutput = 'Tap';
  let lastTranslatedLang = 'en';
  let translateTimer = null;
  let vocabFilterTimer = null;

  function playLensChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
      osc2.frequency.setValueAtTime(1174.66, ctx.currentTime);

      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.25);
      osc2.stop(ctx.currentTime + 0.25);
    } catch (_) {}
  }

  function speakTerm(text, langCode, btnEl) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const locales = {
      es: 'es-MX',
      en: 'en-US',
      de: 'de-DE',
      fr: 'fr-FR'
    };
    utterance.lang = locales[langCode] || 'es-MX';
    utterance.rate = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const matched = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
    if (matched) utterance.voice = matched;

    if (btnEl) {
      btnEl.classList.add('ring-2', 'ring-white', 'scale-105');
      utterance.onend = () => btnEl.classList.remove('ring-2', 'ring-white', 'scale-105');
      setTimeout(() => btnEl.classList.remove('ring-2', 'ring-white', 'scale-105'), 1800);
    }

    window.speechSynthesis.speak(utterance);
  }

  function getToolSVG(toolId) {
    switch (toolId) {
      case 'TOOL-MET-001':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="70" y="95" width="600" height="38" rx="2" fill="#94a3b8" stroke="#475569" stroke-width="2"/>
          <path d="M70 95 L70 45 L35 70 L35 95 L20 205 L50 205 L70 133 Z" fill="#64748b" stroke="#cbd5e1" stroke-width="1.5"/>
          <rect x="670" y="110" width="70" height="7" fill="#cbd5e1"/>
          <g transform="translate(165,0)">
            <path d="M0 90 L0 45 L30 70 L30 95 L32 135 L20 205 L0 205 Z" fill="#cbd5e1" stroke="#475569" stroke-width="1.5"/>
            <rect x="0" y="88" width="115" height="52" rx="3" fill="#e2e8f0" stroke="#334155" stroke-width="2"/>
            <text x="58" y="120" text-anchor="middle" fill="#0f172a" font-family="JetBrains Mono" font-size="11" font-weight="700">0.02 mm · DIN 862</text>
          </g>
        </svg>`;
      case 'TOOL-MET-002':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M100 85 C55 85,55 225,200 225 C320 225,335 130,335 105 L290 105 C285 150,265 185,200 185 C120 185,120 120,135 105 Z" fill="#1e293b" stroke="#ffc174" stroke-width="2"/>
          <rect x="130" y="78" width="22" height="22" fill="#94a3b8"/><rect x="195" y="80" width="120" height="18" fill="#cbd5e1"/>
          <rect x="315" y="68" width="140" height="42" rx="2" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>
          <rect x="455" y="58" width="155" height="62" rx="3" fill="#94a3b8" stroke="#334155" stroke-width="2"/>
          <rect x="610" y="72" width="55" height="34" rx="4" fill="#334155"/>
          <text x="200" y="212" text-anchor="middle" fill="#ffc174" font-family="JetBrains Mono" font-size="11" font-weight="700">0-25 mm · ±0.001 mm</text>
        </svg>`;
      case 'TOOL-MET-003':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="371" y="165" width="18" height="65" fill="#94a3b8"/>
          <circle cx="380" cy="232" r="5" fill="#e11d48"/>
          <circle cx="380" cy="100" r="78" fill="#f8fafc" stroke="#475569" stroke-width="6"/>
          <circle cx="380" cy="100" r="64" fill="none" stroke="#0f172a" stroke-dasharray="2 5" stroke-width="5"/>
          <line x1="380" y1="110" x2="418" y2="58" stroke="#dc2626" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="380" cy="100" r="6" fill="#0f172a"/>
          <text x="380" y="138" text-anchor="middle" fill="#0284c7" font-family="JetBrains Mono" font-size="11" font-weight="700">0.01 mm · DIN 878</text>
        </svg>`;
      case 'TOOL-TRS-001':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="380" cy="120" r="102" fill="#64748b" stroke="#e2e8f0" stroke-width="4"/>
          <circle cx="380" cy="120" r="78" fill="#0f172a" stroke="#475569" stroke-width="3"/>
          <circle cx="380" cy="56" r="14" fill="#e2e8f0"/><circle cx="444" cy="120" r="14" fill="#e2e8f0"/>
          <circle cx="380" cy="184" r="14" fill="#e2e8f0"/><circle cx="316" cy="120" r="14" fill="#e2e8f0"/>
          <circle cx="425" cy="75" r="14" fill="#e2e8f0"/><circle cx="335" cy="75" r="14" fill="#e2e8f0"/>
          <circle cx="425" cy="165" r="14" fill="#e2e8f0"/><circle cx="335" cy="165" r="14" fill="#e2e8f0"/>
          <circle cx="380" cy="120" r="48" fill="#94a3b8" stroke="#e2e8f0" stroke-width="3"/>
          <circle cx="380" cy="120" r="30" fill="#0b1326" stroke="#7bd0ff" stroke-width="2"/>
        </svg>`;
      case 'TOOL-TRS-002':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="380" cy="120" r="94" fill="none" stroke="#94a3b8" stroke-dasharray="13 12" stroke-width="20"/>
          <circle cx="380" cy="120" r="84" fill="#475569" stroke="#cbd5e1" stroke-width="3"/>
          <circle cx="380" cy="120" r="90" fill="none" stroke="#ffc174" stroke-dasharray="5 4" stroke-width="1.5"/>
          <circle cx="380" cy="120" r="34" fill="#0b1326" stroke="#56e5a9" stroke-width="2.5"/>
          <rect x="373" y="80" width="14" height="12" fill="#0b1326"/>
        </svg>`;
      case 'TOOL-MAQ-001':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="380" y="85" width="270" height="68" rx="3" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
          <rect x="110" y="85" width="270" height="68" rx="2" fill="#4c1d95" stroke="#a78bfa" stroke-width="2"/>
          <path d="M120 153 L185 85 L220 85 L155 153 Z" fill="#c4b5fd" opacity="0.4"/>
          <path d="M210 153 L275 85 L310 85 L245 153 Z" fill="#c4b5fd" opacity="0.4"/>
          <path d="M300 153 L365 85 L380 85 L335 153 Z" fill="#c4b5fd" opacity="0.4"/>
          <text x="515" y="124" text-anchor="middle" fill="#0f172a" font-family="JetBrains Mono" font-size="12" font-weight="700">One-piece End Mill · Ø12</text>
        </svg>`;
      case 'TOOL-MAQ-002':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="80,120 130,90 130,150" fill="#f59e0b" stroke="#fef3c7" stroke-width="1.5"/>
          <rect x="130" y="90" width="350" height="60" fill="#d97706" stroke="#fde68a" stroke-width="1.5"/>
          <path d="M150 150 L210 90 L245 90 L185 150 Z" fill="#0f172a" opacity="0.7"/>
          <path d="M250 150 L310 90 L345 90 L285 150 Z" fill="#0f172a" opacity="0.7"/>
          <path d="M350 150 L410 90 L445 90 L385 150 Z" fill="#0f172a" opacity="0.7"/>
          <rect x="480" y="90" width="190" height="60" rx="2" fill="#f59e0b"/>
          <text x="575" y="124" text-anchor="middle" fill="#0f172a" font-family="JetBrains Mono" font-size="11" font-weight="700">Straight-shank Drill · Ø8.5</text>
        </svg>`;
      case 'TOOL-MAQ-003':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="380,25 535,120 380,215 225,120" fill="#f59e0b" stroke="#fef08a" stroke-width="4"/>
          <polygon points="380,45 502,120 380,195 258,120" fill="#1e293b" stroke="#fbbf24" stroke-width="2"/>
          <circle cx="380" cy="120" r="30" fill="#0b1326" stroke="#e2e8f0" stroke-width="4"/>
          <text x="380" y="72" text-anchor="middle" fill="#fef08a" font-family="JetBrains Mono" font-size="11" font-weight="700">Carbide Milling Insert</text>
        </svg>`;
      case 'TOOL-SUJ-001':
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="100" y="160" width="550" height="42" rx="2" fill="#334155" stroke="#94a3b8" stroke-width="2"/>
          <rect x="120" y="65" width="75" height="95" fill="#475569" stroke="#cbd5e1" stroke-width="2"/>
          <rect x="195" y="75" width="110" height="75" fill="#0284c7" fill-opacity="0.35" stroke="#7bd0ff" stroke-dasharray="4 2" stroke-width="2"/>
          <path d="M305 160 L305 65 L410 85 L410 160 Z" fill="#64748b" stroke="#cbd5e1" stroke-width="2"/>
          <rect x="410" y="105" width="190" height="36" fill="#1e293b" stroke="#ffc174" stroke-width="1.5"/>
          <text x="505" y="127" text-anchor="middle" fill="#ffc174" font-family="JetBrains Mono" font-size="11" font-weight="700">Hydraulic Clamping Vise</text>
        </svg>`;
      case 'TOOL-SUJ-002':
      default:
        return `<svg class="w-full drop-shadow-xl" viewBox="0 0 760 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="640,102 485,88 485,152 640,138" fill="#94a3b8" stroke="#cbd5e1" stroke-width="1.5"/>
          <rect x="310" y="68" width="175" height="104" rx="4" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
          <polygon points="310,68 225,90 225,150 310,172" fill="#64748b" stroke="#cbd5e1" stroke-width="2"/>
          <polygon points="225,98 165,112 225,118" fill="#e2e8f0"/>
          <polygon points="225,142 165,128 225,122" fill="#e2e8f0"/>
          <text x="395" y="124" text-anchor="middle" fill="#ffc174" font-family="JetBrains Mono" font-size="11" font-weight="700">Quick-change Drill Chuck</text>
        </svg>`;
    }
  }

  function extractToolIdFromQR(rawText) {
    if (!rawText) return null;
    const text = String(rawText).trim();
    const regexMatch = text.match(/TOOL-[A-Z]{3}-\d{3}/i);
    if (regexMatch) return regexMatch[0].toUpperCase();

    try {
      const urlObj = new URL(text, window.location.origin);
      const pieza = urlObj.searchParams.get('pieza') || urlObj.searchParams.get('id');
      if (pieza) return pieza.trim().toUpperCase();
    } catch (_) {}

    return text.toUpperCase();
  }

  /**
   * Consulta GET /api/herramientas/:codigo en SQLite, registra el escaneo en historial_escaneos
   * y muestra la barra inferior compacta tipo "pill"
   */
  async function showLensCardForTool(toolId, playSound = true) {
    try {
      const cleanId = String(toolId || '').trim().toUpperCase();
      if (!cleanId) return false;

      const res = await fetch(`/api/herramientas/${encodeURIComponent(cleanId)}`);
      if (!res.ok) return false;
      const tool = await res.json();

      currentTool = tool;
      if (playSound) playLensChime();

      const statusLabel = document.getElementById('lens-status-label');
      const statusDot = document.getElementById('lens-status-dot');
      if (statusLabel) {
        statusLabel.textContent = `QR: ${tool.codigo_qr} (${tool.norma})`;
      }
      if (statusDot) {
        statusDot.className = 'w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#56e5a9]';
      }

      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      const nombreEs = tool.nombre_es || tool.idiomas?.es?.nombre || '';
      const nombreEn = tool.nombre_en || tool.idiomas?.en?.nombre || '';

      setText('hud-es-name', nombreEs);
      setText('hud-en-name', nombreEn);

      // Poblar el Modal "+ Info / 3D"
      setText('modal-id', tool.codigo_qr);
      setText('modal-norma', `${tool.norma}${tool.subnorma ? ' · ' + tool.subnorma : ''}`);
      setText('modal-title', `${nombreEs} / ${nombreEn}`);
      setText('modal-categoria', tool.clasificacion || tool.categoria);
      setText('modal-phonetics', `${tool.idiomas?.es?.fonetica || ''} · ${tool.idiomas?.en?.fonetica || ''}`);
      setText('modal-definicion', tool.descripcion || tool.idiomas?.es?.definicion || '');
      setText('modal-spec-mat', `${tool.especificaciones?.material || ''} (${tool.especificaciones?.dureza || ''})`);
      setText('modal-spec-prec', `${tool.especificaciones?.precision || ''}`);
      setText('modal-spec-rango', tool.especificaciones?.rango || '');
      setText('modal-spec-fij', tool.especificaciones?.fijacion || '');
      setText('modal-aplicacion', tool.idiomas?.es?.aplicacion || '');
      setText('modal-mantenimiento', tool.idiomas?.es?.mantenimiento || '');

      const modalSvg = document.getElementById('modal-svg-container');
      if (modalSvg) modalSvg.innerHTML = getToolSVG(tool.codigo_qr);

      const hudCard = document.getElementById('lens-hud-card');
      if (hudCard) {
        hudCard.classList.remove('hidden');
      }

      document.querySelectorAll('#quick-sim-strip button').forEach(btn => {
        if (btn.dataset.toolId === tool.codigo_qr) {
          btn.className = 'px-2.5 py-1 rounded-md bg-primary text-slate-950 font-mono text-[11px] font-bold shrink-0 shadow transition-all';
        } else {
          btn.className = 'px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-high text-on-surface-variant hover:text-white font-mono text-[11px] shrink-0 border border-white/5 transition-all';
        }
      });

      return true;
    } catch (err) {
      console.error('Error al consultar /api/herramientas/:codigo:', err);
      return false;
    }
  }

  function hideLensCard() {
    currentTool = null;
    lastScannedCode = null;
    const hudCard = document.getElementById('lens-hud-card');
    if (hudCard) {
      hudCard.classList.add('hidden');
    }
    const statusLabel = document.getElementById('lens-status-label');
    if (statusLabel) {
      statusLabel.textContent = 'LENS QR · APUNTA A LA HERRAMIENTA';
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    document.querySelectorAll('#quick-sim-strip button').forEach(btn => {
      btn.className = 'px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-high text-on-surface-variant hover:text-white font-mono text-[11px] shrink-0 border border-white/5 transition-all';
    });
  }

  async function populateCameraList() {
    const select = document.getElementById('camera-select');
    if (!select || typeof Html5Qrcode === 'undefined') return [];

    try {
      const devices = await Html5Qrcode.getCameras();
      select.innerHTML = '';

      if (!devices || devices.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'environment';
        opt.textContent = 'Cámara Trasera / Web';
        select.appendChild(opt);
        return [];
      }

      devices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.id;
        opt.textContent = dev.label || `Cámara ${idx + 1} (${dev.id.slice(0, 6)})`;
        select.appendChild(opt);
      });

      const preferred = devices.find(d =>
        /droidcam|iriun|camo|back|rear|trasera|environment|usb/i.test(d.label || '')
      );
      if (preferred) {
        select.value = preferred.id;
      } else if (currentCameraId && devices.some(d => d.id === currentCameraId)) {
        select.value = currentCameraId;
      } else {
        select.value = devices[0].id;
      }

      return devices;
    } catch (_) {
      select.innerHTML = '<option value="environment">Cámara Trasera / Web (Auto)</option>';
      return [];
    }
  }

  async function startOrSwitchCamera(forcedCameraId) {
    if (typeof Html5Qrcode === 'undefined') return;

    const select = document.getElementById('camera-select');
    const placeholder = document.getElementById('camera-placeholder');
    const btnIcon = document.getElementById('camera-btn-icon');
    const btnLabel = document.getElementById('camera-btn-label');

    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
      }

      if (isScanning) {
        await html5QrCode.stop();
        isScanning = false;
      }

      if (!select.value || select.options.length <= 1) {
        await populateCameraList();
      }

      const chosenValue = forcedCameraId || select.value || 'environment';
      currentCameraId = chosenValue;

      const cameraConfig = chosenValue === 'environment' ? { facingMode: 'environment' } : chosenValue;
      const qrConfig = { fps: 15, qrbox: { width: 230, height: 230 }, aspectRatio: 1.777778 };

      await html5QrCode.start(
        cameraConfig,
        qrConfig,
        (decodedText) => {
          const now = Date.now();
          const extractedId = extractToolIdFromQR(decodedText);
          if (!extractedId) return;
          if (extractedId === lastScannedCode && now - lastScanTimestamp < 2500) return;

          lastScannedCode = extractedId;
          lastScanTimestamp = now;
          showLensCardForTool(extractedId, true);
        },
        () => {}
      );

      isScanning = true;
      if (placeholder) placeholder.classList.add('hidden');
      if (btnIcon) btnIcon.textContent = 'cameraswitch';
      if (btnLabel) btnLabel.textContent = 'Cambiar';

      await populateCameraList();
      if (currentCameraId && select.querySelector(`option[value="${currentCameraId}"]`)) {
        select.value = currentCameraId;
      }
    } catch (_) {}
  }

  function renderQuickSimStrip() {
    const strip = document.getElementById('quick-sim-strip');
    if (!strip) return;

    strip.innerHTML = herramientasQR.map(tool => {
      const code = tool.codigo_qr || tool.id;
      const nameEs = tool.nombre_es || tool.idiomas?.es?.nombre || '';
      return `
        <button type="button" data-tool-id="${code}" class="px-2.5 py-1 rounded-md bg-surface-container hover:bg-surface-high text-on-surface-variant hover:text-white font-mono text-[11px] shrink-0 border border-white/5 transition-all">
          <span class="text-primary font-bold">${code.replace('TOOL-', '')}</span> · ${nameEs}
        </button>
      `;
    }).join('');

    strip.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        showLensCardForTool(btn.dataset.toolId, true);
      });
    });
  }

  // =========================================================================
  // TRADUCTOR TÉCNICO CNC CONECTADO A POST /api/traducir Y GET /api/vocabulario
  // =========================================================================

  async function runTechnicalTranslation(rawInput) {
    const outputEl = document.getElementById('translator-output');
    const subMatchesEl = document.getElementById('translator-sub-matches');
    const noteTextEl = document.getElementById('translator-note-text');
    if (!outputEl || !subMatchesEl || !noteTextEl) return;

    const text = String(rawInput || '').trim();
    if (!text) {
      outputEl.textContent = 'Escribe un término o frase...';
      subMatchesEl.innerHTML = '';
      noteTextEl.textContent = 'Traduce terminología real de Fresado CNC desde la base de datos SQLite evitando traducciones literales erróneas.';
      return;
    }

    try {
      const res = await fetch('/api/traducir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: text,
          idioma: translateDirection
        })
      });

      if (!res.ok) return;
      const data = await res.json();

      lastTranslatedOutput = data.traduccion || '';
      lastTranslatedLang = data.idioma_salida || 'en';

      outputEl.innerHTML = `
        <span class="text-secondary">${data.traduccion}</span>
        ${data.clasificacion ? `<span class="ml-2 px-2 py-0.5 rounded bg-white/10 text-on-surface-variant font-mono text-xs font-normal">${data.clasificacion}</span>` : ''}
      `;
      noteTextEl.textContent = data.explicacion_tecnica || '';

      const variantes = data.variantes || [];
      if (variantes.length > 0) {
        subMatchesEl.innerHTML = variantes.map(r => {
          const termEs = r.es || r.termino_es;
          const termEn = r.en || r.termino_en;
          return `
            <button type="button" data-es="${termEs}" class="variant-pill px-2 py-0.5 rounded bg-surface hover:bg-surface-high border border-white/10 font-mono text-[11px] text-on-surface transition-colors">
              ${termEs} → <strong class="text-primary">${termEn}</strong>
            </button>
          `;
        }).join('');

        subMatchesEl.querySelectorAll('.variant-pill').forEach(btn => {
          btn.addEventListener('click', () => {
            const inputBox = document.getElementById('translator-input');
            if (inputBox) {
              inputBox.value = btn.dataset.es;
              runTechnicalTranslation(btn.dataset.es);
            }
          });
        });
      } else {
        subMatchesEl.innerHTML = '';
      }
    } catch (err) {
      console.error('Error al consultar POST /api/traducir:', err);
    }
  }

  /**
   * Consulta GET /api/vocabulario?q=...&categoria=... en SQLite y renderiza las tarjetas
   */
  async function fetchAndRenderVocabList() {
    const container = document.getElementById('vocab-list-container');
    const searchInput = document.getElementById('vocab-search-input');
    if (!container) return;

    const q = searchInput ? searchInput.value.trim() : '';
    const catParam = currentVocabCat === 'Todos' ? '' : currentVocabCat;

    try {
      const url = `/api/vocabulario?q=${encodeURIComponent(q)}&categoria=${encodeURIComponent(catParam)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const filtered = await res.json();

      const catColors = {
        'Herramientas de corte': 'text-primary border-primary/30 bg-primary/10',
        'Instrumentos de medición y verificación': 'text-secondary border-secondary/30 bg-secondary/10',
        'Elementos de alineación, apoyo y localización': 'text-tertiary border-tertiary/30 bg-tertiary/10',
        'Dispositivos de sujeción': 'text-amber-300 border-amber-400/30 bg-amber-400/10'
      };

      container.innerHTML = filtered.map((item) => {
        const termEs = item.termino_es || item.es;
        const termEn = item.termino_en || item.en;
        const nota = item.nota_tecnica || item.nota || '';
        const badgeClass = catColors[item.clasificacion] || 'text-secondary border-white/10 bg-white/5';

        return `
          <div class="vocab-card p-3 rounded-xl bg-surface hover:bg-surface-high border border-white/10 flex flex-col justify-between gap-1.5 cursor-pointer transition-all group" data-es="${termEs}">
            <div class="flex items-center justify-between gap-1">
              <span class="px-2 py-0.5 rounded font-mono text-[10px] font-semibold border ${badgeClass} truncate">
                ${item.clasificacion}
              </span>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" class="btn-card-speak-es w-6 h-6 rounded bg-white/5 hover:bg-primary hover:text-slate-950 text-outline flex items-center justify-center transition-colors" data-text="${termEs}" title="Escuchar en Español">
                  <span class="font-mono text-[9px] font-bold">ES</span>
                </button>
                <button type="button" class="btn-card-speak-en w-6 h-6 rounded bg-white/5 hover:bg-secondary hover:text-slate-950 text-outline flex items-center justify-center transition-colors" data-text="${termEn}" title="Listen in English">
                  <span class="font-mono text-[9px] font-bold">EN</span>
                </button>
              </div>
            </div>

            <div class="flex flex-col">
              <div class="font-display text-sm font-bold text-white group-hover:text-primary transition-colors">
                🇪🇸 ${termEs}
              </div>
              <div class="font-display text-sm font-bold text-secondary">
                🇬🇧 ${termEn}
              </div>
            </div>

            <p class="font-body text-[11px] text-outline leading-snug line-clamp-2">
              ${nota}
            </p>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.vocab-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const termEs = card.dataset.es;
          const inputEl = document.getElementById('translator-input');
          if (inputEl) {
            inputEl.value = termEs;
            runTechnicalTranslation(termEs);
          }
        });
      });

      container.querySelectorAll('.btn-card-speak-es').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          speakTerm(btn.dataset.text, 'es', btn);
        });
      });

      container.querySelectorAll('.btn-card-speak-en').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          speakTerm(btn.dataset.text, 'en', btn);
        });
      });
    } catch (err) {
      console.error('Error al consultar GET /api/vocabulario:', err);
    }
  }

  function switchMainTab(tabName) {
    const tabBtnScanner = document.getElementById('tab-btn-scanner');
    const tabBtnTranslator = document.getElementById('tab-btn-translator');
    const viewScanner = document.getElementById('view-scanner');
    const viewTranslator = document.getElementById('view-translator');

    if (tabName === 'translator') {
      viewScanner.classList.add('hidden');
      viewScanner.classList.remove('flex');
      viewTranslator.classList.remove('hidden');
      viewTranslator.classList.add('flex');

      tabBtnTranslator.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-md font-display text-xs font-bold bg-primary text-slate-950 shadow flex items-center gap-1.5 transition-all';
      tabBtnScanner.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-md font-display text-xs font-bold text-on-surface-variant hover:text-white flex items-center gap-1.5 transition-all';
    } else {
      viewTranslator.classList.add('hidden');
      viewTranslator.classList.remove('flex');
      viewScanner.classList.remove('hidden');
      viewScanner.classList.add('flex');

      tabBtnScanner.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-md font-display text-xs font-bold bg-primary text-slate-950 shadow flex items-center gap-1.5 transition-all';
      tabBtnTranslator.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-md font-display text-xs font-bold text-on-surface-variant hover:text-white flex items-center gap-1.5 transition-all';
    }
  }

  function bindEvents() {
    const tabBtnScanner = document.getElementById('tab-btn-scanner');
    const tabBtnTranslator = document.getElementById('tab-btn-translator');
    if (tabBtnScanner) tabBtnScanner.addEventListener('click', () => switchMainTab('scanner'));
    if (tabBtnTranslator) tabBtnTranslator.addEventListener('click', () => switchMainTab('translator'));

    const btnToggleCam = document.getElementById('btn-toggle-camera');
    const btnStartHero = document.getElementById('btn-start-hero');
    const cameraSelect = document.getElementById('camera-select');
    const fileInput = document.getElementById('qr-file-input');

    if (btnToggleCam) {
      btnToggleCam.addEventListener('click', () => startOrSwitchCamera(cameraSelect ? cameraSelect.value : null));
    }
    if (btnStartHero) {
      btnStartHero.addEventListener('click', () => startOrSwitchCamera(cameraSelect ? cameraSelect.value : null));
    }
    if (cameraSelect) {
      cameraSelect.addEventListener('change', () => {
        if (cameraSelect.value) startOrSwitchCamera(cameraSelect.value);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || typeof Html5Qrcode === 'undefined') return;
        try {
          if (!html5QrCode) html5QrCode = new Html5Qrcode('qr-reader');
          const decodedText = await html5QrCode.scanFile(file, false);
          const id = extractToolIdFromQR(decodedText);
          if (id) showLensCardForTool(id, true);
        } catch (_) {
          alert('No se detectó un código QR en la imagen seleccionada.');
        }
      });
    }

    const btnSpeakEs = document.getElementById('btn-speak-es');
    const btnSpeakEn = document.getElementById('btn-speak-en');
    if (btnSpeakEs) {
      btnSpeakEs.addEventListener('click', () => {
        if (!currentTool) return;
        speakTerm(currentTool.nombre_es || currentTool.idiomas?.es?.nombre, 'es', btnSpeakEs);
      });
    }
    if (btnSpeakEn) {
      btnSpeakEn.addEventListener('click', () => {
        if (!currentTool) return;
        speakTerm(currentTool.nombre_en || currentTool.idiomas?.en?.nombre, 'en', btnSpeakEn);
      });
    }

    const btnCloseHud = document.getElementById('btn-close-hud');
    if (btnCloseHud) {
      btnCloseHud.addEventListener('click', hideLensCard);
    }

    const btnOpenModal = document.getElementById('btn-open-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const modal3d = document.getElementById('modal-3d');
    if (btnOpenModal && modal3d) {
      btnOpenModal.addEventListener('click', () => {
        modal3d.classList.remove('hidden');
        modal3d.classList.add('flex');
      });
    }
    if (btnCloseModal && modal3d) {
      btnCloseModal.addEventListener('click', () => {
        modal3d.classList.add('hidden');
        modal3d.classList.remove('flex');
      });
    }
    if (modal3d) {
      modal3d.addEventListener('click', (e) => {
        if (e.target === modal3d) {
          modal3d.classList.add('hidden');
          modal3d.classList.remove('flex');
        }
      });
    }

    const translatorInput = document.getElementById('translator-input');
    const btnClearTranslator = document.getElementById('btn-clear-translator');
    const btnSwapLang = document.getElementById('btn-swap-lang');
    const btnSpeakTranslation = document.getElementById('btn-speak-translation');
    const btnCopyTranslation = document.getElementById('btn-copy-translation');

    if (translatorInput) {
      translatorInput.addEventListener('input', () => {
        clearTimeout(translateTimer);
        translateTimer = setTimeout(() => {
          runTechnicalTranslation(translatorInput.value);
        }, 160);
      });
    }
    if (btnClearTranslator && translatorInput) {
      btnClearTranslator.addEventListener('click', () => {
        translatorInput.value = '';
        runTechnicalTranslation('');
        translatorInput.focus();
      });
    }
    if (btnSwapLang) {
      btnSwapLang.addEventListener('click', () => {
        translateDirection = translateDirection === 'es-en' ? 'en-es' : 'es-en';
        const fromEl = document.getElementById('dir-label-from');
        const toEl = document.getElementById('dir-label-to');
        if (translateDirection === 'es-en') {
          if (fromEl) fromEl.textContent = '🇪🇸 Español';
          if (toEl) toEl.textContent = '🇬🇧 Inglés Técnico';
        } else {
          if (fromEl) fromEl.textContent = '🇬🇧 Inglés Técnico';
          if (toEl) toEl.textContent = '🇪🇸 Español';
        }
        if (translatorInput && lastTranslatedOutput) {
          translatorInput.value = lastTranslatedOutput;
          runTechnicalTranslation(translatorInput.value);
        }
      });
    }
    if (btnSpeakTranslation) {
      btnSpeakTranslation.addEventListener('click', () => {
        speakTerm(lastTranslatedOutput, lastTranslatedLang, btnSpeakTranslation);
      });
    }
    if (btnCopyTranslation) {
      btnCopyTranslation.addEventListener('click', () => {
        if (navigator.clipboard && lastTranslatedOutput) {
          navigator.clipboard.writeText(lastTranslatedOutput).catch(() => {});
        }
      });
    }

    document.querySelectorAll('.sample-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const sampleText = chip.dataset.sample;
        if (translatorInput) {
          translatorInput.value = sampleText;
          runTechnicalTranslation(sampleText);
        }
      });
    });

    const vocabSearchInput = document.getElementById('vocab-search-input');
    if (vocabSearchInput) {
      vocabSearchInput.addEventListener('input', () => {
        clearTimeout(vocabFilterTimer);
        vocabFilterTimer = setTimeout(() => {
          fetchAndRenderVocabList();
        }, 150);
      });
    }

    const catButtons = document.querySelectorAll('#vocab-cat-filters button');
    catButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        currentVocabCat = btn.dataset.cat;
        catButtons.forEach(b => {
          if (b.dataset.cat === currentVocabCat) {
            b.className = 'px-3 py-1 rounded-full font-mono text-xs font-bold bg-primary text-slate-950 shrink-0 transition-all';
          } else {
            b.className = 'px-3 py-1 rounded-full font-mono text-xs bg-surface hover:bg-surface-high text-on-surface-variant hover:text-white border border-white/10 shrink-0 transition-all';
          }
        });
        fetchAndRenderVocabList();
      });
    });
  }

  // Inicialización principal consumiendo únicamente los endpoints REST de SQLite
  async function init() {
    try {
      fetch('/api/info')
        .then(r => r.json())
        .then(info => {
          const lanText = document.getElementById('lan-status-text');
          if (lanText && info && info.ip) {
            lanText.textContent = `LAN: ${info.ip}:${info.port} · SQLite API`;
          }
        })
        .catch(() => {});

      const [resHerramientas, resVocabulario] = await Promise.all([
        fetch('/api/herramientas'),
        fetch('/api/vocabulario')
      ]);

      herramientasQR = await resHerramientas.json();
      vocabularioCNC = await resVocabulario.json();

      const totalPill = document.getElementById('vocab-total-pill');
      if (totalPill && vocabularioCNC.length) {
        totalPill.textContent = vocabularioCNC.length;
      }
    } catch (err) {
      console.error('Error conectando con la API REST SQLite:', err);
      return;
    }

    renderQuickSimStrip();
    await fetchAndRenderVocabList();
    bindEvents();

    const translatorInput = document.getElementById('translator-input');
    if (translatorInput) {
      translatorInput.value = 'machuelo';
      runTechnicalTranslation('machuelo');
    }

    await populateCameraList();
    startOrSwitchCamera();

    const params = new URLSearchParams(window.location.search);
    const piezaParam = params.get('pieza') || params.get('id');
    if (piezaParam) {
      showLensCardForTool(piezaParam, false);
    } else {
      hideLensCard();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
