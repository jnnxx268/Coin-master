'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  CircleDollarSign,
  Globe,
  Languages,
  LockKeyhole,
  Menu,
  PieChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { translateAppText } from './app-translations';
import {
  PLAN_PRICES,
  formatCurrency,
  formatNumber,
  resolveAppLocale,
} from './product-utils.mjs';

export const COUNTRY_OPTIONS = [
  'Argentina',
  'Brazil',
  'Canada',
  'Chile',
  'China',
  'Colombia',
  'Costa Rica',
  'Dominican Republic',
  'France',
  'Germany',
  'Ghana',
  'India',
  'Italy',
  'Jamaica',
  'Japan',
  'Mexico',
  'Netherlands',
  'Nigeria',
  'Other / not listed',
  'Panama',
  'Peru',
  'Singapore',
  'South Korea',
  'Spain',
  'Switzerland',
  'United Kingdom',
  'United States',
];

export const LANDING_LANGUAGES = [
  { value: 'English', locale: 'en', label: 'English' },
  { value: 'French', locale: 'fr', label: 'Français' },
  { value: 'Spanish', locale: 'es', label: 'Español' },
  { value: 'Portuguese', locale: 'pt', label: 'Português' },
  { value: 'German', locale: 'de', label: 'Deutsch' },
];

const ILLUSTRATIVE_ACTIVITY = [
  ['Maya', 'Canada', 'CAD', 2850],
  ['Lucas', 'Brazil', 'BRL', 7400],
  ['Amara', 'Ghana', 'GHS', 12300],
  ['Sofia', 'Spain', 'EUR', 1950],
  ['Noah', 'United Kingdom', 'GBP', 860],
  ['Amina', 'Nigeria', 'NGN', 1850000],
  ['Mateo', 'Mexico', 'MXN', 42800],
  ['Elena', 'Germany', 'EUR', 3150],
  ['Daniel', 'United States', 'USD', 2400],
  ['Chloe', 'France', 'EUR', 1780],
  ['Ravi', 'India', 'INR', 96500],
  ['Camila', 'Colombia', 'COP', 6800000],
  ['Ethan', 'Canada', 'CAD', 1240],
  ['Isabella', 'Italy', 'EUR', 2670],
  ['Kwame', 'Ghana', 'GHS', 8900],
  ['Beatriz', 'Portugal', 'EUR', 2210],
  ['Oliver', 'Australia', 'AUD', 3490],
  ['Zara', 'South Africa', 'ZAR', 38200],
  ['Gabriel', 'Argentina', 'ARS', 1650000],
  ['Hana', 'Japan', 'JPY', 295000],
  ['Theo', 'Netherlands', 'EUR', 1990],
  ['Nia', 'Jamaica', 'JMD', 245000],
  ['Diego', 'Chile', 'CLP', 1920000],
  ['Freya', 'Switzerland', 'CHF', 2340],
  ['Yusuf', 'Singapore', 'SGD', 3150],
  ['Lina', 'United States', 'USD', 1675],
  ['Samuel', 'Nigeria', 'NGN', 940000],
  ['Valentina', 'Peru', 'PEN', 7800],
  ['Eli', 'Germany', 'EUR', 1420],
  ['Aarav', 'India', 'INR', 73500],
  ['Mila', 'Brazil', 'BRL', 5200],
  ['Andre', 'France', 'EUR', 2840],
  ['Grace', 'United Kingdom', 'GBP', 1260],
  ['Rafael', 'Mexico', 'MXN', 31500],
  ['Laila', 'Costa Rica', 'CRC', 985000],
  ['Jonas', 'Sweden', 'SEK', 21800],
  ['Sara', 'South Korea', 'KRW', 2750000],
  ['Emmanuel', 'Ghana', 'GHS', 15700],
  ['Lucia', 'Dominican Republic', 'DOP', 112000],
  ['Adam', 'Poland', 'PLN', 8100],
];

function EarningNotificationPopup({ language }) {
  const [activityIndex, setActivityIndex] = useState(-1);
  const [visible, setVisible] = useState(false);
  const previousIndex = useRef(-1);

  useEffect(() => {
    let showTimer;
    let hideTimer;
    let active = true;

    const scheduleNext = (delay) => {
      showTimer = globalThis.setTimeout(() => {
        if (!active) return;
        let nextIndex = Math.floor(Math.random() * ILLUSTRATIVE_ACTIVITY.length);
        while (nextIndex === previousIndex.current) {
          nextIndex = Math.floor(Math.random() * ILLUSTRATIVE_ACTIVITY.length);
        }
        previousIndex.current = nextIndex;
        setActivityIndex(nextIndex);
        setVisible(true);
        hideTimer = globalThis.setTimeout(() => {
          if (!active) return;
          setVisible(false);
          scheduleNext(8000 + Math.floor(Math.random() * 9000));
        }, 5600);
      }, delay);
    };

    scheduleNext(4500 + Math.floor(Math.random() * 4500));
    return () => {
      active = false;
      globalThis.clearTimeout(showTimer);
      globalThis.clearTimeout(hideTimer);
    };
  }, []);

  if (activityIndex < 0) return null;

  const [name, country, currency, amount] = ILLUSTRATIVE_ACTIVITY[activityIndex];
  return (
    <aside
      className={`landing-activity-popup${visible ? ' is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <span className="landing-activity-icon" aria-hidden="true">
        <CircleDollarSign size={19} />
      </span>
      <div className="landing-activity-copy">
        <p className="landing-activity-heading">
          {translateAppText(language, 'Earning')}
        </p>
        <p className="landing-activity-message">
          <strong>{name}</strong> · {translateAppText(language, country)} {translateAppText(language, 'earned')} {currency} {formatNumber(amount, resolveAppLocale(language, country), { maximumFractionDigits: 0 })}
        </p>
      </div>
      <button
        type="button"
        className="landing-activity-dismiss"
        aria-label={translateAppText(language, 'Close')}
        tabIndex={visible ? 0 : -1}
        onClick={() => setVisible(false)}
      >
        ×
      </button>
    </aside>
  );
}

const translations = {
  en: {
    navMarkets: 'Markets',
    navFeatures: 'Features',
    navPlans: 'Plans',
    navFaq: 'FAQ',
    region: 'Region',
    language: 'Language',
    login: 'Log in',
    getStarted: 'Get started',
    eyebrow: 'A clearer view of your crypto portfolio',
    heroTitle: 'Make your next move',
    heroAccent: 'with confidence.',
    heroBody: 'Explore digital markets, follow your portfolio, and make informed decisions with a platform designed to keep everything in view.',
    createAccount: 'Create your account',
    explorePlatform: 'Explore the platform',
    heroNote: 'A powerful workspace for every stage of your trading journey.',
    activeMarkets: 'Markets at a glance',
    marketOpen: 'Market snapshot',
    marketUpdated: 'Illustrative market data',
    portfolioPreview: 'Portfolio overview',
    totalBalance: 'Total balance',
    weeklyReturn: 'Weekly change',
    sevenDayShort: '7d',
    weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    allocation: 'Asset allocation',
    portfolioLabel: 'Your portfolio, all in one place',
    statAssets: 'Digital assets',
    statMarkets: 'Markets tracked',
    statSupport: 'Support available',
    statControl: 'Portfolio control',
    platformLabel: 'The CoinMaster platform',
    featureTitle: 'Everything you need to stay in control.',
    featureBody: 'A considered set of tools brings your market activity, account overview, and portfolio insights together.',
    featureMarkets: 'Market insights',
    featureMarketsBody: 'Follow price movements and explore the assets that matter to your strategy.',
    featurePortfolio: 'Portfolio overview',
    featurePortfolioBody: 'See your balances, allocation, and account activity in one clear view.',
    featureTools: 'Trading workspace',
    featureToolsBody: 'Preview trades, compare assets, and keep your next move organized.',
    featureSecurity: 'Account protection',
    featureSecurityBody: 'Private account access and clear controls help keep your experience in your hands.',
    processLabel: 'A simple place to begin',
    processTitle: 'From first look to informed decisions.',
    processBody: 'Your account gives you a home base to explore markets and build a portfolio view that works for you.',
    stepOne: 'Create your account',
    stepOneBody: 'Sign up with your email and choose your region and language.',
    stepTwo: 'Explore the markets',
    stepTwoBody: 'Browse assets, market movement, and the tools available in your workspace.',
    stepThree: 'Build your portfolio view',
    stepThreeBody: 'Keep balances, watchlists, and account activity close at hand.',
    plansLabel: 'Accounts for your goals',
    plansTitle: 'Choose your way to get started.',
    plansBody: 'Start with the essentials, then choose a workspace with more room for your routine.',
    planStarter: 'Starter',
    planStarterBody: 'A straightforward introduction to your digital asset portfolio.',
    planActive: 'Active',
    planActiveBody: 'More tools for regular market research and portfolio tracking.',
    planAdvanced: 'Advanced',
    planAdvancedBody: 'A full-featured workspace for experienced market participants.',
    monthly: '/ month',
    planFeatureBasics: 'Portfolio dashboard',
    planFeatureMarkets: 'Market overview',
    planFeatureWallet: 'Wallet and activity view',
    planFeatureAlerts: 'Watchlists and price alerts',
    planFeatureResearch: 'Expanded market tools',
    planFeaturePriority: 'Priority support',
    planChoose: 'Choose {plan}',
    popular: 'Most popular',
    productLabel: 'Built around your workflow',
    productTitle: 'A more connected view of your assets.',
    productBody: 'Move between markets, wallet activity, and portfolio insights without losing sight of the bigger picture.',
    productMarkets: 'Explore markets',
    productWallet: 'Manage your wallet',
    productPortfolio: 'Track your portfolio',
    productMarketsBody: 'Compare supported assets and review price movement at a glance.',
    productWalletBody: 'Keep balances and recent account activity together.',
    productPortfolioBody: 'Understand how your asset mix fits into your overall view.',
    faqLabel: 'Questions, answered',
    faqTitle: 'A few things you may want to know.',
    faqOne: 'What is CoinMaster?',
    faqOneBody: 'CoinMaster is a digital asset platform concept for exploring markets, monitoring a portfolio, and organizing account activity in one workspace.',
    faqTwo: 'How do I create an account?',
    faqTwoBody: 'Select Get started, choose your region and language, then continue through the account form using your email address.',
    faqThree: 'Can I switch my language or region?',
    faqThreeBody: 'Yes. Use the selectors in the header at any time. Your choices are saved in this browser and your region is carried into signup.',
    faqFour: 'Which assets can I explore?',
    faqFourBody: 'The platform currently presents popular digital assets including Bitcoin, Ethereum, Tether, USD Coin, Litecoin, BNB, and Solana.',
    faqFive: 'How can I contact support?',
    faqFiveBody: 'Our support team can be reached at support@coinmaster.app. Typical response time is within one business day.',
    finalEyebrow: 'Your next move starts here',
    finalTitle: 'Bring your market view into focus.',
    finalBody: 'Create your CoinMaster account and explore a clearer way to follow your digital assets.',
    startExploring: 'Get started today',
    footerDescription: 'A thoughtful workspace for exploring digital markets and keeping your portfolio in view.',
    footerPlatform: 'Platform',
    footerCompany: 'Company',
    footerSupport: 'Support',
    footerAbout: 'About CoinMaster',
    footerContact: 'Contact us',
    footerHelp: 'Help center',
    footerAvailability: 'Available around the clock',
    copyright: '© 2026 CoinMaster. All rights reserved.',
    legalNote: 'Digital asset markets involve risk. This platform preview is for informational purposes.',
    menuOpen: 'Open navigation menu',
    menuClose: 'Close navigation menu',
    languageLabel: 'Choose language',
    regionLabel: 'Choose region',
    accountCreation: 'Get started',
    scrollMore: 'Scroll to explore',
  },
  fr: {
    navMarkets: 'Marchés',
    navFeatures: 'Fonctionnalités',
    navPlans: 'Offres',
    navFaq: 'FAQ',
    region: 'Région',
    language: 'Langue',
    login: 'Connexion',
    getStarted: 'Commencer',
    eyebrow: 'Une vision plus claire de votre portefeuille crypto',
    heroTitle: 'Faites votre prochain choix',
    heroAccent: 'en toute confiance.',
    heroBody: 'Explorez les marchés numériques, suivez votre portefeuille et prenez des décisions éclairées grâce à une plateforme conçue pour tout garder à portée de vue.',
    createAccount: 'Créer votre compte',
    explorePlatform: 'Découvrir la plateforme',
    heroNote: 'Un espace puissant pour chaque étape de votre parcours de trading.',
    activeMarkets: 'Les marchés en un coup d’œil',
    marketOpen: 'Aperçu du marché',
    marketUpdated: 'Données illustratives',
    portfolioPreview: 'Vue du portefeuille',
    totalBalance: 'Solde total',
    weeklyReturn: 'Variation hebdomadaire',
    sevenDayShort: '7 j',
    weekdays: ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'],
    allocation: 'Répartition des actifs',
    portfolioLabel: 'Votre portefeuille, au même endroit',
    statAssets: 'Actifs numériques',
    statMarkets: 'Marchés suivis',
    statSupport: 'Assistance disponible',
    statControl: 'Gestion du portefeuille',
    platformLabel: 'La plateforme CoinMaster',
    featureTitle: 'Tout pour garder le contrôle.',
    featureBody: 'Des outils conçus pour réunir votre activité de marché, votre compte et les informations de votre portefeuille.',
    featureMarkets: 'Analyses de marché',
    featureMarketsBody: 'Suivez les variations de prix et découvrez les actifs qui comptent pour votre stratégie.',
    featurePortfolio: 'Vue du portefeuille',
    featurePortfolioBody: 'Consultez vos soldes, votre répartition et l’activité de votre compte en un coup d’œil.',
    featureTools: 'Espace de trading',
    featureToolsBody: 'Prévisualisez des opérations, comparez les actifs et organisez vos prochaines décisions.',
    featureSecurity: 'Protection du compte',
    featureSecurityBody: 'Un accès privé et des commandes claires vous aident à garder la maîtrise de votre expérience.',
    processLabel: 'Un point de départ simple',
    processTitle: 'Du premier regard aux décisions éclairées.',
    processBody: 'Votre compte devient un espace central pour explorer les marchés et suivre votre portefeuille.',
    stepOne: 'Créez votre compte',
    stepOneBody: 'Inscrivez-vous par e-mail et choisissez votre région et votre langue.',
    stepTwo: 'Explorez les marchés',
    stepTwoBody: 'Parcourez les actifs, les mouvements du marché et les outils disponibles.',
    stepThree: 'Organisez votre portefeuille',
    stepThreeBody: 'Gardez vos soldes, listes de suivi et activités à portée de main.',
    plansLabel: 'Des comptes adaptés à vos objectifs',
    plansTitle: 'Choisissez votre façon de commencer.',
    plansBody: 'Commencez avec l’essentiel, puis choisissez un espace plus complet selon vos habitudes.',
    planStarter: 'Essentiel',
    planStarterBody: 'Une première approche simple de votre portefeuille d’actifs numériques.',
    planActive: 'Actif',
    planActiveBody: 'Plus d’outils pour suivre régulièrement les marchés et votre portefeuille.',
    planAdvanced: 'Avancé',
    planAdvancedBody: 'Un espace complet pour les participants expérimentés des marchés.',
    monthly: '/ mois',
    planFeatureBasics: 'Tableau de portefeuille',
    planFeatureMarkets: 'Aperçu des marchés',
    planFeatureWallet: 'Vue du portefeuille et activité',
    planFeatureAlerts: 'Listes de suivi et alertes de prix',
    planFeatureResearch: 'Outils de marché avancés',
    planFeaturePriority: 'Assistance prioritaire',
    planChoose: 'Choisir {plan}',
    popular: 'Le plus populaire',
    productLabel: 'Conçu pour votre façon de travailler',
    productTitle: 'Une vue plus connectée de vos actifs.',
    productBody: 'Passez des marchés à l’activité du portefeuille et aux analyses sans perdre de vue l’ensemble.',
    productMarkets: 'Explorer les marchés',
    productWallet: 'Gérer votre portefeuille',
    productPortfolio: 'Suivre votre portefeuille',
    productMarketsBody: 'Comparez les actifs pris en charge et consultez les variations de prix.',
    productWalletBody: 'Retrouvez soldes et activité récente au même endroit.',
    productPortfolioBody: 'Comprenez la composition de vos actifs dans son ensemble.',
    faqLabel: 'Vos questions, nos réponses',
    faqTitle: 'Quelques informations utiles.',
    faqOne: 'Qu’est-ce que CoinMaster ?',
    faqOneBody: 'CoinMaster est une plateforme d’actifs numériques conçue pour explorer les marchés, suivre un portefeuille et organiser l’activité de compte.',
    faqTwo: 'Comment créer un compte ?',
    faqTwoBody: 'Sélectionnez Commencer, choisissez votre région et votre langue, puis remplissez le formulaire avec votre adresse e-mail.',
    faqThree: 'Puis-je changer de langue ou de région ?',
    faqThreeBody: 'Oui. Utilisez les sélecteurs de l’en-tête. Vos choix sont enregistrés dans ce navigateur et votre région est reprise lors de l’inscription.',
    faqFour: 'Quels actifs puis-je explorer ?',
    faqFourBody: 'La plateforme présente notamment Bitcoin, Ethereum, Tether, USD Coin, Litecoin, BNB et Solana.',
    faqFive: 'Comment contacter l’assistance ?',
    faqFiveBody: 'Écrivez à support@coinmaster.app. Le délai de réponse habituel est d’un jour ouvré.',
    finalEyebrow: 'Votre prochaine décision commence ici',
    finalTitle: 'Clarifiez votre vision des marchés.',
    finalBody: 'Créez votre compte CoinMaster et découvrez une façon plus claire de suivre vos actifs numériques.',
    startExploring: 'Commencer aujourd’hui',
    footerDescription: 'Un espace pensé pour explorer les marchés numériques et suivre votre portefeuille.',
    footerPlatform: 'Plateforme',
    footerCompany: 'Entreprise',
    footerSupport: 'Assistance',
    footerAbout: 'À propos de CoinMaster',
    footerContact: 'Nous contacter',
    footerHelp: 'Centre d’aide',
    footerAvailability: 'Disponible à toute heure',
    copyright: '© 2026 CoinMaster. Tous droits réservés.',
    legalNote: 'Les marchés d’actifs numériques comportent des risques. Cet aperçu est fourni à titre informatif.',
    menuOpen: 'Ouvrir le menu de navigation',
    menuClose: 'Fermer le menu de navigation',
    languageLabel: 'Choisir la langue',
    regionLabel: 'Choisir la région',
    accountCreation: 'Commencer',
    scrollMore: 'Faire défiler pour découvrir',
  },
  es: {
    navMarkets: 'Mercados',
    navFeatures: 'Funciones',
    navPlans: 'Planes',
    navFaq: 'Preguntas',
    region: 'Región',
    language: 'Idioma',
    login: 'Iniciar sesión',
    getStarted: 'Comenzar',
    eyebrow: 'Una visión más clara de tu portafolio cripto',
    heroTitle: 'Da tu próximo paso',
    heroAccent: 'con confianza.',
    heroBody: 'Explora los mercados digitales, sigue tu portafolio y toma decisiones informadas con una plataforma diseñada para tenerlo todo a la vista.',
    createAccount: 'Crea tu cuenta',
    explorePlatform: 'Explorar la plataforma',
    heroNote: 'Un espacio completo para cada etapa de tu experiencia de trading.',
    activeMarkets: 'Mercados de un vistazo',
    marketOpen: 'Resumen del mercado',
    marketUpdated: 'Datos ilustrativos',
    portfolioPreview: 'Resumen del portafolio',
    totalBalance: 'Saldo total',
    weeklyReturn: 'Cambio semanal',
    sevenDayShort: '7 d',
    weekdays: ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'],
    allocation: 'Distribución de activos',
    portfolioLabel: 'Tu portafolio, en un solo lugar',
    statAssets: 'Activos digitales',
    statMarkets: 'Mercados seguidos',
    statSupport: 'Soporte disponible',
    statControl: 'Control del portafolio',
    platformLabel: 'La plataforma CoinMaster',
    featureTitle: 'Todo lo que necesitas para tener el control.',
    featureBody: 'Herramientas pensadas para reunir la actividad del mercado, tu cuenta y la información de tu portafolio.',
    featureMarkets: 'Análisis de mercado',
    featureMarketsBody: 'Sigue los movimientos de precios y explora los activos importantes para tu estrategia.',
    featurePortfolio: 'Resumen del portafolio',
    featurePortfolioBody: 'Consulta saldos, distribución y actividad de tu cuenta de forma clara.',
    featureTools: 'Espacio de trading',
    featureToolsBody: 'Previsualiza operaciones, compara activos y organiza tu próximo paso.',
    featureSecurity: 'Protección de cuenta',
    featureSecurityBody: 'El acceso privado y los controles claros te ayudan a mantener el control.',
    processLabel: 'Un comienzo sencillo',
    processTitle: 'De la primera mirada a decisiones informadas.',
    processBody: 'Tu cuenta te ofrece un espacio para explorar mercados y organizar la vista de tu portafolio.',
    stepOne: 'Crea tu cuenta',
    stepOneBody: 'Regístrate con tu correo y elige tu región e idioma.',
    stepTwo: 'Explora los mercados',
    stepTwoBody: 'Consulta activos, movimientos del mercado y herramientas disponibles.',
    stepThree: 'Organiza tu portafolio',
    stepThreeBody: 'Mantén saldos, listas de seguimiento y actividad a mano.',
    plansLabel: 'Cuentas para tus objetivos',
    plansTitle: 'Elige cómo quieres comenzar.',
    plansBody: 'Empieza con lo esencial y elige más herramientas según tu rutina.',
    planStarter: 'Inicial',
    planStarterBody: 'Una introducción sencilla a tu portafolio de activos digitales.',
    planActive: 'Activo',
    planActiveBody: 'Más herramientas para investigar mercados y seguir tu portafolio.',
    planAdvanced: 'Avanzado',
    planAdvancedBody: 'Un espacio completo para participantes con experiencia.',
    monthly: '/ mes',
    planFeatureBasics: 'Panel del portafolio',
    planFeatureMarkets: 'Resumen del mercado',
    planFeatureWallet: 'Vista de cartera y actividad',
    planFeatureAlerts: 'Listas y alertas de precios',
    planFeatureResearch: 'Herramientas de mercado ampliadas',
    planFeaturePriority: 'Soporte prioritario',
    planChoose: 'Elegir {plan}',
    popular: 'Más popular',
    productLabel: 'Diseñado para tu forma de trabajar',
    productTitle: 'Una visión conectada de tus activos.',
    productBody: 'Alterna entre mercados, actividad de cartera e información sin perder de vista el conjunto.',
    productMarkets: 'Explorar mercados',
    productWallet: 'Gestionar tu cartera',
    productPortfolio: 'Seguir tu portafolio',
    productMarketsBody: 'Compara activos disponibles y revisa sus movimientos de precio.',
    productWalletBody: 'Consulta saldos y actividad reciente en un solo lugar.',
    productPortfolioBody: 'Comprende cómo se distribuyen tus activos.',
    faqLabel: 'Resolvemos tus dudas',
    faqTitle: 'Algunas respuestas útiles.',
    faqOne: '¿Qué es CoinMaster?',
    faqOneBody: 'CoinMaster es una plataforma de activos digitales para explorar mercados, seguir un portafolio y organizar la actividad de la cuenta.',
    faqTwo: '¿Cómo creo una cuenta?',
    faqTwoBody: 'Selecciona Comenzar, elige tu región e idioma y completa el formulario con tu correo electrónico.',
    faqThree: '¿Puedo cambiar el idioma o la región?',
    faqThreeBody: 'Sí. Usa los selectores del encabezado. Tus opciones se guardan en este navegador y la región se conserva para el registro.',
    faqFour: '¿Qué activos puedo explorar?',
    faqFourBody: 'La plataforma muestra activos populares como Bitcoin, Ethereum, Tether, USD Coin, Litecoin, BNB y Solana.',
    faqFive: '¿Cómo contacto con soporte?',
    faqFiveBody: 'Escribe a support@coinmaster.app. El tiempo habitual de respuesta es de un día laborable.',
    finalEyebrow: 'Tu próximo paso comienza aquí',
    finalTitle: 'Enfoca tu visión del mercado.',
    finalBody: 'Crea tu cuenta CoinMaster y descubre una forma más clara de seguir tus activos digitales.',
    startExploring: 'Comienza hoy',
    footerDescription: 'Un espacio pensado para explorar mercados digitales y seguir tu portafolio.',
    footerPlatform: 'Plataforma',
    footerCompany: 'Empresa',
    footerSupport: 'Soporte',
    footerAbout: 'Acerca de CoinMaster',
    footerContact: 'Contáctanos',
    footerHelp: 'Centro de ayuda',
    footerAvailability: 'Disponible todo el día',
    copyright: '© 2026 CoinMaster. Todos los derechos reservados.',
    legalNote: 'Los mercados de activos digitales implican riesgos. Esta vista previa es informativa.',
    menuOpen: 'Abrir menú de navegación',
    menuClose: 'Cerrar menú de navegación',
    languageLabel: 'Elegir idioma',
    regionLabel: 'Elegir región',
    accountCreation: 'Comenzar',
    scrollMore: 'Desplázate para explorar',
  },
  pt: {
    navMarkets: 'Mercados',
    navFeatures: 'Recursos',
    navPlans: 'Planos',
    navFaq: 'Dúvidas',
    region: 'Região',
    language: 'Idioma',
    login: 'Entrar',
    getStarted: 'Começar',
    eyebrow: 'Uma visão mais clara do seu portfólio cripto',
    heroTitle: 'Faça seu próximo movimento',
    heroAccent: 'com confiança.',
    heroBody: 'Explore mercados digitais, acompanhe seu portfólio e tome decisões informadas em uma plataforma criada para manter tudo à vista.',
    createAccount: 'Criar sua conta',
    explorePlatform: 'Conhecer a plataforma',
    heroNote: 'Um espaço completo para cada etapa da sua jornada de trading.',
    activeMarkets: 'Mercados em destaque',
    marketOpen: 'Resumo do mercado',
    marketUpdated: 'Dados ilustrativos',
    portfolioPreview: 'Visão geral do portfólio',
    totalBalance: 'Saldo total',
    weeklyReturn: 'Variação semanal',
    sevenDayShort: '7 d',
    weekdays: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'],
    allocation: 'Alocação de ativos',
    portfolioLabel: 'Seu portfólio em um só lugar',
    statAssets: 'Ativos digitais',
    statMarkets: 'Mercados acompanhados',
    statSupport: 'Suporte disponível',
    statControl: 'Controle do portfólio',
    platformLabel: 'A plataforma CoinMaster',
    featureTitle: 'Tudo para você manter o controle.',
    featureBody: 'Ferramentas cuidadosamente reunidas para aproximar mercados, conta e informações do seu portfólio.',
    featureMarkets: 'Informações de mercado',
    featureMarketsBody: 'Acompanhe preços e explore os ativos importantes para sua estratégia.',
    featurePortfolio: 'Visão do portfólio',
    featurePortfolioBody: 'Consulte saldos, alocação e atividade da conta com clareza.',
    featureTools: 'Espaço de trading',
    featureToolsBody: 'Visualize operações, compare ativos e organize seus próximos passos.',
    featureSecurity: 'Proteção da conta',
    featureSecurityBody: 'Acesso privado e controles claros ajudam você a manter o controle.',
    processLabel: 'Um começo simples',
    processTitle: 'Da primeira visita a decisões informadas.',
    processBody: 'Sua conta oferece um ponto central para explorar mercados e acompanhar seu portfólio.',
    stepOne: 'Crie sua conta',
    stepOneBody: 'Cadastre seu e-mail e escolha sua região e idioma.',
    stepTwo: 'Explore os mercados',
    stepTwoBody: 'Confira ativos, movimentações e ferramentas disponíveis.',
    stepThree: 'Organize seu portfólio',
    stepThreeBody: 'Tenha saldos, listas de acompanhamento e atividades sempre à mão.',
    plansLabel: 'Contas para seus objetivos',
    plansTitle: 'Escolha como começar.',
    plansBody: 'Comece com o essencial e escolha mais recursos conforme sua rotina.',
    planStarter: 'Inicial',
    planStarterBody: 'Uma introdução simples ao seu portfólio de ativos digitais.',
    planActive: 'Ativo',
    planActiveBody: 'Mais ferramentas para pesquisar mercados e acompanhar seu portfólio.',
    planAdvanced: 'Avançado',
    planAdvancedBody: 'Um espaço completo para participantes experientes do mercado.',
    monthly: '/ mês',
    planFeatureBasics: 'Painel do portfólio',
    planFeatureMarkets: 'Visão geral do mercado',
    planFeatureWallet: 'Carteira e atividades',
    planFeatureAlerts: 'Listas e alertas de preço',
    planFeatureResearch: 'Ferramentas de mercado ampliadas',
    planFeaturePriority: 'Suporte prioritário',
    planChoose: 'Escolher {plan}',
    popular: 'Mais popular',
    productLabel: 'Feito para o seu fluxo de trabalho',
    productTitle: 'Uma visão conectada dos seus ativos.',
    productBody: 'Alterne entre mercados, atividade da carteira e informações sem perder o panorama geral.',
    productMarkets: 'Explorar mercados',
    productWallet: 'Gerenciar carteira',
    productPortfolio: 'Acompanhar portfólio',
    productMarketsBody: 'Compare ativos disponíveis e confira as variações de preço.',
    productWalletBody: 'Consulte saldos e atividades recentes em um só lugar.',
    productPortfolioBody: 'Entenda como seus ativos se distribuem.',
    faqLabel: 'Respondemos suas dúvidas',
    faqTitle: 'Algumas informações importantes.',
    faqOne: 'O que é a CoinMaster?',
    faqOneBody: 'A CoinMaster é uma plataforma de ativos digitais para explorar mercados, acompanhar um portfólio e organizar atividades da conta.',
    faqTwo: 'Como crio uma conta?',
    faqTwoBody: 'Selecione Começar, escolha sua região e idioma e continue com seu endereço de e-mail.',
    faqThree: 'Posso mudar o idioma ou a região?',
    faqThreeBody: 'Sim. Use os seletores no cabeçalho. Suas escolhas ficam salvas neste navegador e a região segue para o cadastro.',
    faqFour: 'Quais ativos posso explorar?',
    faqFourBody: 'A plataforma apresenta ativos populares como Bitcoin, Ethereum, Tether, USD Coin, Litecoin, BNB e Solana.',
    faqFive: 'Como entro em contato com o suporte?',
    faqFiveBody: 'Fale com nossa equipe em support@coinmaster.app. O prazo usual de resposta é de um dia útil.',
    finalEyebrow: 'Seu próximo passo começa aqui',
    finalTitle: 'Tenha uma visão mais clara do mercado.',
    finalBody: 'Crie sua conta CoinMaster e descubra uma forma mais clara de acompanhar seus ativos digitais.',
    startExploring: 'Comece hoje',
    footerDescription: 'Um espaço pensado para explorar mercados digitais e acompanhar seu portfólio.',
    footerPlatform: 'Plataforma',
    footerCompany: 'Empresa',
    footerSupport: 'Suporte',
    footerAbout: 'Sobre a CoinMaster',
    footerContact: 'Fale conosco',
    footerHelp: 'Central de ajuda',
    footerAvailability: 'Disponível a qualquer hora',
    copyright: '© 2026 CoinMaster. Todos os direitos reservados.',
    legalNote: 'Mercados de ativos digitais envolvem riscos. Esta prévia é informativa.',
    menuOpen: 'Abrir menu de navegação',
    menuClose: 'Fechar menu de navegação',
    languageLabel: 'Escolher idioma',
    regionLabel: 'Escolher região',
    accountCreation: 'Começar',
    scrollMore: 'Role para explorar',
  },
  de: {
    navMarkets: 'Märkte',
    navFeatures: 'Funktionen',
    navPlans: 'Tarife',
    navFaq: 'FAQ',
    region: 'Region',
    language: 'Sprache',
    login: 'Anmelden',
    getStarted: 'Jetzt starten',
    eyebrow: 'Ein klarerer Überblick über Ihr Krypto-Portfolio',
    heroTitle: 'Gehen Sie Ihren nächsten Schritt',
    heroAccent: 'mit Zuversicht.',
    heroBody: 'Entdecken Sie digitale Märkte, behalten Sie Ihr Portfolio im Blick und treffen Sie fundierte Entscheidungen – mit einer Plattform, die alles übersichtlich zusammenführt.',
    createAccount: 'Konto erstellen',
    explorePlatform: 'Plattform entdecken',
    heroNote: 'Ein leistungsstarker Arbeitsbereich für jeden Abschnitt Ihrer Trading-Reise.',
    activeMarkets: 'Märkte auf einen Blick',
    marketOpen: 'Marktüberblick',
    marketUpdated: 'Beispielhafte Marktdaten',
    portfolioPreview: 'Portfolioübersicht',
    totalBalance: 'Gesamtsaldo',
    weeklyReturn: 'Wochenveränderung',
    sevenDayShort: '7 T',
    weekdays: ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'],
    allocation: 'Vermögensaufteilung',
    portfolioLabel: 'Ihr Portfolio an einem Ort',
    statAssets: 'Digitale Assets',
    statMarkets: 'Beobachtete Märkte',
    statSupport: 'Support verfügbar',
    statControl: 'Portfolio-Kontrolle',
    platformLabel: 'Die CoinMaster-Plattform',
    featureTitle: 'Alles, um den Überblick zu behalten.',
    featureBody: 'Durchdachte Tools bündeln Marktaktivitäten, Kontoübersicht und Portfolio-Einblicke.',
    featureMarkets: 'Markteinblicke',
    featureMarketsBody: 'Verfolgen Sie Kursbewegungen und entdecken Sie relevante Assets für Ihre Strategie.',
    featurePortfolio: 'Portfolioübersicht',
    featurePortfolioBody: 'Behalten Sie Salden, Aufteilung und Kontoaktivitäten im Blick.',
    featureTools: 'Trading-Arbeitsbereich',
    featureToolsBody: 'Sehen Sie sich Trades an, vergleichen Sie Assets und planen Sie Ihre nächsten Schritte.',
    featureSecurity: 'Kontoschutz',
    featureSecurityBody: 'Privater Kontozugriff und klare Einstellungen geben Ihnen die Kontrolle.',
    processLabel: 'Ein einfacher Einstieg',
    processTitle: 'Vom ersten Überblick zu fundierten Entscheidungen.',
    processBody: 'Ihr Konto bietet einen zentralen Ort, um Märkte zu entdecken und Ihr Portfolio im Blick zu behalten.',
    stepOne: 'Konto erstellen',
    stepOneBody: 'Melden Sie sich mit Ihrer E-Mail an und wählen Sie Region und Sprache.',
    stepTwo: 'Märkte entdecken',
    stepTwoBody: 'Sehen Sie sich Assets, Marktbewegungen und verfügbare Tools an.',
    stepThree: 'Portfolio organisieren',
    stepThreeBody: 'Salden, Watchlists und Kontoaktivitäten bleiben griffbereit.',
    plansLabel: 'Konten passend zu Ihren Zielen',
    plansTitle: 'Wählen Sie Ihren Einstieg.',
    plansBody: 'Beginnen Sie mit den Grundlagen und erweitern Sie Ihren Arbeitsbereich nach Bedarf.',
    planStarter: 'Starter',
    planStarterBody: 'Ein unkomplizierter Einstieg in Ihr digitales Asset-Portfolio.',
    planActive: 'Aktiv',
    planActiveBody: 'Mehr Tools für regelmäßige Marktanalysen und Portfolio-Tracking.',
    planAdvanced: 'Erweitert',
    planAdvancedBody: 'Ein umfassender Arbeitsbereich für erfahrene Marktteilnehmer.',
    monthly: '/ Monat',
    planFeatureBasics: 'Portfolio-Dashboard',
    planFeatureMarkets: 'Marktübersicht',
    planFeatureWallet: 'Wallet- und Aktivitätsübersicht',
    planFeatureAlerts: 'Watchlists und Kursalarme',
    planFeatureResearch: 'Erweiterte Marktools',
    planFeaturePriority: 'Priorisierter Support',
    planChoose: '{plan} auswählen',
    popular: 'Am beliebtesten',
    productLabel: 'Für Ihren Arbeitsablauf entwickelt',
    productTitle: 'Ein vernetzter Blick auf Ihre Assets.',
    productBody: 'Wechseln Sie zwischen Märkten, Wallet-Aktivitäten und Einblicken, ohne den Überblick zu verlieren.',
    productMarkets: 'Märkte entdecken',
    productWallet: 'Wallet verwalten',
    productPortfolio: 'Portfolio verfolgen',
    productMarketsBody: 'Vergleichen Sie unterstützte Assets und prüfen Sie Kursbewegungen.',
    productWalletBody: 'Salden und aktuelle Kontoaktivitäten an einem Ort.',
    productPortfolioBody: 'Verstehen Sie die Zusammensetzung Ihrer Assets.',
    faqLabel: 'Ihre Fragen, unsere Antworten',
    faqTitle: 'Wissenswertes auf einen Blick.',
    faqOne: 'Was ist CoinMaster?',
    faqOneBody: 'CoinMaster ist eine Plattform für digitale Assets, mit der Sie Märkte erkunden, Ihr Portfolio verfolgen und Kontoaktivitäten organisieren können.',
    faqTwo: 'Wie erstelle ich ein Konto?',
    faqTwoBody: 'Wählen Sie Jetzt starten, legen Sie Region und Sprache fest und fahren Sie mit Ihrer E-Mail-Adresse fort.',
    faqThree: 'Kann ich Sprache oder Region ändern?',
    faqThreeBody: 'Ja. Nutzen Sie die Auswahl im Kopfbereich. Ihre Angaben werden in diesem Browser gespeichert und Ihre Region für die Registrierung übernommen.',
    faqFour: 'Welche Assets kann ich entdecken?',
    faqFourBody: 'Die Plattform zeigt beliebte digitale Assets wie Bitcoin, Ethereum, Tether, USD Coin, Litecoin, BNB und Solana.',
    faqFive: 'Wie erreiche ich den Support?',
    faqFiveBody: 'Unser Support ist unter support@coinmaster.app erreichbar. Die übliche Antwortzeit beträgt einen Werktag.',
    finalEyebrow: 'Ihr nächster Schritt beginnt hier',
    finalTitle: 'Behalten Sie die Märkte klar im Blick.',
    finalBody: 'Erstellen Sie Ihr CoinMaster-Konto und entdecken Sie eine übersichtliche Art, digitale Assets zu verfolgen.',
    startExploring: 'Heute starten',
    footerDescription: 'Ein durchdachter Arbeitsbereich für digitale Märkte und Ihr Portfolio.',
    footerPlatform: 'Plattform',
    footerCompany: 'Unternehmen',
    footerSupport: 'Support',
    footerAbout: 'Über CoinMaster',
    footerContact: 'Kontakt',
    footerHelp: 'Hilfe-Center',
    footerAvailability: 'Rund um die Uhr verfügbar',
    copyright: '© 2026 CoinMaster. Alle Rechte vorbehalten.',
    legalNote: 'Märkte für digitale Assets sind mit Risiken verbunden. Diese Vorschau dient nur zur Information.',
    menuOpen: 'Navigationsmenü öffnen',
    menuClose: 'Navigationsmenü schließen',
    languageLabel: 'Sprache auswählen',
    regionLabel: 'Region auswählen',
    accountCreation: 'Jetzt starten',
    scrollMore: 'Weiter scrollen',
  },
};

const marketPreview = [
  { ticker: 'BTC', name: 'Bitcoin', price: 67420.18, change: 2.84, width: '78%' },
  { ticker: 'ETH', name: 'Ethereum', price: 3482.65, change: 1.62, width: '58%' },
  { ticker: 'SOL', name: 'Solana', price: 184.32, change: 4.21, width: '88%' },
  { ticker: 'BNB', name: 'BNB', price: 592.17, change: -0.38, width: '36%' },
];

export const PLAN_OPTIONS = [
  {
    key: 'starter',
    price: PLAN_PRICES.starter,
    icon: Wallet,
    features: ['planFeatureBasics', 'planFeatureMarkets', 'planFeatureWallet'],
  },
  {
    key: 'active',
    price: PLAN_PRICES.active,
    icon: TrendingUp,
    features: ['planFeatureBasics', 'planFeatureMarkets', 'planFeatureWallet', 'planFeatureAlerts', 'planFeatureResearch'],
    popular: true,
  },
  {
    key: 'advanced',
    price: PLAN_PRICES.advanced,
    icon: Sparkles,
    features: ['planFeatureBasics', 'planFeatureMarkets', 'planFeatureWallet', 'planFeatureAlerts', 'planFeatureResearch', 'planFeaturePriority'],
  },
];

const faqs = [
  ['faqOne', 'faqOneBody'],
  ['faqTwo', 'faqTwoBody'],
  ['faqThree', 'faqThreeBody'],
  ['faqFour', 'faqFourBody'],
  ['faqFive', 'faqFiveBody'],
];

function RegionLanguageControls({
  country,
  language,
  onCountryChange,
  onLanguageChange,
  copy,
  compact = false,
}) {
  const controlClass = compact
    ? 'landing-locale-select landing-locale-select-compact'
    : 'landing-locale-select';

  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-wrap' : ''}`}>
      <label className="landing-locale-control">
        <Globe aria-hidden="true" size={14} />
        <span className="sr-only">{copy.regionLabel}</span>
        <select
          aria-label={copy.regionLabel}
          className={controlClass}
          value={country}
          onChange={(event) => onCountryChange(event.target.value)}
        >
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option} value={option}>{translateAppText(language, option)}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={13} />
      </label>
      <label className="landing-locale-control">
        <Languages aria-hidden="true" size={14} />
        <span className="sr-only">{copy.languageLabel}</span>
        <select
          aria-label={copy.languageLabel}
          className={controlClass}
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
        >
          {LANDING_LANGUAGES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={13} />
      </label>
    </div>
  );
}

export default function LandingPage({
  country,
  language,
  selectedPlan,
  onCountryChange,
  onLanguageChange,
  onLogin,
  onSignup,
  preferenceError,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const languageLocale = LANDING_LANGUAGES.find((item) => item.value === language)?.locale || 'en';
  const locale = resolveAppLocale(language, country);
  const copy = translations[languageLocale];
  const t = (key) => copy[key];
  const formatPercent = (value) =>
    `${value >= 0 ? '+' : ''}${formatNumber(Math.abs(value), locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%`;
  const beginSignup = (planKey) => {
    setMobileMenuOpen(false);
    onSignup(typeof planKey === 'string' ? planKey : undefined);
  };
  const beginLogin = () => {
    setMobileMenuOpen(false);
    onLogin();
  };

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const navLinks = [
    ['navMarkets', '#market-snapshot'],
    ['navFeatures', '#features'],
    ['navPlans', '#plans'],
    ['navFaq', '#faq'],
  ];

  return (
    <main className="landing-page min-h-screen overflow-hidden bg-[#080d18] text-white">
      <div className="landing-ambient landing-ambient-one" aria-hidden="true" />
      <div className="landing-ambient landing-ambient-two" aria-hidden="true" />

      <header className="landing-header sticky top-0 z-50 border-b border-white/[0.07]">
        <div className="mx-auto flex h-[76px] max-w-[1320px] items-center justify-between gap-5 px-5 sm:px-8 xl:px-10">
          <a href="#top" className="flex shrink-0 items-center gap-3" aria-label="CoinMaster home">
            <span className="landing-brand-mark">C</span>
            <span className="text-[17px] font-semibold tracking-[-0.04em]">
              Coin<span className="text-blue-300">Master</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="landing-nav-link">{t(label)}</a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <RegionLanguageControls
              country={country}
              language={language}
              onCountryChange={onCountryChange}
              onLanguageChange={onLanguageChange}
              copy={copy}
            />
            <span className="mx-1 h-7 w-px bg-white/10" aria-hidden="true" />
            <button type="button" onClick={beginLogin} className="landing-login-button">
              {t('login')}
            </button>
            <button type="button" onClick={beginSignup} className="landing-primary-button landing-primary-button-small">
              {t('getStarted')} <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="landing-mobile-toggle lg:hidden"
            aria-label={mobileMenuOpen ? t('menuClose') : t('menuOpen')}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="landing-mobile-navigation" className="landing-mobile-menu lg:hidden">
            <nav aria-label="Mobile navigation" className="grid gap-1">
              {navLinks.map(([label, href]) => (
                <a key={label} href={href} onClick={() => setMobileMenuOpen(false)} className="landing-mobile-link">
                  {t(label)} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              ))}
            </nav>
            <div className="my-4 border-t border-white/10" />
            <RegionLanguageControls
              country={country}
              language={language}
              onCountryChange={onCountryChange}
              onLanguageChange={onLanguageChange}
              copy={copy}
              compact
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={beginLogin} className="landing-login-button">
                {t('login')}
              </button>
              <button type="button" onClick={beginSignup} className="landing-primary-button landing-primary-button-small">
                {t('getStarted')} <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </header>

      <section id="top" className="landing-hero relative mx-auto grid max-w-[1320px] items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20 lg:min-h-[690px] lg:grid-cols-[0.94fr_1.06fr] lg:gap-8 lg:px-10 lg:pt-10">
        <div className="relative z-10 max-w-[610px]">
          <div className="landing-eyebrow"><span className="landing-eyebrow-dot" />{t('eyebrow')}</div>
          <h1 className="mt-7 text-[clamp(3.2rem,7vw,5.75rem)] font-semibold leading-[0.99] tracking-[-0.075em]">
            {t('heroTitle')}<br />
            <span className="landing-gradient-text">{t('heroAccent')}</span>
          </h1>
          <p className="mt-7 max-w-[520px] text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
            {t('heroBody')}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={beginSignup} className="landing-primary-button">
              {t('createAccount')} <ArrowRight size={17} aria-hidden="true" />
            </button>
            <a href="#features" className="landing-secondary-button">
              {t('explorePlatform')} <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="mt-8 flex items-center gap-3 text-xs text-slate-500">
            <span className="flex -space-x-2" aria-hidden="true">
              <span className="landing-avatar landing-avatar-blue">A</span>
              <span className="landing-avatar landing-avatar-violet">M</span>
              <span className="landing-avatar landing-avatar-mint">J</span>
            </span>
            <span>{t('heroNote')}</span>
          </div>
        </div>

        <div className="landing-hero-visual relative mx-auto w-full max-w-[650px]">
          <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
          <div className="landing-orbit landing-orbit-two" aria-hidden="true" />
          <div
            className="landing-hero-photo"
            role="img"
            aria-label={translateAppText(language, 'Trading platform on laptop')}
            style={{
              backgroundImage: 'linear-gradient(90deg, rgb(8 13 24 / 25%), rgb(8 13 24 / 60%)), url("https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=85")',
            }}
          />
          <div className="landing-dashboard-card relative z-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <span className="landing-live-dot" />
                  {t('portfolioPreview')}
                </div>
                <div className="mt-4 text-xs text-slate-500">{t('totalBalance')}</div>
                <div className="mt-1 text-[2rem] font-semibold tracking-[-0.055em] sm:text-[2.4rem]">
                  {formatCurrency(24680.4, 'USD', locale)}
                </div>
              </div>
              <div className="rounded-full border border-emerald-400/15 bg-emerald-300/[0.08] px-3 py-1.5 text-xs font-medium text-emerald-300">
                {formatPercent(8.42)} <span className="text-emerald-200/60">{t('sevenDayShort')}</span>
              </div>
            </div>

            <div className="landing-chart-wrap mt-6">
              <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>{t('portfolioLabel')}</span>
                <span>{t('weeklyReturn')}</span>
              </div>
              <svg className="landing-chart h-[170px] w-full sm:h-[205px]" viewBox="0 0 600 205" role="img" aria-label={`${t('portfolioPreview')} chart illustration`}>
                <defs>
                  <linearGradient id="landingChartFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#5c8cff" stopOpacity=".3" />
                    <stop offset="100%" stopColor="#5c8cff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="landingChartStroke" x1="0" x2="1">
                    <stop offset="0%" stopColor="#6b8fff" />
                    <stop offset="100%" stopColor="#4be0c1" />
                  </linearGradient>
                </defs>
                {[35, 80, 125, 170].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="rgba(148,163,184,.11)" strokeDasharray="4 7" />)}
                <path d="M0 158 C32 154 42 137 70 145 S112 135 137 142 S168 108 198 119 S239 132 259 108 S295 115 320 95 S353 109 377 88 S414 102 434 72 S469 93 492 68 S531 77 552 48 S579 61 600 31 V205 H0Z" fill="url(#landingChartFill)" />
                <path d="M0 158 C32 154 42 137 70 145 S112 135 137 142 S168 108 198 119 S239 132 259 108 S295 115 320 95 S353 109 377 88 S414 102 434 72 S469 93 492 68 S531 77 552 48 S579 61 600 31" fill="none" stroke="url(#landingChartStroke)" strokeWidth="3" strokeLinecap="round" />
                <circle cx="552" cy="48" r="5" fill="#58dfc4" />
                <circle cx="552" cy="48" r="11" fill="#58dfc4" opacity=".16" />
              </svg>
              <div className="mt-2 flex justify-between text-[10px] text-slate-600">
                {t('weekdays').map((day) => <span key={day}>{day}</span>)}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="landing-metric-tile">
                <div className="flex items-center gap-2 text-[11px] text-slate-500"><PieChart size={14} />{t('allocation')}</div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="landing-allocation-ring" aria-hidden="true"><span /></div>
                  <div className="text-xs leading-5 text-slate-400">BTC <b className="text-slate-200">48%</b><br />ETH <b className="text-slate-200">32%</b></div>
                </div>
              </div>
              <div className="landing-metric-tile flex flex-col justify-between">
                <div className="flex items-center gap-2 text-[11px] text-slate-500"><ShieldCheck size={14} />{t('statControl')}</div>
                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-400/10 text-blue-300"><LockKeyhole size={15} /></span>
                  CoinMaster
                  <Check size={14} className="ml-auto text-emerald-300" />
                </div>
              </div>
            </div>
          </div>
          <div className="landing-floating-chip landing-floating-chip-top"><span className="landing-chip-icon"><TrendingUp size={15} /></span><span><b>{formatPercent(12.8)}</b><small>{t('weeklyReturn')}</small></span></div>
          <div className="landing-floating-chip landing-floating-chip-bottom"><span className="landing-chip-icon landing-chip-icon-mint"><Zap size={15} /></span><span><b>{t('statMarkets')}</b><small>7 {t('statAssets').toLowerCase()}</small></span></div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1320px] px-5 pb-14 sm:px-8 lg:px-10">
        <div className="landing-stats-grid">
          {[
            ['7+', t('statAssets')],
            ['100+', t('statMarkets')],
            ['24/7', t('statSupport')],
            ['One view', t('statControl')],
          ].map(([value, label]) => (
            <div key={label} className="landing-stat">
              <div className="text-[1.65rem] font-semibold tracking-[-0.05em] text-white">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="market-snapshot" className="landing-section border-y border-white/[0.06] bg-[#0b1220]/80 py-20 sm:py-24">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="landing-section-kicker"><span className="landing-kicker-icon"><BarChart3 size={15} /></span>{t('activeMarkets')}</div>
              <h2 className="landing-section-title mt-4">{t('marketOpen')}</h2>
            </div>
            <span className="text-xs text-slate-500">{t('marketUpdated')}</span>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {marketPreview.map((asset) => (
              <article key={asset.ticker} className="landing-market-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`landing-coin-icon landing-coin-${asset.ticker.toLowerCase()}`}>{asset.ticker.slice(0, 1)}</span>
                    <div><h3 className="text-sm font-semibold text-slate-100">{asset.name}</h3><div className="mt-0.5 text-[11px] text-slate-500">{asset.ticker}</div></div>
                  </div>
                  <span className={asset.change >= 0 ? 'landing-positive' : 'landing-negative'}>
                    {formatPercent(asset.change)}
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div className="text-lg font-semibold tracking-tight text-slate-100">
                    {formatCurrency(asset.price, 'USD', locale)}
                  </div>
                  <div className="landing-sparkline" aria-hidden="true"><span style={{ width: asset.width }} /></div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="landing-section mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="landing-section-kicker justify-center">{t('platformLabel')}</div>
          <h2 className="landing-section-title mt-4">{t('featureTitle')}</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">{t('featureBody')}</p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [BarChart3, 'featureMarkets', 'featureMarketsBody', 'blue', 'photo-1460925895917-afdab827c52f'],
            [PieChart, 'featurePortfolio', 'featurePortfolioBody', 'mint', 'photo-1551288049-bebda4e38f71'],
            [Zap, 'featureTools', 'featureToolsBody', 'violet', 'photo-1516321318423-f06f85e504b3'],
            [ShieldCheck, 'featureSecurity', 'featureSecurityBody', 'amber', 'photo-1521737711867-e3b97375f902'],
          ].map(([Icon, title, body, color, photo]) => (
            <article key={title} className="landing-feature-card">
              <div
                className="landing-feature-photo"
                role="img"
                aria-label={translateAppText(
                  language,
                  title === 'featurePortfolio'
                    ? 'Professionals reviewing market charts'
                    : title === 'featureTools'
                      ? 'Trader using a smartphone'
                      : 'Trading workspace with market charts'
                )}
                style={{
                  backgroundImage: `linear-gradient(180deg, rgb(8 13 24 / 5%), rgb(8 13 24 / 38%)), url("https://images.unsplash.com/${photo}?auto=format&fit=crop&w=720&q=85")`,
                }}
              />
              <span className={`landing-feature-icon landing-feature-${color}`}><Icon size={20} /></span>
              <h3 className="mt-6 text-base font-semibold text-white">{t(title)}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{t(body)}</p>
              <ArrowUpRight size={16} className="mt-7 text-slate-600" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="landing-process-section border-y border-white/[0.06] py-24 sm:py-28">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-10">
          <div className="max-w-[470px]">
            <div className="landing-section-kicker">{t('processLabel')}</div>
            <h2 className="landing-section-title mt-4">{t('processTitle')}</h2>
            <p className="mt-5 text-sm leading-7 text-slate-400">{t('processBody')}</p>
            <button type="button" onClick={beginSignup} className="landing-text-link mt-7">
              {t('getStarted')} <ArrowRight size={16} />
            </button>
            <div
              className="landing-process-photo mt-8"
              role="img"
              aria-label={translateAppText(language, 'Trader using a smartphone')}
              style={{
                backgroundImage: 'linear-gradient(0deg, rgb(8 13 24 / 45%), rgb(8 13 24 / 4%)), url("https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=1000&q=85")',
              }}
            />
          </div>
          <div className="grid gap-3">
            {[
              [1, 'stepOne', 'stepOneBody', Wallet],
              [2, 'stepTwo', 'stepTwoBody', BarChart3],
              [3, 'stepThree', 'stepThreeBody', PieChart],
            ].map(([number, title, body, Icon]) => (
              <article key={number} className="landing-step-card">
                <span className="landing-step-number">0{number}</span>
                <span className="landing-step-icon"><Icon size={18} /></span>
                <div className="flex-1"><h3 className="text-sm font-semibold text-slate-100">{t(title)}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t(body)}</p></div>
                <ArrowUpRight size={16} className="text-slate-600" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="landing-section mx-auto max-w-[1320px] px-5 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="landing-section-kicker justify-center">{t('plansLabel')}</div>
          <h2 className="landing-section-title mt-4">{t('plansTitle')}</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">{t('plansBody')}</p>
        </div>
        <div className="mt-14 grid items-stretch gap-4 lg:grid-cols-3">
          {PLAN_OPTIONS.map((plan) => {
            const Icon = plan.icon;
            const title = t(`plan${plan.key[0].toUpperCase()}${plan.key.slice(1)}`);
            return (
              <article key={plan.key} className={`landing-plan-card ${plan.popular ? 'landing-plan-card-popular' : ''} ${selectedPlan === plan.key ? 'ring-2 ring-blue-400/60' : ''}`}>
                {plan.popular && <div className="landing-popular-tag"><Sparkles size={12} />{t('popular')}</div>}
                <span className="landing-feature-icon landing-feature-blue"><Icon size={19} /></span>
                <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-400">{t(`plan${plan.key[0].toUpperCase()}${plan.key.slice(1)}Body`)}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-[2.65rem] font-semibold tracking-[-0.07em] text-white">
                    {formatCurrency(plan.price, 'USD', locale, undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span className="text-xs text-slate-500">{t('monthly')}</span>
                </div>
                <button type="button" onClick={() => beginSignup(plan.key)} className={plan.popular ? 'landing-primary-button mt-6 w-full' : 'landing-plan-button mt-6 w-full'}>
                  {t('planChoose').replace('{plan}', title)} <ArrowRight size={15} />
                </button>
                <ul className="mt-7 space-y-3 border-t border-white/[0.08] pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-xs text-slate-400">
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-300" />{t(feature)}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-product-section border-y border-white/[0.06] py-24 sm:py-28">
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:px-10">
          <div className="max-w-[490px]">
            <div className="landing-section-kicker">{t('productLabel')}</div>
            <h2 className="landing-section-title mt-4">{t('productTitle')}</h2>
            <p className="mt-5 text-sm leading-7 text-slate-400">{t('productBody')}</p>
            <div className="mt-8 space-y-4">
              {[
                ['productMarkets', 'productMarketsBody', BarChart3],
                ['productWallet', 'productWalletBody', Wallet],
                ['productPortfolio', 'productPortfolioBody', PieChart],
              ].map(([title, body, Icon]) => (
                <div key={title} className="flex gap-3">
                  <span className="landing-mini-icon"><Icon size={16} /></span>
                  <div><h3 className="text-sm font-medium text-slate-200">{t(title)}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{t(body)}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="landing-product-showcase">
            <div
              className="landing-product-photo"
              role="img"
              aria-label={translateAppText(language, 'Professionals reviewing market charts')}
              style={{
                backgroundImage: 'linear-gradient(0deg, rgb(8 13 24 / 50%), rgb(8 13 24 / 5%)), url("https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85")',
              }}
            />
            <div className="landing-product-preview">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2"><span className="landing-brand-mark landing-brand-mark-small">C</span><span className="text-xs font-semibold">CoinMaster</span></div>
              <span className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] text-slate-400">{t('portfolioPreview')}</span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr_0.8fr] sm:p-7">
              <div className="landing-preview-panel">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-400">{t('totalBalance')}</span><span className="text-[10px] text-emerald-300">{formatPercent(8.42)}</span></div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">
                  {formatCurrency(24680.4, 'USD', locale)}
                </div>
                <svg className="landing-preview-chart mt-4 h-[140px] w-full" viewBox="0 0 400 140" aria-hidden="true">
                  <path d="M0 116 C24 105 35 112 57 94 S91 105 112 76 S151 88 171 70 S204 82 227 53 S258 65 278 47 S314 61 335 28 S374 39 400 15 V140 H0Z" fill="url(#previewFill)" />
                  <defs><linearGradient id="previewFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#548bff" stopOpacity=".25" /><stop offset="1" stopColor="#548bff" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 116 C24 105 35 112 57 94 S91 105 112 76 S151 88 171 70 S204 82 227 53 S258 65 278 47 S314 61 335 28 S374 39 400 15" fill="none" stroke="#6b9cff" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="landing-preview-assets">
                <div className="mb-3 text-xs text-slate-400">{t('statAssets')}</div>
                {marketPreview.slice(0, 3).map((asset) => (
                  <div key={asset.ticker} className="flex items-center gap-2.5 border-b border-white/[0.06] py-3 last:border-0">
                    <span className={`landing-coin-icon landing-coin-icon-small landing-coin-${asset.ticker.toLowerCase()}`}>{asset.ticker.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1"><div className="text-[11px] font-medium text-slate-200">{asset.ticker}</div><div className="text-[9px] text-slate-500">{asset.name}</div></div>
                    <span className={`text-[9px] ${asset.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {formatPercent(asset.change)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-white/[0.08]">
              {['productMarkets', 'productWallet', 'productPortfolio'].map((label, index) => (
                <div key={label} className={`py-3 text-center text-[10px] ${index === 0 ? 'text-blue-300' : 'text-slate-500'}`}>
                  {t(label)}
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="landing-section mx-auto max-w-[900px] px-5 py-24 sm:px-8 sm:py-28">
        <div className="text-center">
          <div className="landing-section-kicker justify-center"><CircleHelp size={15} />{t('faqLabel')}</div>
          <h2 className="landing-section-title mt-4">{t('faqTitle')}</h2>
        </div>
        <div className="mt-10 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {faqs.map(([question, answer], index) => (
            <article key={question} className="py-1">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-medium text-slate-200"
                aria-expanded={openFaq === index}
                aria-controls={`landing-faq-answer-${index}`}
                onClick={() => setOpenFaq((current) => current === index ? -1 : index)}
              >
                {t(question)}
                <ChevronDown size={17} className={`shrink-0 text-slate-500 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === index && (
                <p id={`landing-faq-answer-${index}`} className="max-w-[760px] pb-5 pr-8 text-sm leading-6 text-slate-400">
                  {t(answer)}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
        <div className="landing-final-cta mx-auto max-w-[1240px] overflow-hidden rounded-[28px] px-6 py-14 text-center sm:px-12 sm:py-16">
          <div className="landing-section-kicker justify-center"><Sparkles size={14} />{t('finalEyebrow')}</div>
          <h2 className="mx-auto mt-5 max-w-[760px] text-3xl font-semibold leading-tight tracking-[-0.055em] text-white sm:text-5xl">{t('finalTitle')}</h2>
          <p className="mx-auto mt-4 max-w-[600px] text-sm leading-6 text-slate-400 sm:text-base">{t('finalBody')}</p>
          <button type="button" onClick={beginSignup} className="landing-primary-button mx-auto mt-8">
            {t('startExploring')} <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <footer className="landing-footer border-t border-white/[0.08]">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-10">
          <div className="max-w-[300px]">
            <a href="#top" className="inline-flex items-center gap-3" aria-label="CoinMaster home">
              <span className="landing-brand-mark">C</span>
              <span className="text-[17px] font-semibold tracking-[-0.04em]">Coin<span className="text-blue-300">Master</span></span>
            </a>
            <p className="mt-4 text-xs leading-6 text-slate-500">{t('footerDescription')}</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><span className="landing-live-dot" />{t('footerAvailability')}</div>
          </div>
          <div><h2 className="text-xs font-semibold text-slate-200">{t('footerPlatform')}</h2><div className="mt-4 grid gap-3">{navLinks.slice(0, 3).map(([label, href]) => <a key={label} href={href} className="landing-footer-link">{t(label)}</a>)}</div></div>
          <div><h2 className="text-xs font-semibold text-slate-200">{t('footerCompany')}</h2><div className="mt-4 grid gap-3"><a href="#features" className="landing-footer-link">{t('footerAbout')}</a><a href="#plans" className="landing-footer-link">{t('navPlans')}</a><a href="#faq" className="landing-footer-link">{t('navFaq')}</a></div></div>
          <div><h2 className="text-xs font-semibold text-slate-200">{t('footerSupport')}</h2><div className="mt-4 grid gap-3"><a href="mailto:support@coinmaster.app" className="landing-footer-link">{t('footerContact')}</a><a href="#faq" className="landing-footer-link">{t('footerHelp')}</a><a href="mailto:support@coinmaster.app" className="landing-footer-link">support@coinmaster.app</a></div></div>
        </div>
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 border-t border-white/[0.06] px-5 py-5 text-[10px] text-slate-600 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <span>{t('copyright')}</span>
          <span>{t('legalNote')}</span>
        </div>
      </footer>

      <EarningNotificationPopup language={language} />

      {preferenceError && (
        <p className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-xl rounded-xl border border-amber-300/20 bg-[#111827] px-4 py-3 text-xs text-amber-100 shadow-xl" role="status">
          {preferenceError}
        </p>
      )}
    </main>
  );
}
