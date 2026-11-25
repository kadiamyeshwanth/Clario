/**
 * lib/i18n.js — interface translations.
 *
 * Covers the app chrome (navigation, top bar, common actions) and the pages
 * added in v3 (Split, Settings → Preferences/Security, Challenges). Strings not
 * yet in a dictionary fall back to English, so a partial translation never
 * shows a raw key.
 *
 * Shared with the web app (web/src/lib/i18n.js); the language comes from the
 * user's saved preference and is applied when the session loads.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const D = {
  hi: {
    Home: 'होम', Ask: 'पूछें', Plan: 'योजना', 'Ask Mira': 'मीरा से पूछें',
    Overview: 'अवलोकन', Analytics: 'विश्लेषण', Transactions: 'लेन-देन', Portfolio: 'पोर्टफोलियो', Accounts: 'खाते',
    Planning: 'योजना', Budgets: 'बजट', Goals: 'लक्ष्य', More: 'और', Subscriptions: 'सदस्यताएँ', Recurring: 'आवर्ती',
    Reports: 'रिपोर्ट', Family: 'परिवार', Challenges: 'चुनौतियाँ', Journal: 'जर्नल', 'Monthly Wrapped': 'मासिक सारांश',
    Help: 'सहायता', Split: 'बाँटें', Settings: 'सेटिंग्स', Profile: 'प्रोफ़ाइल', 'Sign out': 'साइन आउट',
    Save: 'सहेजें', Cancel: 'रद्द करें', Delete: 'हटाएँ', Add: 'जोड़ें', Create: 'बनाएँ', Join: 'जुड़ें',
    'Split expenses': 'साझा खर्च', 'New group': 'नया समूह', 'Join a group': 'समूह से जुड़ें', 'Add expense': 'खर्च जोड़ें',
    'Settle up': 'हिसाब चुकता करें', 'You are owed': 'आपको मिलना है', 'You owe': 'आपको देना है', 'All settled': 'सब बराबर',
    Members: 'सदस्य', Balances: 'शेष', Expenses: 'खर्च', 'Invite code': 'आमंत्रण कोड', 'Paid by': 'भुगतानकर्ता',
    Preferences: 'प्राथमिकताएँ', Currency: 'मुद्रा', Language: 'भाषा', Timezone: 'समय क्षेत्र', Notifications: 'सूचनाएँ',
    'Signed-in devices': 'साइन-इन डिवाइस', 'Export my data': 'मेरा डेटा निर्यात करें', 'Sign out everywhere': 'हर जगह से साइन आउट',
    'Join challenge': 'चुनौती में शामिल हों', 'Active challenges': 'सक्रिय चुनौतियाँ', 'Transfer': 'स्थानांतरण', Account: 'खाता',
  },
  es: {
    Home: 'Inicio', Ask: 'Preguntar', Plan: 'Plan', 'Ask Mira': 'Pregunta a Mira',
    Overview: 'Resumen', Analytics: 'Análisis', Transactions: 'Movimientos', Portfolio: 'Cartera', Accounts: 'Cuentas',
    Planning: 'Planificación', Budgets: 'Presupuestos', Goals: 'Metas', More: 'Más', Subscriptions: 'Suscripciones', Recurring: 'Recurrentes',
    Reports: 'Informes', Family: 'Familia', Challenges: 'Retos', Journal: 'Diario', 'Monthly Wrapped': 'Resumen mensual',
    Help: 'Ayuda', Split: 'Dividir', Settings: 'Ajustes', Profile: 'Perfil', 'Sign out': 'Cerrar sesión',
    Save: 'Guardar', Cancel: 'Cancelar', Delete: 'Eliminar', Add: 'Añadir', Create: 'Crear', Join: 'Unirse',
    'Split expenses': 'Gastos compartidos', 'New group': 'Nuevo grupo', 'Join a group': 'Unirse a un grupo', 'Add expense': 'Añadir gasto',
    'Settle up': 'Saldar cuentas', 'You are owed': 'Te deben', 'You owe': 'Debes', 'All settled': 'Todo saldado',
    Members: 'Miembros', Balances: 'Saldos', Expenses: 'Gastos', 'Invite code': 'Código de invitación', 'Paid by': 'Pagado por',
    Preferences: 'Preferencias', Currency: 'Moneda', Language: 'Idioma', Timezone: 'Zona horaria', Notifications: 'Notificaciones',
    'Signed-in devices': 'Dispositivos conectados', 'Export my data': 'Exportar mis datos', 'Sign out everywhere': 'Cerrar sesión en todas partes',
    'Join challenge': 'Unirse al reto', 'Active challenges': 'Retos activos', Transfer: 'Transferir', Account: 'Cuenta',
  },
  fr: {
    Home: 'Accueil', Ask: 'Demander', Plan: 'Plan', 'Ask Mira': 'Demander à Mira',
    Overview: 'Aperçu', Analytics: 'Analyses', Transactions: 'Opérations', Portfolio: 'Portefeuille', Accounts: 'Comptes',
    Planning: 'Planification', Budgets: 'Budgets', Goals: 'Objectifs', More: 'Plus', Subscriptions: 'Abonnements', Recurring: 'Récurrents',
    Reports: 'Rapports', Family: 'Famille', Challenges: 'Défis', Journal: 'Journal', 'Monthly Wrapped': 'Bilan du mois',
    Help: 'Aide', Split: 'Partager', Settings: 'Réglages', Profile: 'Profil', 'Sign out': 'Se déconnecter',
    Save: 'Enregistrer', Cancel: 'Annuler', Delete: 'Supprimer', Add: 'Ajouter', Create: 'Créer', Join: 'Rejoindre',
    'Split expenses': 'Dépenses partagées', 'New group': 'Nouveau groupe', 'Join a group': 'Rejoindre un groupe', 'Add expense': 'Ajouter une dépense',
    'Settle up': 'Régler', 'You are owed': 'On vous doit', 'You owe': 'Vous devez', 'All settled': 'Tout est réglé',
    Members: 'Membres', Balances: 'Soldes', Expenses: 'Dépenses', 'Invite code': "Code d'invitation", 'Paid by': 'Payé par',
    Preferences: 'Préférences', Currency: 'Devise', Language: 'Langue', Timezone: 'Fuseau horaire', Notifications: 'Notifications',
    'Signed-in devices': 'Appareils connectés', 'Export my data': 'Exporter mes données', 'Sign out everywhere': 'Se déconnecter partout',
    'Join challenge': 'Relever le défi', 'Active challenges': 'Défis en cours', Transfer: 'Virement', Account: 'Compte',
  },
  de: {
    Home: 'Start', Ask: 'Fragen', Plan: 'Plan', 'Ask Mira': 'Mira fragen',
    Overview: 'Übersicht', Analytics: 'Analysen', Transactions: 'Buchungen', Portfolio: 'Portfolio', Accounts: 'Konten',
    Planning: 'Planung', Budgets: 'Budgets', Goals: 'Ziele', More: 'Mehr', Subscriptions: 'Abos', Recurring: 'Wiederkehrend',
    Reports: 'Berichte', Family: 'Familie', Challenges: 'Challenges', Journal: 'Tagebuch', 'Monthly Wrapped': 'Monatsrückblick',
    Help: 'Hilfe', Split: 'Teilen', Settings: 'Einstellungen', Profile: 'Profil', 'Sign out': 'Abmelden',
    Save: 'Speichern', Cancel: 'Abbrechen', Delete: 'Löschen', Add: 'Hinzufügen', Create: 'Erstellen', Join: 'Beitreten',
    'Split expenses': 'Geteilte Ausgaben', 'New group': 'Neue Gruppe', 'Join a group': 'Gruppe beitreten', 'Add expense': 'Ausgabe hinzufügen',
    'Settle up': 'Ausgleichen', 'You are owed': 'Du bekommst', 'You owe': 'Du schuldest', 'All settled': 'Alles ausgeglichen',
    Members: 'Mitglieder', Balances: 'Salden', Expenses: 'Ausgaben', 'Invite code': 'Einladungscode', 'Paid by': 'Bezahlt von',
    Preferences: 'Einstellungen', Currency: 'Währung', Language: 'Sprache', Timezone: 'Zeitzone', Notifications: 'Benachrichtigungen',
    'Signed-in devices': 'Angemeldete Geräte', 'Export my data': 'Meine Daten exportieren', 'Sign out everywhere': 'Überall abmelden',
    'Join challenge': 'Challenge starten', 'Active challenges': 'Aktive Challenges', Transfer: 'Umbuchung', Account: 'Konto',
  },
  pt: {
    Home: 'Início', Ask: 'Perguntar', Plan: 'Plano', 'Ask Mira': 'Pergunte à Mira',
    Overview: 'Visão geral', Analytics: 'Análises', Transactions: 'Transações', Portfolio: 'Carteira', Accounts: 'Contas',
    Planning: 'Planejamento', Budgets: 'Orçamentos', Goals: 'Metas', More: 'Mais', Subscriptions: 'Assinaturas', Recurring: 'Recorrentes',
    Reports: 'Relatórios', Family: 'Família', Challenges: 'Desafios', Journal: 'Diário', 'Monthly Wrapped': 'Resumo do mês',
    Help: 'Ajuda', Split: 'Dividir', Settings: 'Configurações', Profile: 'Perfil', 'Sign out': 'Sair',
    Save: 'Salvar', Cancel: 'Cancelar', Delete: 'Excluir', Add: 'Adicionar', Create: 'Criar', Join: 'Entrar',
    'Split expenses': 'Despesas divididas', 'New group': 'Novo grupo', 'Join a group': 'Entrar em um grupo', 'Add expense': 'Adicionar despesa',
    'Settle up': 'Acertar contas', 'You are owed': 'Você tem a receber', 'You owe': 'Você deve', 'All settled': 'Tudo acertado',
    Members: 'Membros', Balances: 'Saldos', Expenses: 'Despesas', 'Invite code': 'Código de convite', 'Paid by': 'Pago por',
    Preferences: 'Preferências', Currency: 'Moeda', Language: 'Idioma', Timezone: 'Fuso horário', Notifications: 'Notificações',
    'Signed-in devices': 'Dispositivos conectados', 'Export my data': 'Exportar meus dados', 'Sign out everywhere': 'Sair de todos os lugares',
    'Join challenge': 'Entrar no desafio', 'Active challenges': 'Desafios ativos', Transfer: 'Transferir', Account: 'Conta',
  },
};

let lang = 'en';

export const setLanguage = (code) => {
  lang = D[code] || code === 'en' ? code : 'en';
};
export const language = () => lang;

/** Translate an English UI string; falls back to the English text itself. */
export const t = (s) => (lang !== 'en' && D[lang]?.[s]) || s;

