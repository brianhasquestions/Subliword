/**
 * Lightweight i18n for Subliword.
 * Translates static markup (via data-i18n / data-i18n-* attributes) and provides
 * t(key, vars) for strings built in JS (achievements, errors, progress messages).
 *
 * No build step and no external deps — a plain dictionary per language.
 */
const I18N = (function () {
  'use strict';

  const STORAGE_KEY = 'subliword.lang';

  // Languages the interface is translated into (autonyms shown in the switcher).
  const LANGUAGE_NAMES = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch'
  };

  const RTL_LANGS = []; // No RTL *interface* language yet (document RTL is separate).

  const translations = {
    en: {
      tagline: 'Speed Reading Made Simple',
      drop_here: 'Drag & drop your file here',
      supported_formats: 'PDF, DOCX, EPUB, or TXT',
      or: 'or',
      browse: 'Browse Files',
      processing: 'Processing your file...',
      ocr_lang_label: 'Scanned PDF language',
      controls: 'Controls',
      chapter: 'Chapter',
      speed: 'Speed',
      wpm_unit: 'WPM',
      words_per_chunk: 'Words per chunk',
      warmup: 'Warm-up ramp',
      stat_words: 'Words read',
      stat_speed: 'Top speed',
      stat_saved: 'Time saved',
      new_document: 'New Document',
      shortcuts: 'Keyboard Shortcuts',
      sc_playpause: 'Play/Pause',
      sc_prev: 'Previous Sentence',
      sc_next: 'Next Sentence',
      sc_faster: 'Increase Speed',
      sc_slower: 'Decrease Speed',
      words: 'words',
      language_label: 'Language',
      theme_toggle: 'Toggle light or dark theme',
      about: 'About',
      privacy: 'Privacy',
      // Achievements
      ach_quickstart_title: 'Quick Start',
      ach_quickstart_desc: 'Parsed in {time}s!',
      ach_speeddemon_title: 'Speed Demon',
      ach_speeddemon_desc: 'Reached over {wpm} WPM!',
      ach_bookworm_title: 'Bookworm',
      ach_bookworm_desc: 'Completed over {percent}% of the document!',
      ach_marathon_title: 'Marathon Reader',
      ach_marathon_desc: 'Read over {words} words!',
      ach_resume_title: 'Welcome back',
      ach_resume_desc: 'Resumed where you left off.',
      // Errors
      err_invalid_type: 'Invalid file type. Please upload a PDF, DOCX, EPUB, or TXT file.',
      err_no_words: 'No words found in document.',
      err_process: 'Failed to process file: {message}',
      err_libraries: 'Failed to load required libraries. Please refresh the page or check your internet connection.',
      err_libraries_retry: 'Required libraries are not loaded. Please refresh the page and try again.',
      // Progress
      title_parsing: 'Parsing document...',
      title_parsing_local: 'Parsing locally...',
      title_loading_libs: 'Loading libraries...',
      pg_please_wait: 'Please wait...',
      pg_reading_file: 'Reading file...',
      pg_processing_text: 'Processing text...',
      pg_finalizing: 'Finalizing...',
      pg_complete: 'Complete!',
      pg_loading_pdf: 'Loading PDF...',
      pg_extracting_page: 'Extracting page {i} of {n}...',
      pg_ocr_engine: 'Loading OCR engine for scanned pages...',
      pg_ocr_page: 'Reading scanned page {i} of {n} (OCR)...',
      pg_opening_epub: 'Opening EPUB...',
      pg_reading_section: 'Reading section {i} of {n}...',
      pg_extract_docx: 'Extracting DOCX content...',
      pg_reading_txt: 'Reading text file...'
    },

    es: {
      tagline: 'Lectura rápida, sin complicaciones',
      drop_here: 'Arrastra y suelta tu archivo aquí',
      supported_formats: 'PDF, DOCX, EPUB o TXT',
      or: 'o',
      browse: 'Elegir archivo',
      processing: 'Procesando tu archivo...',
      ocr_lang_label: 'Idioma del PDF escaneado',
      controls: 'Controles',
      chapter: 'Capítulo',
      speed: 'Velocidad',
      wpm_unit: 'PPM',
      words_per_chunk: 'Palabras por grupo',
      warmup: 'Aceleración gradual',
      stat_words: 'Palabras leídas',
      stat_speed: 'Velocidad máxima',
      stat_saved: 'Tiempo ahorrado',
      new_document: 'Nuevo documento',
      shortcuts: 'Atajos de teclado',
      sc_playpause: 'Reproducir/Pausar',
      sc_prev: 'Frase anterior',
      sc_next: 'Frase siguiente',
      sc_faster: 'Aumentar velocidad',
      sc_slower: 'Reducir velocidad',
      words: 'palabras',
      language_label: 'Idioma',
      theme_toggle: 'Cambiar entre tema claro y oscuro',
      about: 'Acerca de',
      privacy: 'Privacidad',
      ach_quickstart_title: 'Inicio rápido',
      ach_quickstart_desc: '¡Procesado en {time}s!',
      ach_speeddemon_title: 'Demonio de velocidad',
      ach_speeddemon_desc: '¡Superaste las {wpm} PPM!',
      ach_bookworm_title: 'Ratón de biblioteca',
      ach_bookworm_desc: '¡Completaste más del {percent}% del documento!',
      ach_marathon_title: 'Lector maratón',
      ach_marathon_desc: '¡Leíste más de {words} palabras!',
      ach_resume_title: 'Bienvenido de nuevo',
      ach_resume_desc: 'Continuaste donde lo dejaste.',
      err_invalid_type: 'Tipo de archivo no válido. Sube un archivo PDF, DOCX, EPUB o TXT.',
      err_no_words: 'No se encontraron palabras en el documento.',
      err_process: 'No se pudo procesar el archivo: {message}',
      err_libraries: 'No se pudieron cargar las librerías necesarias. Actualiza la página o revisa tu conexión.',
      err_libraries_retry: 'Las librerías necesarias no están cargadas. Actualiza la página e inténtalo de nuevo.',
      title_parsing: 'Analizando documento...',
      title_parsing_local: 'Analizando localmente...',
      title_loading_libs: 'Cargando librerías...',
      pg_please_wait: 'Espera un momento...',
      pg_reading_file: 'Leyendo el archivo...',
      pg_processing_text: 'Procesando el texto...',
      pg_finalizing: 'Finalizando...',
      pg_complete: '¡Listo!',
      pg_loading_pdf: 'Cargando PDF...',
      pg_extracting_page: 'Extrayendo página {i} de {n}...',
      pg_ocr_engine: 'Cargando el motor OCR para páginas escaneadas...',
      pg_ocr_page: 'Leyendo página escaneada {i} de {n} (OCR)...',
      pg_opening_epub: 'Abriendo EPUB...',
      pg_reading_section: 'Leyendo sección {i} de {n}...',
      pg_extract_docx: 'Extrayendo contenido DOCX...',
      pg_reading_txt: 'Leyendo archivo de texto...'
    },

    fr: {
      tagline: 'La lecture rapide, en toute simplicité',
      drop_here: 'Glissez-déposez votre fichier ici',
      supported_formats: 'PDF, DOCX, EPUB ou TXT',
      or: 'ou',
      browse: 'Parcourir',
      processing: 'Traitement de votre fichier...',
      ocr_lang_label: 'Langue du PDF numérisé',
      controls: 'Commandes',
      chapter: 'Chapitre',
      speed: 'Vitesse',
      wpm_unit: 'MPM',
      words_per_chunk: 'Mots par groupe',
      warmup: 'Montée en vitesse',
      stat_words: 'Mots lus',
      stat_speed: 'Vitesse max',
      stat_saved: 'Temps gagné',
      new_document: 'Nouveau document',
      shortcuts: 'Raccourcis clavier',
      sc_playpause: 'Lecture/Pause',
      sc_prev: 'Phrase précédente',
      sc_next: 'Phrase suivante',
      sc_faster: 'Accélérer',
      sc_slower: 'Ralentir',
      words: 'mots',
      language_label: 'Langue',
      theme_toggle: 'Basculer entre thème clair et sombre',
      about: 'À propos',
      privacy: 'Confidentialité',
      ach_quickstart_title: 'Démarrage rapide',
      ach_quickstart_desc: 'Analysé en {time}s !',
      ach_speeddemon_title: 'Bolide',
      ach_speeddemon_desc: 'Plus de {wpm} MPM atteints !',
      ach_bookworm_title: 'Rat de bibliothèque',
      ach_bookworm_desc: 'Plus de {percent}% du document terminé !',
      ach_marathon_title: 'Lecteur marathon',
      ach_marathon_desc: 'Plus de {words} mots lus !',
      ach_resume_title: 'Bon retour',
      ach_resume_desc: 'Reprise là où vous vous étiez arrêté.',
      err_invalid_type: 'Type de fichier invalide. Importez un fichier PDF, DOCX, EPUB ou TXT.',
      err_no_words: 'Aucun mot trouvé dans le document.',
      err_process: 'Échec du traitement du fichier : {message}',
      err_libraries: 'Impossible de charger les bibliothèques requises. Actualisez la page ou vérifiez votre connexion.',
      err_libraries_retry: 'Les bibliothèques requises ne sont pas chargées. Actualisez la page et réessayez.',
      title_parsing: 'Analyse du document...',
      title_parsing_local: 'Analyse locale...',
      title_loading_libs: 'Chargement des bibliothèques...',
      pg_please_wait: 'Veuillez patienter...',
      pg_reading_file: 'Lecture du fichier...',
      pg_processing_text: 'Traitement du texte...',
      pg_finalizing: 'Finalisation...',
      pg_complete: 'Terminé !',
      pg_loading_pdf: 'Chargement du PDF...',
      pg_extracting_page: 'Extraction de la page {i} sur {n}...',
      pg_ocr_engine: 'Chargement du moteur OCR pour les pages numérisées...',
      pg_ocr_page: 'Lecture de la page numérisée {i} sur {n} (OCR)...',
      pg_opening_epub: 'Ouverture de l\'EPUB...',
      pg_reading_section: 'Lecture de la section {i} sur {n}...',
      pg_extract_docx: 'Extraction du contenu DOCX...',
      pg_reading_txt: 'Lecture du fichier texte...'
    },

    de: {
      tagline: 'Schnelllesen leicht gemacht',
      drop_here: 'Datei hier ablegen',
      supported_formats: 'PDF, DOCX, EPUB oder TXT',
      or: 'oder',
      browse: 'Datei auswählen',
      processing: 'Datei wird verarbeitet...',
      ocr_lang_label: 'Sprache des gescannten PDFs',
      controls: 'Steuerung',
      chapter: 'Kapitel',
      speed: 'Geschwindigkeit',
      wpm_unit: 'WPM',
      words_per_chunk: 'Wörter pro Gruppe',
      warmup: 'Aufwärmphase',
      stat_words: 'Gelesene Wörter',
      stat_speed: 'Höchsttempo',
      stat_saved: 'Gesparte Zeit',
      new_document: 'Neues Dokument',
      shortcuts: 'Tastenkürzel',
      sc_playpause: 'Abspielen/Pause',
      sc_prev: 'Vorheriger Satz',
      sc_next: 'Nächster Satz',
      sc_faster: 'Schneller',
      sc_slower: 'Langsamer',
      words: 'Wörter',
      language_label: 'Sprache',
      theme_toggle: 'Zwischen hellem und dunklem Design wechseln',
      about: 'Über',
      privacy: 'Datenschutz',
      ach_quickstart_title: 'Schnellstart',
      ach_quickstart_desc: 'In {time}s verarbeitet!',
      ach_speeddemon_title: 'Temposünder',
      ach_speeddemon_desc: 'Über {wpm} WPM erreicht!',
      ach_bookworm_title: 'Leseratte',
      ach_bookworm_desc: 'Über {percent}% des Dokuments geschafft!',
      ach_marathon_title: 'Marathon-Leser',
      ach_marathon_desc: 'Über {words} Wörter gelesen!',
      ach_resume_title: 'Willkommen zurück',
      ach_resume_desc: 'Dort fortgesetzt, wo du aufgehört hast.',
      err_invalid_type: 'Ungültiger Dateityp. Bitte lade eine PDF-, DOCX-, EPUB- oder TXT-Datei hoch.',
      err_no_words: 'Keine Wörter im Dokument gefunden.',
      err_process: 'Datei konnte nicht verarbeitet werden: {message}',
      err_libraries: 'Erforderliche Bibliotheken konnten nicht geladen werden. Lade die Seite neu oder prüfe deine Verbindung.',
      err_libraries_retry: 'Erforderliche Bibliotheken sind nicht geladen. Lade die Seite neu und versuche es erneut.',
      title_parsing: 'Dokument wird analysiert...',
      title_parsing_local: 'Lokale Analyse...',
      title_loading_libs: 'Bibliotheken werden geladen...',
      pg_please_wait: 'Bitte warten...',
      pg_reading_file: 'Datei wird gelesen...',
      pg_processing_text: 'Text wird verarbeitet...',
      pg_finalizing: 'Wird abgeschlossen...',
      pg_complete: 'Fertig!',
      pg_loading_pdf: 'PDF wird geladen...',
      pg_extracting_page: 'Seite {i} von {n} wird extrahiert...',
      pg_ocr_engine: 'OCR-Engine für gescannte Seiten wird geladen...',
      pg_ocr_page: 'Gescannte Seite {i} von {n} wird gelesen (OCR)...',
      pg_opening_epub: 'EPUB wird geöffnet...',
      pg_reading_section: 'Abschnitt {i} von {n} wird gelesen...',
      pg_extract_docx: 'DOCX-Inhalt wird extrahiert...',
      pg_reading_txt: 'Textdatei wird gelesen...'
    }
  };

  function detectInitial() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && translations[stored]) return stored;
    } catch (e) { /* ignore */ }
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return translations[nav] ? nav : 'en';
  }

  let current = detectInitial();

  function t(key, vars) {
    const dict = translations[current] || translations.en;
    let s = (dict[key] != null) ? dict[key]
      : (translations.en[key] != null ? translations.en[key] : key);
    if (vars) {
      for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    }
    return s;
  }

  function apply() {
    document.documentElement.lang = current;
    document.documentElement.dir = RTL_LANGS.indexOf(current) !== -1 ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }

  function setLanguage(lang) {
    if (!translations[lang]) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    apply();
    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }));
  }

  return {
    t,
    apply,
    setLanguage,
    get language() { return current; },
    languageNames: LANGUAGE_NAMES,
    languages: Object.keys(translations)
  };
})();

window.I18N = I18N;
