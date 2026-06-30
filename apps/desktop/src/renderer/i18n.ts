import { useStore } from './store.js';

/** Languages we ship UI translations for. */
export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
];

type Dict = Record<string, string>;

// English is the source of truth; other locales fall back to it per-key.
const en: Dict = {
  'nav.command': 'Command Center',
  'nav.chat': 'Chat',
  'nav.design': 'Design',
  'nav.skills': 'Skills',
  'nav.projects': 'Projects',
  'nav.models': 'Models',
  'nav.connectors': 'Connectors',
  'nav.memory': 'Memory',
  'nav.settings': 'Settings',

  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.accent': 'Accent color',
  'settings.mascot': 'Show Nekko mascot',
  'settings.language': 'Language',
  'settings.languageHint': 'Choose the interface language (defaults to your system).',
  'settings.systemDefault': 'System default',
  'settings.updates': 'Updates',
  'settings.checkAuto': 'Check for updates automatically',
  'settings.checkNow': 'Check now',
  'settings.sandbox': 'Sandbox',
  'settings.chatModes': 'Chat modes',
  'settings.guardrails': 'Guardrails',

  'theme.light': 'light',
  'theme.dark': 'dark',
  'theme.system': 'system',
};

const es: Dict = {
  'nav.command': 'Centro de mando',
  'nav.chat': 'Chat',
  'nav.projects': 'Proyectos',
  'nav.models': 'Modelos',
  'nav.connectors': 'Conectores',
  'nav.memory': 'Memoria',
  'nav.settings': 'Ajustes',
  'settings.title': 'Ajustes',
  'settings.appearance': 'Apariencia',
  'settings.theme': 'Tema',
  'settings.accent': 'Color de acento',
  'settings.mascot': 'Mostrar la mascota Nekko',
  'settings.language': 'Idioma',
  'settings.languageHint': 'Elige el idioma de la interfaz (por defecto, el del sistema).',
  'settings.systemDefault': 'Predeterminado del sistema',
  'settings.updates': 'Actualizaciones',
  'settings.checkAuto': 'Buscar actualizaciones automáticamente',
  'settings.checkNow': 'Buscar ahora',
  'settings.sandbox': 'Entorno aislado',
  'settings.chatModes': 'Modos de chat',
  'settings.guardrails': 'Salvaguardas',
  'theme.light': 'claro',
  'theme.dark': 'oscuro',
  'theme.system': 'sistema',
};

const fr: Dict = {
  'nav.command': 'Centre de commande',
  'nav.chat': 'Discussion',
  'nav.projects': 'Projets',
  'nav.models': 'Modèles',
  'nav.connectors': 'Connecteurs',
  'nav.memory': 'Mémoire',
  'nav.settings': 'Paramètres',
  'settings.title': 'Paramètres',
  'settings.appearance': 'Apparence',
  'settings.theme': 'Thème',
  'settings.accent': "Couleur d'accent",
  'settings.mascot': 'Afficher la mascotte Nekko',
  'settings.language': 'Langue',
  'settings.languageHint': "Choisissez la langue de l'interface (système par défaut).",
  'settings.systemDefault': 'Par défaut du système',
  'settings.updates': 'Mises à jour',
  'settings.checkAuto': 'Vérifier les mises à jour automatiquement',
  'settings.checkNow': 'Vérifier maintenant',
  'settings.sandbox': 'Bac à sable',
  'settings.chatModes': 'Modes de discussion',
  'settings.guardrails': 'Garde-fous',
  'theme.light': 'clair',
  'theme.dark': 'sombre',
  'theme.system': 'système',
};

const de: Dict = {
  'nav.command': 'Kommandozentrale',
  'nav.chat': 'Chat',
  'nav.projects': 'Projekte',
  'nav.models': 'Modelle',
  'nav.connectors': 'Konnektoren',
  'nav.memory': 'Speicher',
  'nav.settings': 'Einstellungen',
  'settings.title': 'Einstellungen',
  'settings.appearance': 'Darstellung',
  'settings.theme': 'Design',
  'settings.accent': 'Akzentfarbe',
  'settings.mascot': 'Nekko-Maskottchen anzeigen',
  'settings.language': 'Sprache',
  'settings.languageHint': 'Sprache der Oberfläche wählen (Standard: System).',
  'settings.systemDefault': 'Systemstandard',
  'settings.updates': 'Aktualisierungen',
  'settings.checkAuto': 'Automatisch nach Updates suchen',
  'settings.checkNow': 'Jetzt suchen',
  'settings.sandbox': 'Sandbox',
  'settings.chatModes': 'Chat-Modi',
  'settings.guardrails': 'Schutzregeln',
  'theme.light': 'hell',
  'theme.dark': 'dunkel',
  'theme.system': 'System',
};

const pt: Dict = {
  'nav.command': 'Central de comando',
  'nav.chat': 'Conversa',
  'nav.projects': 'Projetos',
  'nav.models': 'Modelos',
  'nav.connectors': 'Conectores',
  'nav.memory': 'Memória',
  'nav.settings': 'Configurações',
  'settings.title': 'Configurações',
  'settings.appearance': 'Aparência',
  'settings.theme': 'Tema',
  'settings.accent': 'Cor de destaque',
  'settings.mascot': 'Mostrar o mascote Nekko',
  'settings.language': 'Idioma',
  'settings.languageHint': 'Escolha o idioma da interface (padrão do sistema).',
  'settings.systemDefault': 'Padrão do sistema',
  'settings.updates': 'Atualizações',
  'settings.checkAuto': 'Verificar atualizações automaticamente',
  'settings.checkNow': 'Verificar agora',
  'settings.sandbox': 'Sandbox',
  'settings.chatModes': 'Modos de conversa',
  'settings.guardrails': 'Proteções',
  'theme.light': 'claro',
  'theme.dark': 'escuro',
  'theme.system': 'sistema',
};

const ja: Dict = {
  'nav.command': 'コマンドセンター',
  'nav.chat': 'チャット',
  'nav.projects': 'プロジェクト',
  'nav.models': 'モデル',
  'nav.connectors': 'コネクタ',
  'nav.memory': 'メモリ',
  'nav.settings': '設定',
  'settings.title': '設定',
  'settings.appearance': '外観',
  'settings.theme': 'テーマ',
  'settings.accent': 'アクセントカラー',
  'settings.mascot': 'Nekko マスコットを表示',
  'settings.language': '言語',
  'settings.languageHint': 'インターフェースの言語を選択（既定はシステム）。',
  'settings.systemDefault': 'システムの既定',
  'settings.updates': 'アップデート',
  'settings.checkAuto': '自動でアップデートを確認',
  'settings.checkNow': '今すぐ確認',
  'settings.sandbox': 'サンドボックス',
  'settings.chatModes': 'チャットモード',
  'settings.guardrails': 'ガードレール',
  'theme.light': 'ライト',
  'theme.dark': 'ダーク',
  'theme.system': 'システム',
};

const zh: Dict = {
  'nav.command': '指挥中心',
  'nav.chat': '聊天',
  'nav.projects': '项目',
  'nav.models': '模型',
  'nav.connectors': '连接器',
  'nav.memory': '记忆',
  'nav.settings': '设置',
  'settings.title': '设置',
  'settings.appearance': '外观',
  'settings.theme': '主题',
  'settings.accent': '强调色',
  'settings.mascot': '显示 Nekko 吉祥物',
  'settings.language': '语言',
  'settings.languageHint': '选择界面语言（默认跟随系统）。',
  'settings.systemDefault': '系统默认',
  'settings.updates': '更新',
  'settings.checkAuto': '自动检查更新',
  'settings.checkNow': '立即检查',
  'settings.sandbox': '沙盒',
  'settings.chatModes': '聊天模式',
  'settings.guardrails': '防护规则',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.system': '系统',
};

const DICTS: Record<string, Dict> = { en, es, fr, de, pt, ja, zh };

/** Resolve the active language: explicit setting → system → English. */
export function resolveLang(setting?: string): string {
  if (setting && DICTS[setting]) return setting;
  const sys = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  return DICTS[sys] ? sys : 'en';
}

export function translate(lang: string, key: string): string {
  const l = DICTS[lang] ?? en;
  return l[key] ?? en[key] ?? key;
}

/** Hook: returns a `t(key)` bound to the user's current language. */
export function useT(): (key: string) => string {
  const lang = useStore((s) => resolveLang(s.settings?.language));
  return (key: string) => translate(lang, key);
}
