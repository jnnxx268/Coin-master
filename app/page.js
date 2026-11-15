"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Wallet,
  BarChart3,
  LineChart,
  TrendingUp,
  Pickaxe,
  Star,
  History,
  PieChart,
  HelpCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Bell,
  ShieldAlert,
  Globe,
  Languages,
  CheckCircle2,
  ChevronDown,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import LandingPage, {
  COUNTRY_OPTIONS,
  LANDING_LANGUAGES,
} from "./landing-page";
import { translateAppText } from "./app-translations";
import useAccessibleDialog from "./use-accessible-dialog";
import {
  PLAN_PRICES,
  createPlanSelectionStore,
  buildSignupMetadata,
  buildTransactionCursorFilter,
  filterTransactionsByType,
  formatAssetAmount as formatAssetAmountValue,
  formatCurrency as formatCurrencyValue,
  formatDate as formatDateValue,
  formatDateTime as formatDateTimeValue,
  formatFinancialAmount as formatFinancialAmountValue,
  formatNumber,
  getAuthenticationErrorMessage,
  getConversionEstimate,
  getDepositFeeDetails,
  getWithdrawalFeeDetails,
  getPasswordRecoveryFailureKind,
  getTransactionPageResult,
  getTransactionStatusPresentation,
  resolveAppLocale,
} from "./product-utils.mjs";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "GHS", "NGN"];
const DISPLAY_CURRENCY_STORAGE_KEY = "coinmaster.display-currency";
const WATCHLIST_STORAGE_KEY = "coinmaster.watchlist-alerts";
const ACTIVE_TAB_STORAGE_KEY = "coinmaster.active-tab";
const LANDING_PREFERENCES_STORAGE_KEY = "coinmaster.landing-preferences";
const SELECTED_PLAN_STORAGE_KEY = "coinmaster.selected-plan";
const TRANSACTION_PAGE_SIZE = 20;
const KNOWN_TRANSACTION_TYPES = [
  "admin_credit",
  "admin_transfer_received",
  "admin_transfer_sent",
  "transfer_received",
  "transfer_sent",
];
const SUPPORT_CATEGORIES = [
  "account",
  "wallet",
  "transaction",
  "security",
  "other",
];
const WITHDRAWAL_NETWORKS = {
  BTC: ["Bitcoin"],
  ETH: ["Ethereum (ERC20)"],
  USDT: ["TRON (TRC20)", "Ethereum (ERC20)"],
  USDC: ["Ethereum (ERC20)", "Solana"],
  LTC: ["Litecoin"],
  BNB: ["BNB Smart Chain (BEP20)"],
  SOL: ["Solana"],
};
const DEFAULT_LANDING_PREFERENCES = JSON.stringify({
  country: "Nigeria",
  language: "English",
});
let landingPreferencesSnapshot = DEFAULT_LANDING_PREFERENCES;
let landingPreferencesInitialized = false;
const landingPreferencesListeners = new Set();
const selectedPlanStore = createPlanSelectionStore(
  {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  },
  SELECTED_PLAN_STORAGE_KEY,
);

const getLandingPreferencesSnapshot = () => {
  if (!landingPreferencesInitialized) {
    try {
      const savedPreferences = globalThis.localStorage.getItem(
        LANDING_PREFERENCES_STORAGE_KEY,
      );
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        landingPreferencesSnapshot = JSON.stringify({
          country: COUNTRY_OPTIONS.includes(preferences.country)
            ? preferences.country
            : "Nigeria",
          language: LANDING_LANGUAGES.some(
            (language) => language.value === preferences.language,
          )
            ? preferences.language
            : "English",
        });
      }
    } catch (err) {
      console.error("Landing preferences read error:", err);
      landingPreferencesSnapshot = DEFAULT_LANDING_PREFERENCES;
    }
    landingPreferencesInitialized = true;
  }
  return landingPreferencesSnapshot;
};

const subscribeToLandingPreferences = (listener) => {
  landingPreferencesListeners.add(listener);
  const handleStorage = (event) => {
    if (event.key !== LANDING_PREFERENCES_STORAGE_KEY) return;
    landingPreferencesInitialized = false;
    getLandingPreferencesSnapshot();
    landingPreferencesListeners.forEach((notify) => notify());
  };
  globalThis.addEventListener("storage", handleStorage);
  return () => {
    landingPreferencesListeners.delete(listener);
    globalThis.removeEventListener("storage", handleStorage);
  };
};

const saveLandingPreferences = (country, language) => {
  landingPreferencesSnapshot = JSON.stringify({ country, language });
  landingPreferencesInitialized = true;
  landingPreferencesListeners.forEach((listener) => listener());
  globalThis.localStorage.setItem(
    LANDING_PREFERENCES_STORAGE_KEY,
    landingPreferencesSnapshot,
  );
};
const APP_SECTION_IDS = [
  "dashboard",
  "wallet",
  "markets",
  "trade",
  "transaction-history",
  "investments",
  "mining",
  "watchlist",
  "portfolio",
  "support",
  "backend",
];
const PRICE_REFRESH_INTERVAL_MS = 60_000;
const COINGECKO_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const PRICED_CRYPTO_ASSETS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "solana", symbol: "SOL", name: "Solana" },
];

const renderTransactionStatusBadge = (status, translate) => {
  const presentation = getTransactionStatusPresentation(status);
  return (
    <span className={presentation.className}>
      {translate(presentation.label)}
    </span>
  );
};

const getCryptoPrice = (prices, assetSymbol, currency) => {
  const asset = PRICED_CRYPTO_ASSETS.find(
    (pricedAsset) => pricedAsset.symbol === assetSymbol,
  );

  return asset ? prices[asset.id]?.[currency]?.price : undefined;
};

const requireSupabaseClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured for this application.");
  }

  return supabase;
};

const getWatchlistLoadErrorMessage = (error, hasBrowserSettings) => {
  const suffix = hasBrowserSettings
    ? " Browser-saved settings are shown and were not changed."
    : " Any browser-saved settings were preserved.";
  const code = error?.code;
  const status = error?.status;

  if (!supabase) {
    return `Account settings are unavailable because the Supabase connection is not configured.${suffix}`;
  }
  if (code === "42P01" || code === "PGRST205" || status === 404) {
    return `Account settings could not be found. Confirm the watchlist migration is applied to the configured Supabase project.${suffix}`;
  }
  if (code === "42501" || status === 401 || status === 403) {
    return `Supabase denied access to account settings. Check the authenticated role grants and owner-scoped RLS policies.${suffix}`;
  }
  if (
    error instanceof TypeError ||
    /fetch|network/i.test(error?.message || "")
  ) {
    return `Could not connect to account settings. Check the Supabase URL and network connection, then retry.${suffix}`;
  }

  return `Could not load account settings. Check the Supabase connection, watchlist migration, and access policies, then retry.${suffix}`;
};

const parseWatchlistPreferences = (preferences) => {
  if (
    !preferences ||
    !Array.isArray(preferences.watchlist) ||
    !Array.isArray(preferences.alerts) ||
    preferences.watchlist.some(
      (symbol) =>
        !PRICED_CRYPTO_ASSETS.some((asset) => asset.symbol === symbol),
    ) ||
    preferences.alerts.some(
      (alert) =>
        !alert ||
        typeof alert.id !== "string" ||
        !PRICED_CRYPTO_ASSETS.some((asset) => asset.symbol === alert.symbol) ||
        !["above", "below"].includes(alert.condition) ||
        !DISPLAY_CURRENCIES.includes(alert.currency) ||
        typeof alert.threshold !== "number" ||
        !Number.isFinite(alert.threshold) ||
        alert.threshold <= 0 ||
        !(
          alert.triggeredAt === null || typeof alert.triggeredAt === "string"
        ) ||
        !(
          alert.triggeredPrice === null ||
          (typeof alert.triggeredPrice === "number" &&
            Number.isFinite(alert.triggeredPrice))
        ),
    )
  ) {
    throw new Error("Saved watchlist or price alert data is invalid.");
  }

  return {
    watchlist: [...new Set(preferences.watchlist)],
    alerts: preferences.alerts,
  };
};

const loadLegacyWatchlistPreferences = (userId) => {
  const storedPreferences = globalThis.localStorage.getItem(
    `${WATCHLIST_STORAGE_KEY}.${userId}`,
  );
  if (storedPreferences === null) return null;

  return parseWatchlistPreferences(JSON.parse(storedPreferences));
};

const saveWatchlistPreferencesToSupabase = async (userId, preferences) => {
  const client = requireSupabaseClient();
  const { error } = await client.from("user_watchlist_preferences").upsert(
    {
      user_id: userId,
      watchlist: preferences.watchlist,
      price_alerts: preferences.alerts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
};

const loadWatchlistPreferencesFromSupabase = async (userId) => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("user_watchlist_preferences")
    .select("watchlist, price_alerts")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return parseWatchlistPreferences({
      watchlist: data.watchlist,
      alerts: data.price_alerts,
    });
  }

  const legacyPreferences = loadLegacyWatchlistPreferences(userId);
  if (!legacyPreferences) {
    return { watchlist: [], alerts: [] };
  }

  const { error: insertError } = await client
    .from("user_watchlist_preferences")
    .insert({
      user_id: userId,
      watchlist: legacyPreferences.watchlist,
      price_alerts: legacyPreferences.alerts,
    });

  if (!insertError) return legacyPreferences;

  if (insertError.code === "23505") {
    const { data: racedData, error: racedReadError } = await client
      .from("user_watchlist_preferences")
      .select("watchlist, price_alerts")
      .eq("user_id", userId)
      .maybeSingle();

    if (!racedReadError && racedData) {
      return parseWatchlistPreferences({
        watchlist: racedData.watchlist,
        alerts: racedData.price_alerts,
      });
    }
    if (racedReadError) throw racedReadError;
  }

  throw insertError;
};

const loadWalletBalances = async (userId) => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("wallet_balances")
    .select("asset, balance, updated_at")
    .eq("user_id", userId)
    .order("asset", { ascending: true });

  if (error) throw error;

  return data || [];
};

const loadTransactionPage = async (
  userId,
  cursor = null,
  typeFilter = "all",
) => {
  let query = requireSupabaseClient()
    .from("transactions")
    .select(
      "id, user_id, type, amount, currency, status, created_at, gross_amount, fee_amount, net_amount",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(TRANSACTION_PAGE_SIZE + 1);

  if (typeFilter !== "all") {
    query = query.eq("type", typeFilter);
  }

  if (cursor) {
    query = query.or(buildTransactionCursorFilter(cursor));
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error, hasMore: false, nextCursor: null };
  }

  const page = getTransactionPageResult(data || [], TRANSACTION_PAGE_SIZE);
  return {
    ...page,
    error: null,
  };
};

const loadAccountActivity = async (userId, typeFilter = "all") => {
  const client = requireSupabaseClient();
  const [transactionsResult, notificationsResult] = await Promise.all([
    loadTransactionPage(userId, null, typeFilter),
    client
      .from("notifications")
      .select("id, user_id, title, message, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return { transactionsResult, notificationsResult };
};

const fingerprintTransferPayload = async (payload) => {
  if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) {
    throw new Error("Secure browser cryptography is unavailable.");
  }

  const encodedPayload = new globalThis.TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encodedPayload,
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export default function CoinMasterApp() {
  // Onboarding & Auth Flow States
  // Steps: 'landing' -> 'country-lang' -> 'auth' -> 'app'
  const [onboardingStage, setOnboardingStage] = useState("landing");
  const landingPreferencesJson = useSyncExternalStore(
    subscribeToLandingPreferences,
    getLandingPreferencesSnapshot,
    () => DEFAULT_LANDING_PREFERENCES,
  );
  const { country: selectedCountry, language: selectedLanguage } = JSON.parse(
    landingPreferencesJson,
  );
  const tx = (text) => translateAppText(selectedLanguage, text);
  const selectedPlan = useSyncExternalStore(
    selectedPlanStore.subscribe,
    selectedPlanStore.getSnapshot,
    () => null,
  );
  const appLocale = resolveAppLocale(selectedLanguage, selectedCountry);
  const formatCurrency = (value, currency) =>
    formatCurrencyValue(value, currency, appLocale, tx("Price unavailable"));
  const formatAssetAmount = (value) => formatAssetAmountValue(value, appLocale);
  const formatFinancialAmount = (value) =>
    formatFinancialAmountValue(value, appLocale);
  const formatTransactionAmount = (transaction) =>
    ["deposit", "withdrawal"].includes(transaction.type)
      ? formatFinancialAmount(transaction.amount)
      : formatAssetAmount(transaction.amount);
  const formatDate = (value) =>
    formatDateValue(value, appLocale) || tx("Date unavailable");
  const formatDateTime = (value) =>
    formatDateTimeValue(value, appLocale) || tx("Date unavailable");
  const [landingPreferenceError, setLandingPreferenceError] = useState("");
  const [authMode, setAuthMode] = useState("login"); // 'login' or 'signup'
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirmation, setAuthPasswordConfirmation] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);

  // Supabase User Session State
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [authSessionError, setAuthSessionError] = useState("");
  const currentUserIdRef = useRef(null);
  const transactionPageRequestVersionRef = useRef(0);
  const authEventVersionRef = useRef(0);
  const authMountedRef = useRef(false);

  // App Navigation & UI States
  const [activeTab, setActiveTab] = useState("dashboard");
  const [navigationPreferenceError, setNavigationPreferenceError] =
    useState("");
  const [walletSubTab, setWalletSubTab] = useState("deposit");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileNavigationRef = useRef(null);
  const withdrawalDialogRef = useRef(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Database Data States
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);
  const [transactionsHaveMore, setTransactionsHaveMore] = useState(false);
  const [transactionCursor, setTransactionCursor] = useState(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState("");
  const [transactionsMoreError, setTransactionsMoreError] = useState("");
  const [notificationsError, setNotificationsError] = useState("");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");
  const [expandedTransactionId, setExpandedTransactionId] = useState(null);
  const [supportRequests, setSupportRequests] = useState([]);
  const [supportRequestsLoading, setSupportRequestsLoading] = useState(false);
  const [supportRequestsError, setSupportRequestsError] = useState("");
  const [supportRequestsRetryKey, setSupportRequestsRetryKey] = useState(0);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportCategory, setSupportCategory] = useState("account");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState("");
  const [supportError, setSupportError] = useState("");
  const [depositAsset, setDepositAsset] = useState("BTC");
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  // Wallet balances are loaded for the signed-in user from Supabase.
  const [walletBalances, setWalletBalances] = useState([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const currencyPreferenceLoadedRef = useRef(false);
  const [currencyPreferenceError, setCurrencyPreferenceError] = useState("");
  const [priceRefreshKey, setPriceRefreshKey] = useState(0);
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [alertAssetSymbol, setAlertAssetSymbol] = useState("BTC");
  const [alertCondition, setAlertCondition] = useState("above");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [watchlistError, setWatchlistError] = useState("");
  const [watchlistUsingBrowserFallback, setWatchlistUsingBrowserFallback] =
    useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistSaving, setWatchlistSaving] = useState(false);
  const [watchlistSavePending, setWatchlistSavePending] = useState(false);
  const [watchlistRetryKey, setWatchlistRetryKey] = useState(0);
  const [watchlistOwnerId, setWatchlistOwnerId] = useState(null);
  const watchlistLoadRequestRef = useRef(0);
  const watchlistOwnerRef = useRef(null);
  const watchlistSavingRef = useRef(false);
  const watchlistSavingOwnerRef = useRef(null);
  const pendingWatchlistSaveRef = useRef(null);
  const watchlistSymbolsRef = useRef([]);
  const priceAlertsRef = useRef([]);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferAsset, setTransferAsset] = useState("USDT");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const transferInFlightRef = useRef(false);
  const [walletIdCopied, setWalletIdCopied] = useState(false);
  const [walletIdCopyMessage, setWalletIdCopyMessage] = useState("");
  const [adminCreditLookupBy, setAdminCreditLookupBy] = useState("email");
  const [adminCreditIdentifier, setAdminCreditIdentifier] = useState("");
  const [adminCreditRecipient, setAdminCreditRecipient] = useState(null);
  const [adminCreditConfirmed, setAdminCreditConfirmed] = useState(false);
  const [adminCreditAsset, setAdminCreditAsset] = useState("USDT");
  const [adminCreditAmount, setAdminCreditAmount] = useState("");
  const [adminCreditLoading, setAdminCreditLoading] = useState(false);
  const [adminCreditMessage, setAdminCreditMessage] = useState("");
  const adminCreditInFlightRef = useRef(false);

  // Trade preview state; no order execution is connected.
  const [tradeAction, setTradeAction] = useState("buy");
  const [selectedAsset, setSelectedAsset] = useState({
    symbol: "BTC",
    name: "Bitcoin",
  });
  const [selectedDestinationAsset, setSelectedDestinationAsset] = useState({
    symbol: "ETH",
    name: "Ethereum",
  });
  const [tradeAmount, setTradeAmount] = useState("");
  const [hideChart, setHideChart] = useState(false);

  // Deposits are credited by internal admins after request review.
  const [depositStep, setDepositStep] = useState(1);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositValidationError, setDepositValidationError] = useState("");

  // Withdrawal requests are atomically reserved by the authenticated backend RPC.
  const [withdrawStep, setWithdrawStep] = useState(1);
  const [withdrawMethod, setWithdrawMethod] = useState("");
  const [withdrawNetwork, setWithdrawNetwork] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawValidationError, setWithdrawValidationError] = useState("");
  const [withdrawErrorModal, setWithdrawErrorModal] = useState(false);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const withdrawInFlightRef = useRef(false);
  const [backendSection, setBackendSection] = useState("overview");
  const [backendRequests, setBackendRequests] = useState([]);
  const [backendHistory, setBackendHistory] = useState([]);
  const [backendOverview, setBackendOverview] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [backendRequestKind, setBackendRequestKind] = useState("all");
  const [backendStatusFilter, setBackendStatusFilter] = useState("all");
  const [backendSearch, setBackendSearch] = useState("");
  const [backendHasMore, setBackendHasMore] = useState(false);
  const [backendOffset, setBackendOffset] = useState(0);
  const [backendRefreshKey, setBackendRefreshKey] = useState(0);
  const [backendBusyRequestId, setBackendBusyRequestId] = useState(null);
  const [backendActionMessage, setBackendActionMessage] = useState("");
  const [backendDeclineId, setBackendDeclineId] = useState(null);
  const [backendDeclineReason, setBackendDeclineReason] = useState("");
  const backendRequestVersionRef = useRef(0);
  useAccessibleDialog(mobileMenuOpen, mobileNavigationRef, () =>
    setMobileMenuOpen(false),
  );
  useAccessibleDialog(withdrawErrorModal, withdrawalDialogRef, () =>
    setWithdrawErrorModal(false),
  );
  const isAdmin =
    user?.app_metadata?.admin === true || user?.app_metadata?.admin === "true";

  const updateLandingPreference = (key, value) => {
    try {
      saveLandingPreferences(
        key === "country" ? value : selectedCountry,
        key === "language" ? value : selectedLanguage,
      );
      setLandingPreferenceError("");
    } catch (err) {
      console.error("Landing preferences save error:", err);
      setLandingPreferenceError(
        "Your selection applies for this visit but could not be saved.",
      );
    }
  };

  useEffect(() => {
    globalThis.document.documentElement.lang = appLocale;
  }, [appLocale]);

  useEffect(() => {
    const failureKind = getPasswordRecoveryFailureKind(
      globalThis.location.href,
    );
    if (!failureKind) return undefined;

    const timer = globalThis.setTimeout(() => {
      setAuthMode("reset");
      setOnboardingStage("auth");
      setAuthError(
        failureKind === "expired"
          ? "This link is invalid or has expired. Request a new link and try again."
          : "This password reset link could not be verified. Request a new link and try again.",
      );
      setAuthSuccess("");
      setCanResendConfirmation(false);
    }, 0);

    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;

    const controller = new AbortController();
    let active = true;
    let requestInFlight = false;

    const fetchPrices = async () => {
      if (requestInFlight) return;

      requestInFlight = true;
      setPriceLoading(true);
      setPriceError("");

      const params = new URLSearchParams({
        ids: PRICED_CRYPTO_ASSETS.map((asset) => asset.id).join(","),
        vs_currencies: DISPLAY_CURRENCIES.map((currency) =>
          currency.toLowerCase(),
        ).join(","),
        include_24hr_change: "true",
      });

      try {
        const response = await fetch(
          `${COINGECKO_PRICE_URL}?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Public price request failed (${response.status}).`);
        }

        const responseData = await response.json();
        const nextPrices = {};

        for (const asset of PRICED_CRYPTO_ASSETS) {
          const assetData = responseData[asset.id];
          if (!assetData) {
            throw new Error(`Public price response omitted ${asset.symbol}.`);
          }

          const pricesByCurrency = {};
          for (const currency of DISPLAY_CURRENCIES) {
            const currencyKey = currency.toLowerCase();
            const price = assetData[currencyKey];
            const change = assetData[`${currencyKey}_24h_change`];

            if (
              typeof price !== "number" ||
              !Number.isFinite(price) ||
              price <= 0
            ) {
              throw new Error(
                `Public price response included an invalid ${asset.symbol} price.`,
              );
            }

            pricesByCurrency[currency] = {
              price,
              change:
                typeof change === "number" && Number.isFinite(change)
                  ? change
                  : null,
            };
          }

          nextPrices[asset.id] = pricesByCurrency;
        }

        if (active && currentUserIdRef.current === user.id) {
          setCryptoPrices(nextPrices);
          setPricesUpdatedAt(new Date());
          setPriceError("");
          const checkedAt = new Date().toISOString();
          if (
            watchlistOwnerRef.current === user.id &&
            !watchlistSavingRef.current &&
            !pendingWatchlistSaveRef.current
          ) {
            let alertsChanged = false;
            const nextAlerts = priceAlertsRef.current.map((alert) => {
              if (alert.triggeredAt) return alert;

              const price = getCryptoPrice(
                nextPrices,
                alert.symbol,
                alert.currency,
              );
              const triggered =
                Number.isFinite(price) &&
                ((alert.condition === "above" && price >= alert.threshold) ||
                  (alert.condition === "below" && price <= alert.threshold));

              if (!triggered) return alert;

              alertsChanged = true;
              return {
                ...alert,
                triggeredAt: checkedAt,
                triggeredPrice: price,
              };
            });

            if (alertsChanged) {
              watchlistSavingRef.current = true;
              watchlistSavingOwnerRef.current = user.id;
              setWatchlistSaving(true);
              try {
                await saveWatchlistPreferencesToSupabase(user.id, {
                  watchlist: watchlistSymbolsRef.current,
                  alerts: nextAlerts,
                });
                if (
                  active &&
                  currentUserIdRef.current === user.id &&
                  watchlistOwnerRef.current === user.id
                ) {
                  priceAlertsRef.current = nextAlerts;
                  setPriceAlerts(nextAlerts);
                  setWatchlistError("");
                }
              } catch (err) {
                if (active && currentUserIdRef.current === user.id) {
                  console.error("Triggered price alert save error:", err);
                  setWatchlistError(
                    "A triggered alert could not be saved. Retry saving to keep this status across devices.",
                  );
                  pendingWatchlistSaveRef.current = {
                    userId: user.id,
                    watchlist: watchlistSymbolsRef.current,
                    alerts: nextAlerts,
                  };
                  setWatchlistSavePending(true);
                }
              } finally {
                if (watchlistSavingOwnerRef.current === user.id) {
                  watchlistSavingRef.current = false;
                  watchlistSavingOwnerRef.current = null;
                }
                if (
                  active &&
                  currentUserIdRef.current === user.id &&
                  !watchlistSavingRef.current
                ) {
                  setWatchlistSaving(false);
                }
              }
            }
          }
        }
      } catch (err) {
        if (!active || err?.name === "AbortError") return;

        console.error("Public crypto price fetch error:", err);
        setPriceError(
          err?.message || "Public crypto prices could not be loaded.",
        );
      } finally {
        requestInFlight = false;
        if (active) setPriceLoading(false);
      }
    };

    fetchPrices();
    const interval = globalThis.setInterval(
      fetchPrices,
      PRICE_REFRESH_INTERVAL_MS,
    );

    return () => {
      active = false;
      controller.abort();
      globalThis.clearInterval(interval);
    };
  }, [priceRefreshKey, user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return undefined;

    const requestId = ++watchlistLoadRequestRef.current;
    let active = true;

    loadWatchlistPreferencesFromSupabase(userId)
      .then((preferences) => {
        if (
          !active ||
          requestId !== watchlistLoadRequestRef.current ||
          currentUserIdRef.current !== userId
        )
          return;

        watchlistSymbolsRef.current = preferences.watchlist;
        priceAlertsRef.current = preferences.alerts;
        watchlistOwnerRef.current = userId;
        setWatchlistSymbols(preferences.watchlist);
        setPriceAlerts(preferences.alerts);
        setWatchlistOwnerId(userId);
        setWatchlistError("");
        setWatchlistUsingBrowserFallback(false);
      })
      .catch((err) => {
        if (
          !active ||
          requestId !== watchlistLoadRequestRef.current ||
          currentUserIdRef.current !== userId
        )
          return;

        console.error("Watchlist preferences load error:", err);
        let browserPreferences = null;
        try {
          browserPreferences = loadLegacyWatchlistPreferences(userId);
        } catch (browserError) {
          console.error(
            "Browser watchlist preferences read error:",
            browserError,
          );
        }

        if (browserPreferences) {
          watchlistSymbolsRef.current = browserPreferences.watchlist;
          priceAlertsRef.current = browserPreferences.alerts;
          setWatchlistSymbols(browserPreferences.watchlist);
          setPriceAlerts(browserPreferences.alerts);
          setWatchlistUsingBrowserFallback(true);
        }
        setWatchlistError(
          getWatchlistLoadErrorMessage(err, Boolean(browserPreferences)),
        );
      })
      .finally(() => {
        if (
          active &&
          requestId === watchlistLoadRequestRef.current &&
          currentUserIdRef.current === userId
        ) {
          setWatchlistLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user?.id, watchlistRetryKey]);

  const applySessionUser = useCallback((nextUser, fromAuthEvent = false) => {
    const nextUserId = nextUser?.id || null;
    const accountChanged = currentUserIdRef.current !== nextUserId;

    if (nextUser && !currencyPreferenceLoadedRef.current) {
      currencyPreferenceLoadedRef.current = true;
      try {
        const savedCurrency = globalThis.localStorage.getItem(
          DISPLAY_CURRENCY_STORAGE_KEY,
        );
        if (DISPLAY_CURRENCIES.includes(savedCurrency)) {
          setDisplayCurrency(savedCurrency);
        }
      } catch (err) {
        console.error("Display currency preference read error:", err);
        setCurrencyPreferenceError(
          "Your display currency preference could not be loaded.",
        );
      }
    }

    currentUserIdRef.current = nextUserId;
    setUser(nextUser);

    if (accountChanged) {
      transactionPageRequestVersionRef.current += 1;
      setAdminCreditRecipient(null);
      setAdminCreditConfirmed(false);
      setAdminCreditMessage("");
      setAdminCreditIdentifier("");
      setAdminCreditLookupBy("email");
      setAdminCreditAmount("");
      setWalletSubTab("deposit");

      if (nextUserId) {
        try {
          const savedTab = globalThis.localStorage.getItem(
            `${ACTIVE_TAB_STORAGE_KEY}.${nextUserId}`,
          );
          setActiveTab(
            APP_SECTION_IDS.includes(savedTab) &&
              (savedTab !== "backend" ||
                nextUser?.app_metadata?.admin === true ||
                nextUser?.app_metadata?.admin === "true")
              ? savedTab
              : "dashboard",
          );
          setNavigationPreferenceError("");
        } catch (err) {
          console.error("App section preference read error:", err);
          setActiveTab("dashboard");
          setNavigationPreferenceError(
            "Your previous app section could not be restored.",
          );
        }
      } else {
        setActiveTab("dashboard");
        setNavigationPreferenceError("");
      }

      watchlistLoadRequestRef.current += 1;
      watchlistOwnerRef.current = null;
      watchlistSavingRef.current = false;
      watchlistSavingOwnerRef.current = null;
      pendingWatchlistSaveRef.current = null;
      setWatchlistSavePending(false);
      setWatchlistOwnerId(null);
      watchlistSymbolsRef.current = [];
      priceAlertsRef.current = [];
      setWatchlistSymbols([]);
      setPriceAlerts([]);
      setAlertAssetSymbol("BTC");
      setAlertCondition("above");
      setAlertThreshold("");
      setWatchlistLoading(Boolean(nextUser));
      setWatchlistSaving(false);
      setWatchlistError("");
      setWatchlistUsingBrowserFallback(false);

      setTransactions([]);
      setTransactionTypeFilter("all");
      setTransactionsHaveMore(false);
      setTransactionCursor(null);
      setTransactionsLoadingMore(false);
      setTransactionsMoreError("");
      setExpandedTransactionId(null);
      setNotifications([]);
      setTransactionsError("");
      setNotificationsError("");
      setTransactionsLoading(Boolean(nextUser));
      setNotificationsLoading(Boolean(nextUser));
      setSupportRequests([]);
      setSupportRequestsError("");
      setSupportRequestsLoading(false);
      setSupportRequestsRetryKey(0);
      setSupportSubject("");
      setSupportCategory("account");
      setSupportMessage("");
      setSupportSuccess("");
      setSupportError("");
      setSupportSubmitting(false);
      setDepositSubmitting(false);
      setWithdrawNetwork("");
      setWithdrawSubmitting(false);
      setBackendRequests([]);
      setBackendHistory([]);
      setBackendOverview(null);
      setBackendError("");
      setBackendActionMessage("");
      setBackendSection("overview");
      setBackendStatusFilter("all");
      setBackendSearch("");
      setWalletBalances([]);
      setWalletError("");
      setWalletLoading(Boolean(nextUser));
    }

    if (nextUser) {
      setOnboardingStage("app");
    } else if (fromAuthEvent && accountChanged) {
      setOnboardingStage("auth");
    }
  }, []);

  const restoreAuthSession = useCallback(async () => {
    const eventVersion = authEventVersionRef.current;

    try {
      const {
        data: { session },
        error,
      } = await requireSupabaseClient().auth.getSession();

      if (error) throw error;

      if (
        authMountedRef.current &&
        eventVersion === authEventVersionRef.current
      ) {
        applySessionUser(session?.user || null);
      }
    } catch (err) {
      if (
        !authMountedRef.current ||
        eventVersion !== authEventVersionRef.current
      )
        return;

      console.error("Auth session restoration error:", err);
      setAuthSessionError(
        supabase
          ? "Your session could not be restored. Please try again."
          : "Authentication is unavailable because the Supabase connection is not configured.",
      );
    } finally {
      if (
        authMountedRef.current &&
        eventVersion === authEventVersionRef.current
      ) {
        setUserLoading(false);
      }
    }
  }, [applySessionUser]);

  // Subscribe before restoring so an auth event cannot be overwritten by a
  // stale session read.
  useEffect(() => {
    let active = true;
    authMountedRef.current = true;

    if (!supabase) {
      queueMicrotask(() => {
        if (active && authMountedRef.current) restoreAuthSession();
      });
      return () => {
        active = false;
        authMountedRef.current = false;
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        authEventVersionRef.current += 1;
        if (event === "PASSWORD_RECOVERY") {
          setAuthMode("reset");
          setOnboardingStage("auth");
          setAuthError("");
          setAuthSuccess("");
          setCanResendConfirmation(false);
          setAuthPassword("");
          setAuthPasswordConfirmation("");
        }
        applySessionUser(session?.user || null, true);
        setAuthSessionError("");
        setUserLoading(false);
      },
    );

    queueMicrotask(() => {
      if (active && authMountedRef.current) restoreAuthSession();
    });

    return () => {
      active = false;
      authMountedRef.current = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [applySessionUser, restoreAuthSession]);

  // Fetch activity for the current account and discard results after account
  // changes or unmount.
  const accountUserId = user?.id;

  useEffect(() => {
    let active = true;

    if (!accountUserId) {
      return () => {
        active = false;
      };
    }

    const requestVersion = ++transactionPageRequestVersionRef.current;
    Promise.resolve()
      .then(() => {
        if (
          !active ||
          currentUserIdRef.current !== accountUserId ||
          transactionPageRequestVersionRef.current !== requestVersion
        )
          return null;
        setTransactionsLoading(true);
        setTransactions([]);
        setTransactionsHaveMore(false);
        setTransactionCursor(null);
        setTransactionsError("");
        setTransactionsMoreError("");
        setExpandedTransactionId(null);
        return loadAccountActivity(accountUserId, transactionTypeFilter);
      })
      .then((activity) => {
        if (!activity) return;
        const { transactionsResult, notificationsResult } = activity;
        if (
          !active ||
          currentUserIdRef.current !== accountUserId ||
          transactionPageRequestVersionRef.current !== requestVersion
        )
          return;

        if (transactionsResult.error) {
          console.error("Transaction fetch error:", transactionsResult.error);
          setTransactionsError("Could not load transaction history.");
          setTransactions([]);
          setTransactionsHaveMore(false);
          setTransactionCursor(null);
        } else {
          setTransactions(transactionsResult.data || []);
          setTransactionsHaveMore(transactionsResult.hasMore);
          setTransactionCursor(transactionsResult.nextCursor);
          setTransactionsError("");
          setTransactionsMoreError("");
        }

        if (notificationsResult.error) {
          console.error("Notification fetch error:", notificationsResult.error);
          setNotificationsError("Could not load notifications.");
          setNotifications([]);
        } else {
          setNotifications(notificationsResult.data || []);
        }
      })
      .catch((err) => {
        if (
          !active ||
          currentUserIdRef.current !== accountUserId ||
          transactionPageRequestVersionRef.current !== requestVersion
        )
          return;
        console.error("Account activity fetch error:", err);
        setTransactionsError("Could not load transaction history.");
        setNotificationsError("Could not load notifications.");
        setTransactions([]);
        setNotifications([]);
        setTransactionsHaveMore(false);
        setTransactionCursor(null);
      })
      .finally(() => {
        if (
          active &&
          currentUserIdRef.current === accountUserId &&
          transactionPageRequestVersionRef.current === requestVersion
        ) {
          setTransactionsLoading(false);
          setNotificationsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accountUserId, transactionTypeFilter]);

  useEffect(() => {
    let active = true;
    if (!accountUserId || activeTab !== "support") return undefined;

    Promise.resolve()
      .then(() => {
        if (!active || currentUserIdRef.current !== accountUserId) return null;
        setSupportRequestsLoading(true);
        setSupportRequestsError("");
        return requireSupabaseClient()
          .from("support_requests")
          .select("id, subject, category, message, status, created_at")
          .eq("user_id", accountUserId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
      })
      .then((result) => {
        if (!active || currentUserIdRef.current !== accountUserId) return;
        if (!result) return;
        const { data, error } = result;
        if (error) {
          console.error("Support requests fetch error:", error);
          setSupportRequestsError("Could not load support requests.");
          return;
        }
        setSupportRequests(data || []);
      })
      .catch((err) => {
        if (!active || currentUserIdRef.current !== accountUserId) return;
        console.error("Support requests fetch error:", err);
        setSupportRequestsError("Could not load support requests.");
      })
      .finally(() => {
        if (active && currentUserIdRef.current === accountUserId) {
          setSupportRequestsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accountUserId, activeTab, supportRequestsRetryKey]);

  useEffect(() => {
    let active = true;
    if (!accountUserId || activeTab !== "backend" || !isAdmin) return undefined;

    const requestVersion = ++backendRequestVersionRef.current;
    const isCurrent = () =>
      active &&
      currentUserIdRef.current === accountUserId &&
      backendRequestVersionRef.current === requestVersion;
    Promise.resolve()
      .then(() => {
        if (!isCurrent()) return null;
        setBackendLoading(true);
        setBackendError("");
        const client = requireSupabaseClient();
        const isRequestList = ["withdrawals", "deposits", "overview"].includes(
          backendSection,
        );
        const requestKind =
          backendSection === "withdrawals"
            ? "withdrawal"
            : backendSection === "deposits"
              ? "deposit"
              : backendRequestKind;
        const calls = [
          client.rpc("get_backend_overview"),
          isRequestList
            ? client.rpc("get_backend_requests", {
                p_request_kind:
                  backendSection === "overview" ? "all" : requestKind,
                p_status:
                  backendSection === "overview" ? "all" : backendStatusFilter,
                p_search: backendSection === "overview" ? "" : backendSearch,
                p_limit: backendSection === "overview" ? 10 : 100,
                p_offset: 0,
              })
            : Promise.resolve({ data: [], error: null }),
          backendSection === "history"
            ? client.rpc("get_backend_history", {
                p_request_kind: backendRequestKind,
                p_search: backendSearch,
                p_limit: 100,
              })
            : Promise.resolve({ data: [], error: null }),
        ];
        return Promise.all(calls);
      })
      .then((results) => {
        if (!results) return;
        const [overviewResult, requestsResult, historyResult] = results;
        if (!isCurrent()) return;
        const failed = [
          overviewResult.error,
          requestsResult.error,
          historyResult.error,
        ].filter(Boolean);
        if (failed.length) {
          console.error("Backend dashboard data load error:", failed);
          setBackendError(
            "Could not load Backend data. Check admin authorization and the financial workflow migration.",
          );
        } else {
          setBackendError("");
        }
        setBackendOverview(overviewResult.data || null);
        setBackendRequests(requestsResult.data || []);
        setBackendHasMore(
          ["withdrawals", "deposits", "overview"].includes(backendSection) &&
            backendSection !== "overview" &&
            (requestsResult.data || []).length === 100,
        );
        setBackendOffset((requestsResult.data || []).length);
        setBackendHistory(historyResult.data || []);
      })
      .catch((error) => {
        if (!isCurrent()) return;
        console.error("Backend dashboard data load error:", error);
        setBackendError(
          "Could not load Backend data. Check admin authorization and the financial workflow migration.",
        );
      })
      .finally(() => {
        if (isCurrent()) setBackendLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    accountUserId,
    activeTab,
    isAdmin,
    backendSection,
    backendRequestKind,
    backendStatusFilter,
    backendSearch,
    backendRefreshKey,
  ]);

  // Load only the current user's wallet balances.
  const fetchWalletBalances = useCallback(
    (isCurrent = () => true) => {
      if (!user) return;

      const requestedUserId = user.id;
      const requestIsCurrent = () =>
        currentUserIdRef.current === requestedUserId && isCurrent();

      if (requestIsCurrent()) {
        setWalletBalances([]);
        setWalletError("");
        setWalletLoading(true);
      }

      loadWalletBalances(requestedUserId)
        .then((balances) => {
          if (requestIsCurrent()) {
            setWalletBalances(balances);
            setWalletError("");
          }
        })
        .catch((err) => {
          if (requestIsCurrent()) {
            console.error("Wallet balance fetch error:", err);
            setWalletBalances([]);
            setWalletError(
              "Could not load your balances. Check the connection and wallet database setup, then retry.",
            );
          }
        })
        .finally(() => {
          if (requestIsCurrent()) setWalletLoading(false);
        });
    },
    [user],
  );

  useEffect(() => {
    let cancelled = false;

    fetchWalletBalances(() => !cancelled);

    return () => {
      cancelled = true;
    };
  }, [fetchWalletBalances]);

  const refreshAccountActivity = async () => {
    if (!user) return;

    const requestedUserId = user.id;
    const requestVersion = ++transactionPageRequestVersionRef.current;
    setTransactionsLoading(true);
    setTransactionsLoadingMore(false);
    setTransactionsMoreError("");
    setNotificationsLoading(true);

    try {
      const { transactionsResult, notificationsResult } =
        await loadAccountActivity(requestedUserId, transactionTypeFilter);
      if (
        currentUserIdRef.current !== requestedUserId ||
        transactionPageRequestVersionRef.current !== requestVersion
      )
        return;

      if (transactionsResult.error) {
        console.error("Transaction refresh error:", transactionsResult.error);
        setTransactionsError("Could not load transaction history.");
        setTransactionsHaveMore(false);
        setTransactionCursor(null);
      } else {
        setTransactions(transactionsResult.data || []);
        setTransactionsHaveMore(transactionsResult.hasMore);
        setTransactionCursor(transactionsResult.nextCursor);
        setTransactionsError("");
        setTransactionsMoreError("");
        setExpandedTransactionId(null);
      }

      if (notificationsResult.error) {
        console.error("Notification refresh error:", notificationsResult.error);
        setNotificationsError("Could not load notifications.");
      } else {
        setNotifications(notificationsResult.data || []);
        setNotificationsError("");
      }
    } catch (err) {
      if (
        currentUserIdRef.current !== requestedUserId ||
        transactionPageRequestVersionRef.current !== requestVersion
      )
        return;
      console.error("Account activity refresh error:", err);
      setTransactionsError("Could not load transaction history.");
      setTransactionsHaveMore(false);
      setTransactionCursor(null);
      setNotificationsError("Could not load notifications.");
    } finally {
      if (
        currentUserIdRef.current === requestedUserId &&
        transactionPageRequestVersionRef.current === requestVersion
      ) {
        setTransactionsLoading(false);
        setNotificationsLoading(false);
      }
    }
  };

  const loadMoreTransactions = async () => {
    if (
      !user?.id ||
      transactionsLoading ||
      !transactionCursor ||
      !transactionsHaveMore ||
      transactionsLoadingMore
    ) {
      return;
    }

    const requestedUserId = user.id;
    const requestVersion = transactionPageRequestVersionRef.current;
    setTransactionsLoadingMore(true);
    setTransactionsMoreError("");
    try {
      const result = await loadTransactionPage(
        requestedUserId,
        transactionCursor,
        transactionTypeFilter,
      );
      if (
        currentUserIdRef.current !== requestedUserId ||
        transactionPageRequestVersionRef.current !== requestVersion
      )
        return;
      if (result.error) {
        console.error("Load more transactions error:", result.error);
        setTransactionsMoreError("Could not load more transactions.");
        return;
      }

      setTransactions((currentTransactions) => {
        const existingIds = new Set(
          currentTransactions.map((transaction) => transaction.id),
        );
        return [
          ...currentTransactions,
          ...(result.data || []).filter(
            (transaction) => !existingIds.has(transaction.id),
          ),
        ];
      });
      setTransactionsHaveMore(result.hasMore);
      setTransactionCursor(result.nextCursor);
    } catch (err) {
      if (
        currentUserIdRef.current !== requestedUserId ||
        transactionPageRequestVersionRef.current !== requestVersion
      )
        return;
      console.error("Load more transactions error:", err);
      setTransactionsMoreError("Could not load more transactions.");
    } finally {
      if (
        currentUserIdRef.current === requestedUserId &&
        transactionPageRequestVersionRef.current === requestVersion
      ) {
        setTransactionsLoadingMore(false);
      }
    }
  };

  const loadMoreBackendRequests = async () => {
    if (!isAdmin || backendLoading || !backendHasMore) return;
    const requestKind =
      backendSection === "withdrawals" ? "withdrawal" : "deposit";
    setBackendLoading(true);
    setBackendError("");
    try {
      const { data, error } = await requireSupabaseClient().rpc(
        "get_backend_requests",
        {
          p_request_kind: requestKind,
          p_status: backendStatusFilter,
          p_search: backendSearch,
          p_limit: 100,
          p_offset: backendOffset,
        },
      );
      if (error) throw error;
      setBackendRequests((current) => [...current, ...(data || [])]);
      setBackendOffset((offset) => offset + (data || []).length);
      setBackendHasMore((data || []).length === 100);
    } catch (error) {
      console.error("Backend request pagination error:", error);
      setBackendError("Could not load more Backend requests.");
    } finally {
      setBackendLoading(false);
    }
  };

  const handleBackendRequestAction = async (request, action) => {
    if (!isAdmin || !request?.request_id || backendBusyRequestId) return;
    if (action === "decline" && !backendDeclineReason.trim()) {
      setBackendActionMessage("Enter a decline reason.");
      return;
    }
    setBackendBusyRequestId(request.request_id);
    setBackendActionMessage("");
    try {
      const actionId = globalThis.crypto.randomUUID();
      const functionName =
        request.request_kind === "withdrawal"
          ? {
              approve: "approve_withdrawal_request",
              decline: "decline_withdrawal_request",
            }[action]
          : {
              approve: "approve_deposit_request",
              decline: "decline_deposit_request",
            }[action];
      const parameters =
        request.request_kind === "withdrawal"
          ? action === "decline"
            ? {
                p_request_id: request.request_id,
                p_reason: backendDeclineReason.trim(),
                p_action_id: actionId,
              }
            : { p_request_id: request.request_id, p_action_id: actionId }
          : action === "decline"
            ? {
                p_request_id: request.request_id,
                p_reason: backendDeclineReason.trim(),
                p_action_id: actionId,
              }
            : { p_request_id: request.request_id, p_action_id: actionId };
      const { error } = await requireSupabaseClient().rpc(
        functionName,
        parameters,
      );
      if (error) throw error;
      setBackendActionMessage(
        action === "approve"
          ? request.request_kind === "withdrawal"
            ? "Withdrawal completed."
            : "Deposit approved and credited."
          : request.request_kind === "withdrawal"
            ? "Withdrawal failed and reserved balance released."
            : "Deposit failed.",
      );
      setBackendDeclineId(null);
      setBackendDeclineReason("");
      setBackendRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Backend request action error:", error);
      setBackendActionMessage(
        "The requested action could not be completed. Refresh and verify the current status.",
      );
      setBackendRefreshKey((key) => key + 1);
    } finally {
      setBackendBusyRequestId(null);
    }
  };

  const handleSupportRequestSubmit = async (event) => {
    event.preventDefault();
    setSupportSuccess("");
    setSupportError("");

    const subject = supportSubject.trim();
    const message = supportMessage.trim();
    if (!subject || !message) {
      setSupportError("Enter a subject and message.");
      return;
    }
    if (!SUPPORT_CATEGORIES.includes(supportCategory)) {
      setSupportError("Choose a valid support category.");
      return;
    }
    if (!user?.id) {
      setSupportError("Sign in to submit a support request.");
      return;
    }

    const requestedUserId = user.id;
    setSupportSubmitting(true);
    try {
      const { data, error } = await requireSupabaseClient()
        .from("support_requests")
        .insert({
          user_id: requestedUserId,
          subject,
          category: supportCategory,
          message,
        })
        .select("id, subject, category, message, status, created_at")
        .single();

      if (error) throw error;
      if (currentUserIdRef.current !== requestedUserId) return;
      setSupportRequests((currentRequests) => [data, ...currentRequests]);
      setSupportSubject("");
      setSupportCategory("account");
      setSupportMessage("");
      setSupportSuccess("Your support request has been submitted.");
    } catch (err) {
      if (currentUserIdRef.current !== requestedUserId) return;
      console.error("Support request submission error:", err);
      setSupportError(
        "Could not submit your support request. Please try again.",
      );
    } finally {
      if (currentUserIdRef.current === requestedUserId) {
        setSupportSubmitting(false);
      }
    }
  };

  const handleDemoTransfer = async (e) => {
    e.preventDefault();
    setTransferMessage("");

    const isAdminSend = walletSubTab === "admin-send";
    const amount = Number(transferAmount);

    if (!transferEmail.trim() || !Number.isFinite(amount) || amount <= 0) {
      setTransferMessage(
        "Enter a recipient email and an amount greater than zero.",
      );
      return;
    }

    if (transferEmail.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setTransferMessage("You cannot transfer assets to your own account.");
      return;
    }

    const recipientEmail = transferEmail.trim();
    const payload = JSON.stringify([
      user?.id,
      recipientEmail.toLowerCase(),
      transferAsset,
      amount,
      isAdminSend,
    ]);
    if (!user?.id) {
      setTransferMessage("Sign in before sending a transfer.");
      return;
    }

    if (transferInFlightRef.current) return;
    transferInFlightRef.current = true;

    const requestStorageKey = `coinmaster.pending-${isAdminSend ? "admin-send" : "transfer"}.${user.id}`;
    let pendingRequest;
    let fingerprint;

    try {
      fingerprint = await fingerprintTransferPayload(payload);
      const storedRequest = globalThis.localStorage.getItem(requestStorageKey);

      if (storedRequest) {
        pendingRequest = JSON.parse(storedRequest);
        if (
          !pendingRequest ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            pendingRequest.requestId,
          ) ||
          typeof pendingRequest.payloadFingerprint !== "string"
        ) {
          throw new Error("The saved transfer request is invalid.");
        }

        if (pendingRequest.payloadFingerprint !== fingerprint) {
          setTransferMessage(
            "A previous transfer has an unconfirmed result. Retry with the same recipient, asset, and amount before starting another transfer.",
          );
          transferInFlightRef.current = false;
          return;
        }
      } else {
        const requestId = globalThis.crypto?.randomUUID?.();
        if (!requestId) {
          throw new Error("This browser cannot create a secure request ID.");
        }

        pendingRequest = { requestId, payloadFingerprint: fingerprint };
        globalThis.localStorage.setItem(
          requestStorageKey,
          JSON.stringify(pendingRequest),
        );
      }
    } catch (err) {
      console.error("Transfer retry-key setup error:", err);
      setTransferMessage(
        "Could not prepare a safe transfer retry key. Allow browser storage and secure cryptography, then retry.",
      );
      transferInFlightRef.current = false;
      return;
    }

    setTransferLoading(true);
    let outcomeUnknown = true;
    let retryKeyClearFailed = false;

    try {
      const { error } = await requireSupabaseClient().rpc(
        isAdminSend ? "admin_send_demo_asset" : "transfer_demo_asset",
        {
          p_recipient_email: recipientEmail,
          p_asset: transferAsset,
          p_amount: amount,
          p_request_id: pendingRequest.requestId,
        },
      );

      if (error) {
        if (error.code) {
          outcomeUnknown = false;
          try {
            globalThis.localStorage.removeItem(requestStorageKey);
          } catch (storageError) {
            retryKeyClearFailed = true;
            console.error("Transfer retry-key cleanup error:", storageError);
          }
        }
        throw error;
      }

      outcomeUnknown = false;
      try {
        globalThis.localStorage.removeItem(requestStorageKey);
        setTransferMessage(
          `${isAdminSend ? "Admin send" : "Transfer"} of ${amount} ${transferAsset} completed.`,
        );
        setTransferEmail("");
        setTransferAmount("");
      } catch (storageError) {
        retryKeyClearFailed = true;
        console.error("Transfer retry-key cleanup error:", storageError);
        setTransferMessage(
          "Transfer completed, but the browser could not clear its retry key. Retry with the same recipient, asset, and amount to confirm it safely.",
        );
      }

      setWalletLoading(true);
      await Promise.all([fetchWalletBalances(), refreshAccountActivity()]);
    } catch (err) {
      console.error("Demo transfer error:", err);

      setTransferMessage(
        `${err?.message || "Transfer result could not be confirmed."}${outcomeUnknown ? tx(" Retry with the same recipient, asset, and amount to reuse the request ID.") : retryKeyClearFailed ? tx(" Clear this site’s saved data before starting another transfer.") : ""}`,
      );
    } finally {
      setTransferLoading(false);
      transferInFlightRef.current = false;
    }
  };

  const handleResolveAdminCreditRecipient = async () => {
    const identifier = adminCreditIdentifier.trim();
    if (!identifier) {
      setAdminCreditMessage(
        `Enter the recipient's ${adminCreditLookupBy === "email" ? tx("email") : tx("Supabase User ID")}.`,
      );
      return;
    }

    setAdminCreditLoading(true);
    setAdminCreditMessage("");
    setAdminCreditRecipient(null);
    setAdminCreditConfirmed(false);

    try {
      const { data, error } = await requireSupabaseClient().rpc(
        "admin_resolve_demo_asset_recipient",
        {
          p_identifier: identifier,
          p_lookup_by: adminCreditLookupBy,
        },
      );

      if (error) throw error;
      if (
        typeof data?.user_id !== "string" ||
        typeof data?.email !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          data.user_id,
        )
      ) {
        throw new Error("Recipient lookup returned an invalid account.");
      }

      setAdminCreditRecipient({
        userId: data.user_id,
        email: data.email,
        lookupBy: adminCreditLookupBy,
        identifier,
      });
    } catch (err) {
      console.error("Admin recipient lookup error:", err);
      setAdminCreditMessage(
        err?.message || "Could not resolve the recipient account.",
      );
    } finally {
      setAdminCreditLoading(false);
    }
  };

  const handleAdminCredit = async (e) => {
    e.preventDefault();
    setAdminCreditMessage("");

    const amount = Number(adminCreditAmount);
    if (!adminCreditRecipient) {
      setAdminCreditMessage("Resolve and confirm a recipient first.");
      return;
    }
    if (!adminCreditConfirmed) {
      setAdminCreditMessage("Confirm the resolved recipient before crediting.");
      return;
    }
    if (
      adminCreditRecipient.lookupBy !== adminCreditLookupBy ||
      adminCreditRecipient.identifier !== adminCreditIdentifier.trim()
    ) {
      setAdminCreditRecipient(null);
      setAdminCreditMessage("Resolve the current recipient before crediting.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdminCreditMessage("Enter a valid amount greater than zero.");
      return;
    }
    if (adminCreditInFlightRef.current || !user?.id) return;

    adminCreditInFlightRef.current = true;
    const requestStorageKey = `coinmaster.pending-admin-credit.${user.id}`;
    const payload = JSON.stringify([
      user.id,
      adminCreditRecipient.userId,
      adminCreditAsset,
      amount,
    ]);
    let pendingRequest;
    let outcomeUnknown = true;
    let retryKeyClearFailed = false;

    try {
      const fingerprint = await fingerprintTransferPayload(payload);
      const storedRequest = globalThis.localStorage.getItem(requestStorageKey);

      if (storedRequest) {
        pendingRequest = JSON.parse(storedRequest);
        if (
          !pendingRequest ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            pendingRequest.requestId,
          ) ||
          typeof pendingRequest.payloadFingerprint !== "string"
        ) {
          throw new Error("The saved admin credit request is invalid.");
        }
        if (pendingRequest.payloadFingerprint !== fingerprint) {
          setAdminCreditMessage(
            "A previous credit has an unconfirmed result. Retry with the same recipient, asset, and amount before starting another credit.",
          );
          return;
        }
      } else {
        const requestId = globalThis.crypto?.randomUUID?.();
        if (!requestId) {
          throw new Error("This browser cannot create a secure request ID.");
        }
        pendingRequest = { requestId, payloadFingerprint: fingerprint };
        globalThis.localStorage.setItem(
          requestStorageKey,
          JSON.stringify(pendingRequest),
        );
      }

      setAdminCreditLoading(true);
      const { error } = await requireSupabaseClient().rpc(
        "admin_credit_demo_asset",
        {
          p_user_id: adminCreditRecipient.userId,
          p_asset: adminCreditAsset,
          p_amount: amount,
          p_request_id: pendingRequest.requestId,
        },
      );

      if (error) {
        if (error.code) {
          outcomeUnknown = false;
          try {
            globalThis.localStorage.removeItem(requestStorageKey);
          } catch (storageError) {
            retryKeyClearFailed = true;
            console.error(
              "Admin credit retry-key cleanup error:",
              storageError,
            );
          }
        }
        throw error;
      }

      outcomeUnknown = false;
      try {
        globalThis.localStorage.removeItem(requestStorageKey);
        setAdminCreditMessage(
          `Credited ${amount} ${adminCreditAsset} to ${adminCreditRecipient.email}.`,
        );
        setAdminCreditAmount("");
      } catch (storageError) {
        retryKeyClearFailed = true;
        console.error("Admin credit retry-key cleanup error:", storageError);
        setAdminCreditMessage(
          "Credit completed, but the browser could not clear its retry key. Retry with the same recipient, asset, and amount to confirm it safely.",
        );
      }
    } catch (err) {
      console.error("Admin asset credit error:", err);
      setAdminCreditMessage(
        `${err?.message || "Credit result could not be confirmed."}${outcomeUnknown ? tx(" Retry with the same recipient, asset, and amount to reuse the request ID.") : retryKeyClearFailed ? tx(" Clear this site’s saved data before starting another credit.") : ""}`,
      );
    } finally {
      setAdminCreditLoading(false);
      adminCreditInFlightRef.current = false;
    }
  };

  const handleCopyWalletId = async () => {
    if (!user?.id) return;

    try {
      await globalThis.navigator.clipboard.writeText(user.id);
      setWalletIdCopyMessage("");
      setWalletIdCopied(true);
      globalThis.setTimeout(() => setWalletIdCopied(false), 2000);
    } catch (err) {
      console.error("Wallet account ID copy error:", err);
      setWalletIdCopyMessage(
        "Could not copy the account ID. Select and copy it manually.",
      );
    }
  };

  // Handle Standalone Sign In / Sign Up
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setCanResendConfirmation(false);
    setAuthLoading(true);

    try {
      if (authMode === "login") {
        const { error } = await requireSupabaseClient().auth.signInWithPassword(
          {
            email: authEmail,
            password: authPassword,
          },
        );

        if (error) {
          const message = getAuthenticationErrorMessage(error);
          setAuthError(message);
          setCanResendConfirmation(
            message ===
              "Email not confirmed. Resend the confirmation email below.",
          );
        }
      } else {
        const { error } = await requireSupabaseClient().auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: buildSignupMetadata(
              selectedCountry,
              selectedLanguage,
              selectedPlan,
            ),
          },
        });

        if (error) {
          setAuthError(getAuthenticationErrorMessage(error));
        } else {
          setAuthSuccess(
            "Account created! Please check your email for confirmation.",
          );
          setCanResendConfirmation(true);
        }
      }
    } catch (err) {
      console.error("Authentication request error:", err);
      setAuthError(getAuthenticationErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordRecoverySubmit = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    try {
      const { error } =
        await requireSupabaseClient().auth.resetPasswordForEmail(
          authEmail.trim(),
        );

      if (error) {
        setAuthError(getAuthenticationErrorMessage(error));
      } else {
        setAuthSuccess(
          "If an account exists for this email, password reset instructions have been sent.",
        );
      }
    } catch (err) {
      console.error("Password recovery request error:", err);
      setAuthError(getAuthenticationErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    try {
      const { error } = await requireSupabaseClient().auth.resend({
        type: "signup",
        email: authEmail.trim(),
      });

      if (error) {
        setAuthError(getAuthenticationErrorMessage(error));
      } else {
        setAuthSuccess("Confirmation email sent. Check your inbox.");
      }
    } catch (err) {
      console.error("Confirmation email resend error:", err);
      setAuthError(getAuthenticationErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    if (authPassword !== authPasswordConfirmation) {
      setAuthError("Passwords do not match.");
      return;
    }

    setAuthLoading(true);
    try {
      const { error } = await requireSupabaseClient().auth.updateUser({
        password: authPassword,
      });

      if (error) {
        setAuthError(getAuthenticationErrorMessage(error));
      } else {
        setAuthPassword("");
        setAuthPasswordConfirmation("");
        setAuthSuccess("Your password has been updated.");
      }
    } catch (err) {
      console.error("Password reset error:", err);
      setAuthError(getAuthenticationErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const returnFromPasswordReset = () => {
    setAuthMode("login");
    setAuthError("");
    setAuthSuccess("");
    setAuthPassword("");
    setAuthPasswordConfirmation("");
    setOnboardingStage("landing");
  };

  const beginPasswordRecovery = () => {
    setAuthMode("recovery");
    setAuthError("");
    setAuthSuccess("");
    setCanResendConfirmation(false);
  };

  const handleSignOut = async () => {
    setUserDropdownOpen(false);

    try {
      const { error } = await requireSupabaseClient().auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error("Sign-out error:", err);
      setAuthError("Could not sign out. Please try again.");
    }
  };

  const handleDepositSubmit = async (event) => {
    event.preventDefault();
    setDepositValidationError("");

    if (depositStep === 1) {
      if (!Object.hasOwn(WITHDRAWAL_NETWORKS, depositAsset)) {
        setDepositValidationError("Select a supported asset.");
        return;
      }
      setDepositStep(2);
      return;
    }

    if (depositStep === 2) {
      if (!getDepositFeeDetails(depositAmount)) {
        setDepositValidationError(
          "Enter a valid amount with no more than two decimal places.",
        );
        return;
      }
      setDepositStep(3);
      return;
    }

    if (!user?.id || depositSubmitting) return;
    const feeDetails = getDepositFeeDetails(depositAmount);
    if (!feeDetails || !Object.hasOwn(WITHDRAWAL_NETWORKS, depositAsset)) {
      setDepositValidationError(
        "Deposit details are invalid. Review the asset and amount.",
      );
      return;
    }

    setDepositSubmitting(true);
    try {
      const storageKey = `coinmaster.pending-deposit.${user.id}`;
      const payload = JSON.stringify([
        user.id,
        depositAsset,
        feeDetails.grossAmount,
      ]);
      const stored = globalThis.localStorage.getItem(storageKey);
      let actionId;
      if (stored) {
        const pending = JSON.parse(stored);
        if (
          pending?.payload !== payload ||
          typeof pending?.requestId !== "string"
        ) {
          throw new Error(
            "A previous deposit request has an unresolved result.",
          );
        }
        actionId = pending.requestId;
      } else {
        actionId = globalThis.crypto.randomUUID();
        globalThis.localStorage.setItem(
          storageKey,
          JSON.stringify({ payload, requestId: actionId }),
        );
      }

      const { error } = await requireSupabaseClient().rpc(
        "create_deposit_request",
        {
          p_asset: depositAsset,
          p_amount: feeDetails.grossAmount,
          p_idempotency_key: actionId,
        },
      );
      if (error) throw error;
      globalThis.localStorage.removeItem(storageKey);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10_000));
      if (currentUserIdRef.current !== user.id) return;
      setDepositStep(1);
      setDepositAsset("BTC");
      setDepositAmount("");
      setActiveTab("dashboard");
    } catch (error) {
      console.error("Deposit request submission error:", error);
      setDepositValidationError(
        "Could not submit the deposit request. Please review the details and try again.",
      );
    } finally {
      setDepositSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async (event) => {
    event.preventDefault();

    if (withdrawStep === 1) {
      if (!withdrawMethod) {
        setWithdrawValidationError("Select an asset to continue.");
        return;
      }
      setWithdrawValidationError("");
      setWithdrawStep(2);
      return;
    }

    if (withdrawStep === 2) {
      const withdrawalDetails = getWithdrawalFeeDetails(withdrawAmount);
      const wallet = walletBalances.find(
        (balance) => balance.asset === withdrawMethod,
      );
      if (walletLoading || walletError || !wallet) {
        setWithdrawValidationError(
          "A current balance is required to validate this withdrawal. Refresh your balances and try again.",
        );
        return;
      }
      if (!withdrawalDetails) {
        setWithdrawValidationError(
          "Enter a valid amount with no more than two decimal places.",
        );
        return;
      }
      if (withdrawalDetails.grossAmount > Number(wallet.balance)) {
        setWithdrawValidationError(
          `The amount exceeds your available ${withdrawMethod} balance of ${formatFinancialAmount(wallet.balance)}.`,
        );
        return;
      }
      setWithdrawValidationError("");
      setWithdrawStep(3);
      return;
    }

    if (withdrawStep === 3) {
      if (withdrawAddress.trim().length < 8) {
        setWithdrawValidationError(
          "Enter a valid destination address to continue.",
        );
        return;
      }
      setWithdrawValidationError("");
      setWithdrawStep(4);
      return;
    }

    if (withdrawStep === 4) {
      if (!WITHDRAWAL_NETWORKS[withdrawMethod]?.includes(withdrawNetwork)) {
        setWithdrawValidationError("Select a network to continue.");
        return;
      }
      setWithdrawValidationError("");
      setWithdrawStep(5);
      return;
    }

    if (withdrawStep === 5) {
      if (!user?.id || withdrawInFlightRef.current) return;
      const withdrawalDetails = getWithdrawalFeeDetails(withdrawAmount);
      const wallet = walletBalances.find(
        (balance) => balance.asset === withdrawMethod,
      );
      if (
        walletLoading ||
        walletError ||
        !wallet ||
        !withdrawalDetails ||
        withdrawalDetails.grossAmount > Number(wallet.balance) ||
        withdrawAddress.trim().length < 8
      ) {
        setWithdrawErrorModal(true);
        return;
      }

      withdrawInFlightRef.current = true;
      setWithdrawSubmitting(true);
      try {
        const storageKey = `coinmaster.pending-withdrawal.${user.id}`;
        const payload = JSON.stringify([
          user.id,
          withdrawMethod,
          withdrawNetwork,
          withdrawAddress.trim(),
          withdrawalDetails.grossAmount,
        ]);
        const stored = globalThis.localStorage.getItem(storageKey);
        let actionId;
        if (stored) {
          const pending = JSON.parse(stored);
          if (
            pending?.payload !== payload ||
            typeof pending?.requestId !== "string"
          ) {
            throw new Error(
              "A previous withdrawal request has an unresolved result.",
            );
          }
          actionId = pending.requestId;
        } else {
          actionId = globalThis.crypto.randomUUID();
          globalThis.localStorage.setItem(
            storageKey,
            JSON.stringify({ payload, requestId: actionId }),
          );
        }

        const { error } = await requireSupabaseClient().rpc(
          "submit_withdrawal_request",
          {
            p_asset: withdrawMethod,
            p_network: withdrawNetwork,
            p_destination_address: withdrawAddress.trim(),
            p_amount: withdrawalDetails.grossAmount,
            p_idempotency_key: actionId,
          },
        );
        if (error) throw error;
        globalThis.localStorage.removeItem(storageKey);
        await new Promise((resolve) => globalThis.setTimeout(resolve, 10_000));
        if (currentUserIdRef.current !== user.id) return;
        fetchWalletBalances();
        await refreshAccountActivity();
        setWithdrawStep(1);
        setWithdrawMethod("");
        setWithdrawNetwork("");
        setWithdrawAddress("");
        setWithdrawAmount("");
        navigateToTab("dashboard");
      } catch (error) {
        console.error("Withdrawal request submission error:", error);
        setWithdrawErrorModal(true);
      } finally {
        withdrawInFlightRef.current = false;
        setWithdrawSubmitting(false);
      }
    }
  };

  const getUserInitials = () => {
    if (!user || !user.email) return "CM";
    return user.email.substring(0, 2).toUpperCase();
  };

  const currencyKey = displayCurrency;
  const marketTickers = PRICED_CRYPTO_ASSETS.map((asset) => {
    const quote = cryptoPrices[asset.id]?.[currencyKey];
    const change = quote?.change;

    return {
      ...asset,
      symbol: `${asset.symbol}/${displayCurrency}`,
      price: quote?.price,
      change:
        change === null || change === undefined
          ? tx("24h change unavailable")
          : `${change >= 0 ? "+" : ""}${formatNumber(
              Math.abs(change),
              appLocale,
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}%`,
      positive: change !== null && change !== undefined && change >= 0,
    };
  });

  const handleDisplayCurrencyChange = (event) => {
    const nextCurrency = event.target.value;
    if (!DISPLAY_CURRENCIES.includes(nextCurrency)) return;

    setDisplayCurrency(nextCurrency);
    try {
      globalThis.localStorage.setItem(
        DISPLAY_CURRENCY_STORAGE_KEY,
        nextCurrency,
      );
      setCurrencyPreferenceError("");
    } catch (err) {
      console.error("Display currency preference save error:", err);
      setCurrencyPreferenceError(
        "Your selection applies for this session but could not be saved.",
      );
    }
  };

  const totalWalletValue = walletBalances.reduce((total, wallet) => {
    const price = getCryptoPrice(cryptoPrices, wallet.asset, currencyKey);

    return Number.isFinite(price)
      ? total + Number(wallet.balance) * price
      : total;
  }, 0);

  const unpricedWalletCount = walletBalances.filter((wallet) => {
    return !Number.isFinite(
      getCryptoPrice(cryptoPrices, wallet.asset, currencyKey),
    );
  }).length;

  const pricedPortfolioAssets = walletBalances.map((wallet) => {
    const price = getCryptoPrice(cryptoPrices, wallet.asset, currencyKey);
    const value = Number.isFinite(price)
      ? Number(wallet.balance) * price
      : null;

    return {
      ...wallet,
      price,
      value,
      allocation:
        Number.isFinite(value) && totalWalletValue > 0
          ? (value / totalWalletValue) * 100
          : null,
    };
  });

  const selectedAssetPrice = getCryptoPrice(
    cryptoPrices,
    selectedAsset.symbol,
    currencyKey,
  );
  const selectedDestinationAssetPrice = getCryptoPrice(
    cryptoPrices,
    selectedDestinationAsset.symbol,
    currencyKey,
  );
  const parsedTradeAmount = Number(tradeAmount);
  const tradeEstimate =
    Number.isFinite(selectedAssetPrice) &&
    Number.isFinite(parsedTradeAmount) &&
    parsedTradeAmount > 0
      ? selectedAssetPrice * parsedTradeAmount
      : null;
  const conversionEstimate = getConversionEstimate(
    tradeAmount,
    selectedAssetPrice,
    selectedDestinationAssetPrice,
  );
  const transactionTypes = [
    ...new Set([
      ...KNOWN_TRANSACTION_TYPES,
      ...transactions.map((transaction) => transaction.type).filter(Boolean),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  const visibleTransactions = filterTransactionsByType(
    transactions,
    transactionTypeFilter,
  );
  const depositAssetOptions = Object.keys(WITHDRAWAL_NETWORKS);
  const depositFeeDetails = getDepositFeeDetails(depositAmount);
  const withdrawalFeeDetails = getWithdrawalFeeDetails(withdrawAmount);
  const withdrawalNetworkOptions = WITHDRAWAL_NETWORKS[withdrawMethod] || [];

  const openTradePreview = () => {
    navigateToTab("trade");
  };

  const navigateToTab = (tab) => {
    if (!APP_SECTION_IDS.includes(tab)) return;
    if (tab === "backend" && !isAdmin) return;

    if (tab !== "transaction-history" && transactionTypeFilter !== "all") {
      setTransactionTypeFilter("all");
    }
    setActiveTab(tab);
    if (!user?.id) return;

    try {
      globalThis.localStorage.setItem(
        `${ACTIVE_TAB_STORAGE_KEY}.${user.id}`,
        tab,
      );
      setNavigationPreferenceError("");
    } catch (err) {
      console.error("App section preference save error:", err);
      setNavigationPreferenceError(
        "Your current app section could not be saved for the next visit.",
      );
    }
  };

  const saveWatchlistPreferences = async (symbols, alerts) => {
    const userId = user?.id;
    if (
      !userId ||
      watchlistOwnerId !== userId ||
      watchlistOwnerRef.current !== userId ||
      watchlistSavingRef.current
    )
      return false;

    const pendingSave = { userId, watchlist: symbols, alerts };
    pendingWatchlistSaveRef.current = pendingSave;
    setWatchlistSavePending(true);
    watchlistSavingRef.current = true;
    watchlistSavingOwnerRef.current = userId;
    setWatchlistSaving(true);

    try {
      await saveWatchlistPreferencesToSupabase(userId, {
        watchlist: symbols,
        alerts,
      });

      if (
        currentUserIdRef.current !== userId ||
        watchlistOwnerRef.current !== userId
      )
        return false;

      watchlistSymbolsRef.current = symbols;
      priceAlertsRef.current = alerts;
      setWatchlistSymbols(symbols);
      setPriceAlerts(alerts);
      pendingWatchlistSaveRef.current = null;
      setWatchlistSavePending(false);
      setWatchlistError("");
      return true;
    } catch (err) {
      if (currentUserIdRef.current === userId) {
        console.error("Watchlist preferences save error:", err);
        setWatchlistError(
          "Could not save your watchlist or alert. Your previous saved settings are unchanged; retry to save this change.",
        );
      }
      return false;
    } finally {
      if (watchlistSavingOwnerRef.current === userId) {
        watchlistSavingRef.current = false;
        watchlistSavingOwnerRef.current = null;
      }
      if (currentUserIdRef.current === userId && !watchlistSavingRef.current) {
        setWatchlistSaving(false);
      }
    }
  };

  const retryWatchlistSave = () => {
    const pendingSave = pendingWatchlistSaveRef.current;
    if (!pendingSave || pendingSave.userId !== user?.id) return;

    saveWatchlistPreferences(pendingSave.watchlist, pendingSave.alerts);
  };

  const retryWatchlistLoad = () => {
    setWatchlistError("");
    setWatchlistLoading(true);
    setWatchlistRetryKey((key) => key + 1);
  };

  const toggleWatchlistAsset = async (symbol) => {
    if (!user?.id || watchlistOwnerId !== user.id) return;

    const nextSymbols = watchlistSymbols.includes(symbol)
      ? watchlistSymbols.filter((currentSymbol) => currentSymbol !== symbol)
      : [...watchlistSymbols, symbol];
    await saveWatchlistPreferences(nextSymbols, priceAlerts);
  };

  const handlePriceAlertSubmit = async (event) => {
    event.preventDefault();
    if (!user?.id || watchlistOwnerId !== user.id) return;

    const threshold = Number(alertThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      setWatchlistError("Enter a price threshold greater than zero.");
      return;
    }

    try {
      const id = globalThis.crypto.randomUUID();
      const nextAlerts = [
        ...priceAlerts,
        {
          id,
          symbol: alertAssetSymbol,
          condition: alertCondition,
          currency: displayCurrency,
          threshold,
          triggeredAt: null,
          triggeredPrice: null,
        },
      ];
      if (await saveWatchlistPreferences(watchlistSymbols, nextAlerts)) {
        setAlertThreshold("");
      }
    } catch (err) {
      console.error("Price alert creation error:", err);
      setWatchlistError("A price alert could not be created in this browser.");
    }
  };

  const removePriceAlert = async (alertId) => {
    if (!user?.id || watchlistOwnerId !== user.id) return;

    const nextAlerts = priceAlerts.filter((alert) => alert.id !== alertId);
    await saveWatchlistPreferences(watchlistSymbols, nextAlerts);
  };

  if (userLoading) {
    return (
      <div
        className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-zinc-400">{tx("Restoring your session…")}</p>
      </div>
    );
  }

  if (authSessionError) {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4">
        <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-4 text-center shadow-2xl">
          <h1 className="text-lg font-bold">{tx("Session unavailable")}</h1>
          <p className="text-sm text-rose-300" role="alert">
            {tx(authSessionError)}
          </p>
          <button
            type="button"
            onClick={() => {
              setUserLoading(true);
              setAuthSessionError("");
              restoreAuthSession();
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition"
          >
            {tx("Try again")}
          </button>
        </div>
      </div>
    );
  }

  if (!user && onboardingStage === "landing") {
    return (
      <LandingPage
        country={selectedCountry}
        language={selectedLanguage}
        selectedPlan={selectedPlan}
        onCountryChange={(country) =>
          updateLandingPreference("country", country)
        }
        onLanguageChange={(language) =>
          updateLandingPreference("language", language)
        }
        preferenceError={landingPreferenceError}
        onLogin={() => {
          setAuthMode("login");
          setAuthError("");
          setOnboardingStage("auth");
        }}
        onSignup={(planKey) => {
          if (planKey) {
            try {
              selectedPlanStore.select(planKey);
              setLandingPreferenceError("");
            } catch (err) {
              console.error("Selected plan save error:", err);
              setLandingPreferenceError(
                "Your selection applies for this visit but could not be saved.",
              );
            }
          }
          setAuthMode("signup");
          setAuthError("");
          setOnboardingStage("country-lang");
        }}
      />
    );
  }

  // ==========================================
  // ONBOARDING STAGE 1: COUNTRY & TRANSLATION
  // ==========================================
  if (!user && onboardingStage === "country-lang") {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <button
              type="button"
              onClick={() => setOnboardingStage("landing")}
              aria-label={tx("CoinMaster home")}
              className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 mx-auto text-lg"
            >
              {tx("CM")}
            </button>

            <h1 className="text-xl font-bold tracking-tight">
              {tx("Welcome to Coin Master")}
            </h1>

            <p className="text-xs text-zinc-400">
              {tx("Select your country and preferred language to continue")}
            </p>
            {selectedPlan && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">
                  {tx("Selected plan")}
                </p>
                <p className="mt-1 text-xs text-zinc-200">
                  {tx(selectedPlan[0].toUpperCase() + selectedPlan.slice(1))}
                  {" · "}
                  {formatCurrency(PLAN_PRICES[selectedPlan], "USD")}
                  {" / "}
                  {tx("Monthly")}
                </p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="onboarding-country"
                  className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1"
                >
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <span>{tx("Select Country")}</span>
                </label>

                <select
                  id="onboarding-country"
                  value={selectedCountry}
                  onChange={(e) =>
                    updateLandingPreference("country", e.target.value)
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country} value={country}>
                      {tx(country)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="onboarding-language"
                  className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1"
                >
                  <Languages className="w-3.5 h-3.5 text-blue-500" />
                  <span>{tx("Language Translation Preference")}</span>
                </label>

                <select
                  id="onboarding-language"
                  value={selectedLanguage}
                  onChange={(e) =>
                    updateLandingPreference("language", e.target.value)
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="English">{tx("English")}</option>
                  <option value="French">{tx("French (Français)")}</option>
                  <option value="Spanish">{tx("Spanish (Español)")}</option>
                  <option value="Portuguese">
                    {tx("Portuguese (Português)")}
                  </option>
                  <option value="German">{tx("German (Deutsch)")}</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setOnboardingStage("auth")}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-blue-600/20"
              >
                {tx("Continue")}
                <ArrowRight className="inline ml-2 w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setOnboardingStage("auth");
                }}
                className="w-full rounded-xl border border-zinc-800 py-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                {tx("Already have an account? Sign in")}
              </button>
              <button
                type="button"
                onClick={() => setOnboardingStage("landing")}
                className="block mx-auto text-xs text-blue-400 hover:text-blue-300 transition"
              >
                {tx("Back to Home")}
              </button>
              <p className="text-center text-[10px] leading-5 text-zinc-500">
                {tx(
                  "Your region and language choices are saved in this browser and included with your sign-up preferences.",
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // ONBOARDING STAGE 2: STANDALONE SIGN IN / SIGN UP
  // ==========================================
  if (
    authMode === "reset" ||
    (authMode === "signup" && authSuccess && user) ||
    (!user && onboardingStage === "auth")
  ) {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <button
              type="button"
              onClick={() => setOnboardingStage("landing")}
              aria-label={tx("CoinMaster home")}
              className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 mx-auto text-lg"
            >
              {tx("CM")}
            </button>

            <h1 className="text-xl font-bold tracking-tight">
              {authMode === "recovery"
                ? tx("Reset your password")
                : authMode === "reset"
                  ? tx("Choose a new password")
                  : authMode === "login"
                    ? tx("Sign In to Coin Master")
                    : tx("Create Account")}
            </h1>

            <p className="text-xs text-zinc-400">
              {tx("Region:")}{" "}
              <span className="text-blue-400 font-medium">
                {tx(selectedCountry)}
              </span>
              {tx(" | Lang: ")}
              <span className="text-blue-400 font-medium">
                {LANDING_LANGUAGES.find(
                  (item) => item.value === selectedLanguage,
                )?.label || selectedLanguage}
              </span>
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs text-center"
            >
              {tx(authError)}
            </div>
          )}
          {authSuccess && (
            <div
              role="status"
              className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs text-center"
            >
              {tx(authSuccess)}
            </div>
          )}

          {authMode === "reset" && authSuccess ? (
            <button
              type="button"
              onClick={returnFromPasswordReset}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition"
            >
              {tx(user ? "Continue to CoinMaster" : "Return to sign in")}
            </button>
          ) : authMode === "reset" ? (
            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-new-password"
                  className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider"
                >
                  {tx("New password")}
                </label>
                <input
                  id="auth-new-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider"
                >
                  {tx("Confirm new password")}
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={authPasswordConfirmation}
                  onChange={(event) =>
                    setAuthPasswordConfirmation(event.target.value)
                  }
                  className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 text-white font-bold py-3 rounded-xl text-xs transition"
              >
                {tx(authLoading ? "Updating password…" : "Update password")}
              </button>
              {authError && (
                <button
                  type="button"
                  onClick={beginPasswordRecovery}
                  className="block mx-auto text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {tx("Request a new reset link")}
                </button>
              )}
            </form>
          ) : authMode === "recovery" ? (
            <form onSubmit={handlePasswordRecoverySubmit} className="space-y-4">
              <p className="text-xs leading-5 text-zinc-400">
                {tx("Enter the email address associated with your account.")}
              </p>
              <div>
                <label
                  htmlFor="auth-recovery-email"
                  className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider"
                >
                  {tx("Email Address")}
                </label>
                <input
                  id="auth-recovery-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder={tx("name@example.com")}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 text-white font-bold py-3 rounded-xl text-xs transition"
              >
                {tx(authLoading ? "Sending…" : "Send reset link")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                  setAuthSuccess("");
                }}
                className="block mx-auto text-xs text-blue-400 hover:text-blue-300 transition"
              >
                {tx("Back to sign in")}
              </button>
            </form>
          ) : authSuccess && user ? (
            <button
              type="button"
              onClick={returnFromPasswordReset}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition"
            >
              {tx("Continue to CoinMaster")}
            </button>
          ) : (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider"
                >
                  {tx("Email Address")}
                </label>

                <input
                  id="auth-email"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder={tx("name@example.com")}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider"
                >
                  {tx("Password")}
                </label>

                <input
                  id="auth-password"
                  type="password"
                  required
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={tx("••••••••")}
                  className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOnboardingStage("country-lang")}
                  className="w-1/3 bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium py-3 rounded-xl hover:bg-zinc-800 transition text-xs"
                >
                  {tx("Back")}
                </button>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 text-xs"
                >
                  {tx(
                    authLoading
                      ? "Please wait…"
                      : authMode === "login"
                        ? "Sign In"
                        : "Sign Up",
                  )}
                </button>
              </div>
            </form>
          )}

          {!["recovery", "reset"].includes(authMode) &&
            !(authSuccess && user) && (
              <div className="space-y-3 text-center pt-2">
                {authMode === "login" && (
                  <button
                    type="button"
                    onClick={beginPasswordRecovery}
                    className="block mx-auto text-xs text-blue-400 hover:text-blue-300 transition"
                  >
                    {tx("Forgot password?")}
                  </button>
                )}
                {canResendConfirmation && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={authLoading || !authEmail.trim()}
                    className="block mx-auto text-xs text-blue-400 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50 transition"
                  >
                    {tx(authLoading ? "Sending…" : "Resend confirmation email")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "signup" : "login");
                    setAuthError("");
                    setAuthSuccess("");
                  }}
                  className="text-xs text-zinc-400 hover:text-blue-400 transition"
                >
                  {authMode === "login"
                    ? tx("Don't have an account? Sign Up")
                    : tx("Already have an account? Sign In")}
                </button>
              </div>
            )}
          <button
            type="button"
            onClick={() => {
              setAuthError("");
              setAuthSuccess("");
              setAuthMode("login");
              setOnboardingStage("landing");
            }}
            className="block mx-auto text-xs text-blue-400 hover:text-blue-300 transition"
          >
            {tx("Back to Home")}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // STAGE 3: MAIN APP DASHBOARD & WALLET HUB
  // ==========================================
  return (
    <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col font-sans antialiased">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {tx("Skip to main content")}
      </a>
      {/* SCROLLING TICKER TAPE */}
      <div className="w-full bg-[#12141a] border-b border-zinc-800/80 overflow-hidden py-2 select-none">
        <div className="flex w-max animate-marquee space-x-6 px-4">
          {[...marketTickers, ...marketTickers].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center space-x-3 bg-zinc-900/60 border border-zinc-800/60 px-3 py-1.5 rounded-lg text-xs hover:border-zinc-700 transition"
            >
              <span className="font-semibold text-zinc-200">{item.symbol}</span>

              <span className="text-zinc-400">
                {Number.isFinite(item.price)
                  ? formatCurrency(item.price, displayCurrency)
                  : tx("Price unavailable")}
              </span>

              <span
                className={`font-mono ${
                  item.positive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {item.change}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* HEADER BAR */}
      <header className="h-16 bg-[#12141a] border-b border-zinc-800/80 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
            aria-label={
              mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-drawer"
            className="md:hidden p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              {tx("CM")}
            </div>

            <span className="font-bold text-lg tracking-tight hidden sm:inline-block">
              {tx("Coin Master")}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Notifications Center */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`}
              aria-expanded={notificationsOpen}
              aria-controls="notifications-panel"
              className="relative p-2 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition"
            >
              <Bell className="w-5 h-5" />

              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full ring-2 ring-[#12141a]" />
              )}
            </button>

            {notificationsOpen && (
              <div
                id="notifications-panel"
                role="region"
                aria-label={tx("Notifications")}
                className="absolute right-0 mt-2 w-80 bg-[#161821] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50"
              >
                <div className="px-4 py-2 border-b border-zinc-800 flex justify-between items-center">
                  <span className="font-semibold text-sm">
                    {tx("Notifications")}
                  </span>

                  <span className="text-[10px] text-blue-400 font-mono">
                    {tx("Supabase Sync")}
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                  {notificationsLoading ? (
                    <div
                      className="p-4 text-xs text-zinc-500 text-center"
                      role="status"
                    >
                      {tx("Loading notifications…")}
                    </div>
                  ) : notificationsError ? (
                    <div
                      className="p-4 text-xs text-rose-300 text-center"
                      role="alert"
                    >
                      <p>{tx(notificationsError)}</p>
                      <button
                        type="button"
                        onClick={refreshAccountActivity}
                        className="mt-2 text-blue-400 hover:text-blue-300 underline"
                      >
                        {tx("Try again")}
                      </button>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-4 text-xs text-zinc-500 text-center">
                      {tx("No notifications found")}
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-3 hover:bg-zinc-800/40 text-xs transition"
                      >
                        <div className="font-medium text-zinc-200">
                          {tx(n.title)}
                        </div>

                        <div className="text-zinc-400 mt-0.5">
                          {tx(n.message)}
                        </div>

                        <div className="text-[10px] text-zinc-500 mt-1">
                          {formatDate(n.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <label className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-1.5 py-1.5 text-xs text-zinc-300 sm:px-2">
            <Languages
              className="hidden h-4 w-4 text-zinc-400 sm:block"
              aria-hidden="true"
            />
            <span className="sr-only">{tx("Language")}</span>
            <select
              aria-label={tx("Language")}
              value={selectedLanguage}
              onChange={(event) =>
                updateLandingPreference("language", event.target.value)
              }
              className="max-w-[68px] bg-transparent text-xs text-zinc-200 outline-none sm:max-w-[94px]"
            >
              {LANDING_LANGUAGES.map((language) => (
                <option
                  key={language.value}
                  value={language.value}
                  className="bg-[#12141a]"
                >
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              aria-label={tx("User account menu")}
              aria-expanded={userDropdownOpen}
              aria-controls="user-account-menu"
              className="flex items-center space-x-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1.5 rounded-xl transition"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold text-xs flex items-center justify-center">
                {getUserInitials()}
              </div>
              <span className="text-xs font-medium max-w-[120px] truncate hidden sm:inline-block">
                {user?.email || "User"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            {userDropdownOpen && (
              <div
                id="user-account-menu"
                className="absolute right-0 mt-2 w-64 bg-[#161821] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 text-xs"
              >
                <div className="px-4 py-2.5 border-b border-zinc-800">
                  <p className="text-zinc-400">{tx("Signed in as")}</p>
                  <p className="font-medium text-zinc-100 truncate mt-0.5">
                    {user?.email}
                  </p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      navigateToTab("wallet");
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-zinc-300 hover:bg-zinc-800/60 flex items-center space-x-2"
                  >
                    <Wallet className="w-4 h-4 text-zinc-400" />
                    <span>{tx("Wallet & Balance")}</span>
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>{tx("Sign Out")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {landingPreferenceError && (
        <p className="px-4 py-2 text-xs text-amber-300" role="status">
          {tx(landingPreferenceError)}
        </p>
      )}

      {mobileMenuOpen && (
        <>
          <button
            type="button"
            aria-label={tx("Close navigation menu")}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/60 md:hidden"
          />
          <aside
            id="mobile-navigation-drawer"
            ref={mobileNavigationRef}
            role="dialog"
            aria-modal="true"
            aria-label={tx("Mobile navigation")}
            className="fixed bottom-0 left-0 top-16 z-50 flex w-80 max-w-[85vw] flex-col border-r border-zinc-800 bg-[#12141a] shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
              <h2 className="text-sm font-semibold">{tx("Navigation")}</h2>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={tx("Close navigation menu")}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav
              aria-label={tx("Mobile app sections")}
              className="flex-1 space-y-1 overflow-y-auto p-3"
            >
              {[
                { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                { id: "wallet", label: "Wallet", icon: Wallet },
                ...(isAdmin
                  ? [{ id: "backend", label: "Backend", icon: Settings }]
                  : []),
                { id: "markets", label: "Markets", icon: BarChart3 },
                { id: "trade", label: "Trade", icon: LineChart },
                {
                  id: "transaction-history",
                  label: "Transaction History",
                  icon: History,
                },
                { id: "investments", label: "Investments", icon: TrendingUp },
                { id: "mining", label: "Mining", icon: Pickaxe },
                {
                  id: "watchlist",
                  label: "Watchlist & Price Alerts",
                  icon: Star,
                },
                { id: "portfolio", label: "Portfolio", icon: PieChart },
                { id: "support", label: "Help & Support", icon: HelpCircle },
              ].map((item) => {
                const IconComp = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigateToTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? "border border-blue-500/30 bg-blue-600/20 text-blue-300"
                        : "text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
                    }`}
                  >
                    <IconComp className="h-5 w-5 shrink-0" />
                    <span>{tx(item.label)}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-zinc-800 p-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleSignOut();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-rose-400 transition hover:bg-rose-500/10"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span>{tx("Sign Out")}</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* BODY LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* DESKTOP SIDEBAR */}
        <aside
          className={`${
            sidebarCollapsed ? "w-20" : "w-64"
          } bg-[#12141a] border-r border-zinc-800/80 flex-col justify-between transition-all duration-200 hidden md:flex`}
        >
          <div className="p-4 space-y-6">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-end text-zinc-400 hover:text-white p-1"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>

            <nav className="space-y-6">
              <div>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">
                    {tx("Main")}
                  </p>
                )}
                <div className="space-y-1">
                  <button
                    onClick={() => navigateToTab("dashboard")}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === "dashboard"
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                    }`}
                  >
                    <LayoutDashboard className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>{tx("Dashboard")}</span>}
                  </button>

                  <button
                    onClick={() => navigateToTab("wallet")}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === "wallet"
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                    }`}
                  >
                    <Wallet className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>{tx("Wallet")}</span>}
                  </button>
                </div>
              </div>

              {isAdmin && (
                <div>
                  {!sidebarCollapsed && (
                    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      {tx("Administration")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigateToTab("backend")}
                    aria-current={activeTab === "backend" ? "page" : undefined}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === "backend"
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                    }`}
                  >
                    <Settings className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>{tx("Backend")}</span>}
                  </button>
                </div>
              )}

              <div>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">
                    {tx("Trading & Investing")}
                  </p>
                )}
                {currencyPreferenceError && (
                  <p className="text-xs text-amber-300" role="status">
                    {tx(currencyPreferenceError)}
                  </p>
                )}
                <div className="space-y-1">
                  {[
                    { id: "markets", label: "Markets", icon: BarChart3 },
                    { id: "trade", label: "Trade", icon: LineChart },
                    {
                      id: "transaction-history",
                      label: "Transaction History",
                      icon: History,
                    },
                    {
                      id: "investments",
                      label: "Investments",
                      icon: TrendingUp,
                    },
                    { id: "mining", label: "Mining", icon: Pickaxe },
                    {
                      id: "watchlist",
                      label: "Watchlist & Alerts",
                      icon: Star,
                    },
                  ].map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigateToTab(item.id)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                          activeTab === item.id
                            ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                        }`}
                      >
                        <IconComp className="w-5 h-5 shrink-0" />
                        {!sidebarCollapsed && <span>{tx(item.label)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">
                    {tx("Account & Support")}
                  </p>
                )}
                <div className="space-y-1">
                  <button
                    onClick={() => navigateToTab("portfolio")}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === "portfolio"
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                    }`}
                  >
                    <PieChart className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>{tx("Portfolio")}</span>}
                  </button>

                  <button
                    onClick={() => navigateToTab("support")}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === "support"
                        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                    }`}
                  >
                    <HelpCircle className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>{tx("Help & Support")}</span>}
                  </button>
                </div>
              </div>
            </nav>
          </div>

          <div className="p-4 border-t border-zinc-800/80">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs text-rose-400 hover:bg-rose-500/10 transition"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{tx("Sign Out")}</span>}
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
        >
          {navigationPreferenceError && (
            <p
              className="mx-auto max-w-7xl text-xs text-amber-300"
              role="status"
            >
              {tx(navigationPreferenceError)}
            </p>
          )}
          {activeTab === "backend" && isAdmin && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-xl font-bold">{tx("Backend")}</h1>
                  <p className="mt-1 text-xs text-zinc-400">
                    {tx("Financial request administration")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBackendRefreshKey((key) => key + 1)}
                  disabled={backendLoading}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {backendLoading ? tx("Loading…") : tx("Refresh Backend")}
                </button>
              </div>

              {backendError && (
                <p
                  className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-rose-200"
                  role="alert"
                >
                  {tx(backendError)}
                </p>
              )}
              {backendActionMessage && (
                <p
                  className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200"
                  role="status"
                >
                  {tx(backendActionMessage)}
                </p>
              )}

              <nav
                aria-label={tx("Backend sections")}
                className="flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-[#12141a] p-3"
              >
                {[
                  ["overview", "Overview"],
                  ["withdrawals", "Withdrawal Requests"],
                  ["deposits", "Deposit Requests"],
                  ["history", "Processing History"],
                ].map(([section, label]) => (
                  <button
                    key={section}
                    type="button"
                    aria-current={
                      backendSection === section ? "page" : undefined
                    }
                    onClick={() => {
                      setBackendSection(section);
                      setBackendStatusFilter("all");
                      setBackendActionMessage("");
                      setBackendOffset(0);
                    }}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                      backendSection === section
                        ? "bg-blue-600 text-white"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    {tx(label)}
                  </button>
                ))}
              </nav>

              {backendOverview && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    [
                      "Pending withdrawals",
                      backendOverview.pending_withdrawals,
                    ],
                    ["Pending deposits", backendOverview.pending_deposits],
                    [
                      "Processing requests",
                      backendOverview.processing_requests,
                    ],
                    ["Recent decisions", backendOverview.recent_decisions],
                  ].map(([label, count]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-zinc-800 bg-[#12141a] p-4"
                    >
                      <p className="text-xs text-zinc-400">{tx(label)}</p>
                      <p className="mt-2 text-2xl font-semibold text-zinc-100">
                        {Number(count) || 0}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {backendSection === "overview" && (
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">{tx("Recent requests")}</h2>
                    {backendLoading && (
                      <span className="text-xs text-zinc-400" role="status">
                        {tx("Loading…")}
                      </span>
                    )}
                  </div>
                  {backendRequests.length === 0 && !backendLoading ? (
                    <p className="mt-4 text-sm text-zinc-400">
                      {tx("No financial requests found.")}
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-zinc-800">
                      {backendRequests.map((request) => (
                        <li
                          key={`${request.request_kind}-${request.request_id}`}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                        >
                          <div>
                            <p className="font-medium text-zinc-100">
                              {tx(
                                request.request_kind === "withdrawal"
                                  ? "Withdrawal"
                                  : "Deposit",
                              )}{" "}
                              · {request.asset} ·{" "}
                              {formatFinancialAmount(request.amount)}
                            </p>
                            <p className="mt-1 text-zinc-500">
                              {request.user_name} ·{" "}
                              {formatDateTime(request.created_at)}
                            </p>
                          </div>
                          {renderTransactionStatusBadge(request.status, tx)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setBackendSection("withdrawals")}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      {tx("Withdrawal Requests")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBackendSection("deposits")}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      {tx("Deposit Requests")}
                    </button>
                  </div>
                </div>
              )}

              {["withdrawals", "deposits"].includes(backendSection) && (
                <div className="space-y-4">
                  <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-[#12141a] p-4 sm:grid-cols-[1fr_auto_auto]">
                    <label className="sr-only" htmlFor="backend-search">
                      {tx("Search requests")}
                    </label>
                    <input
                      id="backend-search"
                      type="search"
                      value={backendSearch}
                      onChange={(event) => {
                        setBackendSearch(event.target.value);
                        setBackendOffset(0);
                      }}
                      placeholder={tx(
                        "Search by user, account, asset, address, or reference",
                      )}
                      className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                    />
                    <label className="sr-only" htmlFor="backend-status">
                      {tx("Filter by status")}
                    </label>
                    <select
                      id="backend-status"
                      value={backendStatusFilter}
                      onChange={(event) => {
                        setBackendStatusFilter(event.target.value);
                        setBackendOffset(0);
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                    >
                      {[
                        "all",
                        "pending",
                        "approved",
                        "declined",
                        "processing",
                        "completed",
                        "failed",
                        "verified",
                        "rejected",
                      ].map((status) => (
                        <option key={status} value={status}>
                          {tx(status === "all" ? "All statuses" : status)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setBackendRefreshKey((key) => key + 1)}
                      disabled={backendLoading}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {tx("Search")}
                    </button>
                  </div>

                  {backendLoading && backendRequests.length === 0 ? (
                    <p
                      className="rounded-xl border border-zinc-800 bg-[#12141a] p-5 text-sm text-zinc-400"
                      role="status"
                    >
                      {tx("Loading financial requests…")}
                    </p>
                  ) : backendRequests.length === 0 ? (
                    <p className="rounded-xl border border-zinc-800 bg-[#12141a] p-5 text-sm text-zinc-400">
                      {tx("No financial requests found.")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {backendRequests.map((request) => (
                        <li
                          key={`${request.request_kind}-${request.request_id}`}
                          className="rounded-2xl border border-zinc-800 bg-[#12141a] p-4 sm:p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-zinc-100">
                                {request.user_name}{" "}
                                <span className="font-normal text-zinc-400">
                                  · {request.asset} ·{" "}
                                  {formatFinancialAmount(request.amount)}
                                </span>
                              </p>
                              <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">
                                {request.user_id}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {renderTransactionStatusBadge(request.status, tx)}
                              <span className="text-[10px] text-zinc-500">
                                {formatDateTime(request.created_at)}
                              </span>
                            </div>
                          </div>
                          <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
                            <div>
                              <dt className="text-zinc-500">
                                {tx("Account email")}
                              </dt>
                              <dd className="mt-1 break-all text-zinc-200">
                                {request.user_email}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-zinc-500">
                                {tx("Request ID")}
                              </dt>
                              <dd className="mt-1 break-all font-mono text-zinc-300">
                                {request.request_id}
                              </dd>
                            </div>
                            {request.request_kind === "withdrawal" && (
                              <>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("Withdrawal amount")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {formatFinancialAmount(request.amount)}{" "}
                                    {request.asset}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("CoinMaster withdrawal fee (0%)")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {formatFinancialAmount(0)} {request.asset}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("Net withdrawal amount")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {formatFinancialAmount(request.amount)}{" "}
                                    {request.asset}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("Network")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {request.network}
                                  </dd>
                                </div>
                                <div className="sm:col-span-2 xl:col-span-3">
                                  <dt className="text-zinc-500">
                                    {tx("Destination address")}
                                  </dt>
                                  <dd className="mt-1 break-all font-mono text-zinc-200">
                                    {request.destination_address}
                                  </dd>
                                </div>
                              </>
                            )}
                            {request.request_kind === "deposit" && (
                              <>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("Deposit amount")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {formatFinancialAmount(request.amount)}{" "}
                                    {request.asset}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("CoinMaster processing fee (7%)")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {formatFinancialAmount(request.fee_amount)}{" "}
                                    {request.asset}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-zinc-500">
                                    {tx("Net deposit amount")}
                                  </dt>
                                  <dd className="mt-1 text-zinc-200">
                                    {formatFinancialAmount(request.net_amount)}{" "}
                                    {request.asset}
                                  </dd>
                                </div>
                              </>
                            )}
                            {request.admin_name && (
                              <div>
                                <dt className="text-zinc-500">
                                  {tx("Reviewed by")}
                                </dt>
                                <dd className="mt-1 text-zinc-200">
                                  {request.admin_name}{" "}
                                  {request.admin_email
                                    ? `(${request.admin_email})`
                                    : ""}
                                </dd>
                              </div>
                            )}
                            {request.decision_reason && (
                              <div className="sm:col-span-2 xl:col-span-3">
                                <dt className="text-zinc-500">
                                  {tx("Decision reason")}
                                </dt>
                                <dd className="mt-1 whitespace-pre-wrap text-zinc-200">
                                  {request.decision_reason}
                                </dd>
                              </div>
                            )}
                          </dl>

                          {request.status === "pending" &&
                            request.request_kind === "withdrawal" && (
                              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBackendRequestAction(
                                      request,
                                      "approve",
                                    )
                                  }
                                  disabled={
                                    backendBusyRequestId === request.request_id
                                  }
                                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                                >
                                  {backendBusyRequestId === request.request_id
                                    ? tx("Processing…")
                                    : tx("Approve")}
                                </button>
                                {backendDeclineId === request.request_id ? (
                                  <form
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      handleBackendRequestAction(
                                        request,
                                        "decline",
                                      );
                                    }}
                                    className="flex min-w-full flex-col gap-2 sm:min-w-0 sm:flex-row"
                                  >
                                    <label
                                      className="sr-only"
                                      htmlFor={`decline-reason-${request.request_id}`}
                                    >
                                      {tx("Decline reason")}
                                    </label>
                                    <input
                                      id={`decline-reason-${request.request_id}`}
                                      required
                                      maxLength={1000}
                                      value={backendDeclineReason}
                                      onChange={(event) =>
                                        setBackendDeclineReason(
                                          event.target.value,
                                        )
                                      }
                                      placeholder={tx("Enter decline reason")}
                                      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                                    />
                                    <button
                                      type="submit"
                                      disabled={
                                        backendBusyRequestId ===
                                        request.request_id
                                      }
                                      className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                                    >
                                      {tx("Confirm decline")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBackendDeclineId(null);
                                        setBackendDeclineReason("");
                                      }}
                                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300"
                                    >
                                      {tx("Cancel")}
                                    </button>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBackendDeclineId(request.request_id);
                                      setBackendDeclineReason("");
                                    }}
                                    className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                                  >
                                    {tx("Decline")}
                                  </button>
                                )}
                              </div>
                            )}
                          {request.request_kind === "deposit" &&
                            request.status === "pending" && (
                              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBackendRequestAction(
                                      request,
                                      "approve",
                                    )
                                  }
                                  disabled={
                                    backendBusyRequestId === request.request_id
                                  }
                                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                                >
                                  {backendBusyRequestId === request.request_id
                                    ? tx("Processing…")
                                    : tx("Approve")}
                                </button>
                                {backendDeclineId === request.request_id ? (
                                  <form
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      handleBackendRequestAction(
                                        request,
                                        "decline",
                                      );
                                    }}
                                    className="flex min-w-full flex-col gap-2 sm:min-w-0 sm:flex-row"
                                  >
                                    <label
                                      className="sr-only"
                                      htmlFor={`deposit-decline-reason-${request.request_id}`}
                                    >
                                      {tx("Decline reason")}
                                    </label>
                                    <input
                                      id={`deposit-decline-reason-${request.request_id}`}
                                      required
                                      maxLength={1000}
                                      value={backendDeclineReason}
                                      onChange={(event) =>
                                        setBackendDeclineReason(
                                          event.target.value,
                                        )
                                      }
                                      placeholder={tx("Enter decline reason")}
                                      className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                                    />
                                    <button
                                      type="submit"
                                      disabled={
                                        backendBusyRequestId ===
                                        request.request_id
                                      }
                                      className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                                    >
                                      {tx("Confirm decline")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBackendDeclineId(null);
                                        setBackendDeclineReason("");
                                      }}
                                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300"
                                    >
                                      {tx("Cancel")}
                                    </button>
                                  </form>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBackendDeclineId(request.request_id);
                                      setBackendDeclineReason("");
                                    }}
                                    className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                                  >
                                    {tx("Decline")}
                                  </button>
                                )}
                              </div>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {backendHasMore && (
                    <button
                      type="button"
                      onClick={loadMoreBackendRequests}
                      disabled={backendLoading}
                      className="w-full rounded-xl border border-zinc-700 py-3 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {backendLoading
                        ? tx("Loading…")
                        : tx("Load more requests")}
                    </button>
                  )}
                </div>
              )}

              {backendSection === "history" && (
                <div className="space-y-4">
                  <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-[#12141a] p-4 sm:grid-cols-[1fr_auto_auto]">
                    <label className="sr-only" htmlFor="backend-history-search">
                      {tx("Search history")}
                    </label>
                    <input
                      id="backend-history-search"
                      type="search"
                      value={backendSearch}
                      onChange={(event) => setBackendSearch(event.target.value)}
                      placeholder={tx(
                        "Search users, admins, references, or reasons",
                      )}
                      className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                    />
                    <label className="sr-only" htmlFor="backend-history-kind">
                      {tx("Request type")}
                    </label>
                    <select
                      id="backend-history-kind"
                      value={backendRequestKind}
                      onChange={(event) =>
                        setBackendRequestKind(event.target.value)
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                    >
                      <option value="all">{tx("All types")}</option>
                      <option value="withdrawal">{tx("Withdrawal")}</option>
                      <option value="deposit">{tx("Deposit")}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setBackendRefreshKey((key) => key + 1)}
                      disabled={backendLoading}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {tx("Search")}
                    </button>
                  </div>
                  {backendHistory.length === 0 && !backendLoading ? (
                    <p className="rounded-xl border border-zinc-800 bg-[#12141a] p-5 text-sm text-zinc-400">
                      {tx("No processing history found.")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {backendHistory.map((event) => (
                        <li
                          key={
                            event.action_id ||
                            `${event.request_id}-${event.action}-${event.created_at}`
                          }
                          className="rounded-xl border border-zinc-800 bg-[#12141a] p-4"
                        >
                          <div className="flex flex-wrap justify-between gap-2 text-xs">
                            <p className="font-semibold text-zinc-100">
                              {tx(
                                event.request_kind === "withdrawal"
                                  ? "Withdrawal"
                                  : "Deposit",
                              )}{" "}
                              ·{" "}
                              {tx(
                                event.action
                                  .replaceAll("_", " ")
                                  .replace(/^\w/, (letter) =>
                                    letter.toUpperCase(),
                                  ),
                              )}
                            </p>
                            <time
                              dateTime={event.created_at}
                              className="text-zinc-500"
                            >
                              {formatDateTime(event.created_at)}
                            </time>
                          </div>
                          <p className="mt-2 text-xs text-zinc-300">
                            {event.user_name} · {event.asset || "—"} ·{" "}
                            {event.amount === null
                              ? "—"
                              : `${formatAssetAmount(event.amount)} ${event.asset}`}
                          </p>
                          <p className="mt-1 break-all text-[10px] text-zinc-500">
                            {tx("Request ID")}: {event.request_id}
                          </p>
                          {event.actor_name && (
                            <p className="mt-2 text-xs text-zinc-400">
                              {tx("Admin")}: {event.actor_name}{" "}
                              {event.actor_email
                                ? `(${event.actor_email})`
                                : ""}
                            </p>
                          )}
                          {event.reason && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-amber-200">
                              {tx("Decision reason")}: {event.reason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {backendLoading && (
                <p className="text-xs text-zinc-500" role="status">
                  {tx("Loading Backend data…")}
                </p>
              )}
            </section>
          )}
          {activeTab === "dashboard" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* TOP MARKETS */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="font-semibold text-base">
                      {tx("Crypto prices")}
                    </h2>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {tx("Public prices via CoinGecko")}
                      {pricesUpdatedAt
                        ? ` · Updated ${pricesUpdatedAt.toLocaleTimeString()}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => navigateToTab("markets")}
                    className="text-xs text-blue-400 hover:underline font-medium"
                  >
                    {tx("More markets →")}
                  </button>
                </div>
                {priceError && (
                  <p className="mb-3 text-xs text-amber-300" role="status">
                    {pricesUpdatedAt
                      ? tx(
                          `Price refresh failed; showing the last successful prices. ${priceError}`,
                        )
                      : tx(`Prices are unavailable. ${priceError}`)}
                    <button
                      type="button"
                      onClick={() => setPriceRefreshKey((key) => key + 1)}
                      className="ml-2 underline"
                    >
                      {tx("Retry")}
                    </button>
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {marketTickers.map((m) => (
                    <div
                      key={m.id}
                      className="bg-[#161821] border border-zinc-800/60 rounded-xl p-3.5 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-sm">{m.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {m.symbol}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold">
                          {Number.isFinite(m.price)
                            ? formatCurrency(m.price, displayCurrency)
                            : priceLoading
                              ? tx("Loading…")
                              : tx("Unavailable")}
                        </div>
                        {Number.isFinite(m.price) && (
                          <div
                            className={`text-xs font-mono mt-0.5 ${m.positive ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {m.change}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RECENT TRANSACTIONS SNAPSHOT (Separate from Wallet Section Ledger) */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-base">
                    {tx("Recent Transactions (Quick View)")}
                  </h2>
                  <button
                    onClick={() => navigateToTab("transaction-history")}
                    className="text-xs text-blue-400 hover:underline font-medium"
                  >
                    {tx("View Transaction History →")}
                  </button>
                </div>
                {transactionsLoading ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    {tx("Loading Supabase records...")}
                  </div>
                ) : transactionsError ? (
                  <div
                    className="py-8 text-center text-xs text-rose-300"
                    role="alert"
                  >
                    <p>{tx(transactionsError)}</p>
                    <button
                      type="button"
                      onClick={refreshAccountActivity}
                      className="mt-2 text-blue-400 hover:text-blue-300 underline"
                    >
                      {tx("Try again")}
                    </button>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    {tx("No transaction records in database")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500">
                          <th className="pb-3 font-medium">{tx("Type")}</th>
                          <th className="pb-3 font-medium">{tx("Amount")}</th>
                          <th className="pb-3 font-medium">{tx("Status")}</th>
                          <th className="pb-3 font-medium">{tx("Date")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {transactions.slice(0, 4).map((transaction) => (
                          <tr key={transaction.id}>
                            <td className="py-3 font-medium text-zinc-200 capitalize">
                              {tx(transaction.type.replaceAll("_", " "))}
                            </td>
                            <td className="py-3 font-mono">
                              {formatAssetAmount(transaction.amount)}
                            </td>
                            <td className="py-3">
                              {renderTransactionStatusBadge(
                                transaction.status,
                                tx,
                              )}
                            </td>
                            <td className="py-3 text-zinc-500">
                              {formatDate(transaction.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* PRICE REFERENCE AND TRADE PREVIEW ENTRY */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-base">
                      {selectedAsset.symbol} / {displayCurrency}
                    </span>
                    <span className="text-emerald-400 font-mono text-sm">
                      {formatCurrency(
                        getCryptoPrice(
                          cryptoPrices,
                          selectedAsset.symbol,
                          currencyKey,
                        ),
                        displayCurrency,
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => setHideChart(!hideChart)}
                    className="text-xs bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white"
                  >
                    {hideChart ? tx("Show chart") : tx("Hide chart")}
                  </button>
                </div>

                {!hideChart && (
                  <div className="h-48 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-center text-xs text-zinc-600 font-mono">
                    {tx(
                      "Public price reference only. Price history chart unavailable.",
                    )}
                  </div>
                )}

                <div className="bg-[#161821] border border-zinc-800/80 rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-900 rounded-lg">
                    {["buy", "sell", "convert"].map((act) => (
                      <button
                        key={act}
                        onClick={() => setTradeAction(act)}
                        className={`py-2 rounded-md font-semibold text-xs capitalize transition ${
                          tradeAction === act
                            ? "bg-emerald-500 text-zinc-950 shadow"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {act}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="trade-quick-quantity"
                        className="text-[10px] text-zinc-400 font-medium uppercase"
                      >
                        {tradeAction === "convert"
                          ? `${tx("From asset")}: ${selectedAsset.symbol}`
                          : `${selectedAsset.symbol} ${tx("quantity")}`}
                      </label>
                      <input
                        id="trade-quick-quantity"
                        type="number"
                        min="0"
                        step="any"
                        placeholder={tx("0")}
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 font-medium uppercase">
                        {tx(
                          tradeAction === "convert"
                            ? "Estimated receive"
                            : "Estimated value",
                        )}
                        {tradeAction !== "convert" && ` · ${displayCurrency}`}
                      </p>
                      <p
                        aria-live="polite"
                        aria-atomic="true"
                        className="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-white"
                      >
                        {tradeAction === "convert"
                          ? conversionEstimate === null
                            ? Number.isFinite(parsedTradeAmount) &&
                              parsedTradeAmount > 0
                              ? tx("Price unavailable")
                              : tx("Enter a valid amount")
                            : `${formatAssetAmount(conversionEstimate)} ${selectedDestinationAsset.symbol}`
                          : tradeEstimate === null
                            ? tx("Enter a quantity to estimate")
                            : formatCurrency(tradeEstimate, displayCurrency)}
                      </p>
                    </div>
                  </div>
                  {tradeAction === "convert" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="trade-quick-destination"
                          className="text-[10px] text-zinc-400 font-medium uppercase"
                        >
                          {tx("To asset")}
                        </label>
                        <select
                          id="trade-quick-destination"
                          value={selectedDestinationAsset.symbol}
                          onChange={(event) => {
                            const asset = PRICED_CRYPTO_ASSETS.find(
                              (candidate) =>
                                candidate.symbol === event.target.value,
                            );
                            if (asset) {
                              setSelectedDestinationAsset({
                                symbol: asset.symbol,
                                name: asset.name,
                              });
                            }
                          }}
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                        >
                          {PRICED_CRYPTO_ASSETS.map((asset) => (
                            <option
                              key={asset.id}
                              value={asset.symbol}
                              disabled={asset.symbol === selectedAsset.symbol}
                            >
                              {asset.name} ({asset.symbol})
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="self-end text-[10px] text-zinc-500">
                        {tx("Reference price")} · {selectedAsset.symbol}:{" "}
                        {formatCurrency(selectedAssetPrice, displayCurrency)}
                        {" · "}
                        {selectedDestinationAsset.symbol}:{" "}
                        {formatCurrency(
                          selectedDestinationAssetPrice,
                          displayCurrency,
                        )}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={openTradePreview}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition text-xs"
                  >
                    {tx("View estimate")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "markets" && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">{tx("Crypto markets")}</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  {tx("Public reference prices from CoinGecko in")}{" "}
                  {displayCurrency}.
                  {pricesUpdatedAt
                    ? ` ${tx("Last updated")} ${formatDateTime(pricesUpdatedAt)}.`
                    : tx(" Waiting for the first price update.")}
                </p>
              </div>
              {priceError && (
                <div
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200"
                  role="status"
                >
                  <p>{tx(priceError)}</p>
                  <button
                    type="button"
                    onClick={() => setPriceRefreshKey((key) => key + 1)}
                    className="mt-2 underline"
                  >
                    {tx("Retry price update")}
                  </button>
                </div>
              )}
              <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#12141a]">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-3 font-medium">{tx("Asset")}</th>
                      <th className="px-4 py-3 text-right font-medium">
                        {tx("Price")}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {tx("24h change")}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {tx("Action")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {PRICED_CRYPTO_ASSETS.map((asset) => {
                      const quote = cryptoPrices[asset.id]?.[displayCurrency];
                      return (
                        <tr key={asset.id}>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-zinc-100">
                              {asset.name}
                            </p>
                            <p className="mt-1 text-zinc-500">{asset.symbol}</p>
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-zinc-200">
                            {quote
                              ? formatCurrency(quote.price, displayCurrency)
                              : priceLoading
                                ? tx("Loading…")
                                : tx("Unavailable")}
                          </td>
                          <td
                            className={`px-4 py-4 text-right font-mono ${
                              quote?.change === null ||
                              quote?.change === undefined
                                ? "text-zinc-500"
                                : quote.change >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                            }`}
                          >
                            {quote?.change === null ||
                            quote?.change === undefined
                              ? tx("Unavailable")
                              : `${quote.change >= 0 ? "+" : ""}${formatNumber(
                                  Math.abs(quote.change),
                                  appLocale,
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}%`}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAsset({
                                  symbol: asset.symbol,
                                  name: asset.name,
                                });
                                navigateToTab("trade");
                              }}
                              className="rounded-lg border border-blue-500/30 px-3 py-2 text-blue-300 hover:bg-blue-500/10"
                            >
                              {tx("View")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "trade" && (
            <section className="mx-auto max-w-3xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">{tx("Trade")}</h1>
              </div>
              <div className="space-y-5 rounded-2xl border border-zinc-800 bg-[#12141a] p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="trade-action"
                      className="text-xs text-zinc-400"
                    >
                      {tx("Trade type")}
                    </label>
                    <select
                      id="trade-action"
                      value={tradeAction}
                      onChange={(event) => setTradeAction(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      {["buy", "sell", "convert"].map((action) => (
                        <option key={action} value={action}>
                          {tx(action).replace(/^./, (letter) =>
                            letter.toUpperCase(),
                          )}{" "}
                          {tx("estimate")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="trade-asset"
                      className="text-xs text-zinc-400"
                    >
                      {tx(tradeAction === "convert" ? "From asset" : "Asset")}
                    </label>
                    <select
                      id="trade-asset"
                      value={selectedAsset.symbol}
                      onChange={(event) => {
                        const asset = PRICED_CRYPTO_ASSETS.find(
                          (candidate) =>
                            candidate.symbol === event.target.value,
                        );
                        if (asset) {
                          setSelectedAsset({
                            symbol: asset.symbol,
                            name: asset.name,
                          });
                          if (
                            asset.symbol === selectedDestinationAsset.symbol
                          ) {
                            const nextDestination = PRICED_CRYPTO_ASSETS.find(
                              (candidate) => candidate.symbol !== asset.symbol,
                            );
                            setSelectedDestinationAsset({
                              symbol: nextDestination.symbol,
                              name: nextDestination.name,
                            });
                          }
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      {PRICED_CRYPTO_ASSETS.map((asset) => (
                        <option
                          key={asset.id}
                          value={asset.symbol}
                          disabled={
                            tradeAction === "convert" &&
                            asset.symbol === selectedDestinationAsset.symbol
                          }
                        >
                          {asset.name} ({asset.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  {tradeAction === "convert" && (
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="trade-destination-asset"
                        className="text-xs text-zinc-400"
                      >
                        {tx("To asset")}
                      </label>
                      <select
                        id="trade-destination-asset"
                        value={selectedDestinationAsset.symbol}
                        onChange={(event) => {
                          const asset = PRICED_CRYPTO_ASSETS.find(
                            (candidate) =>
                              candidate.symbol === event.target.value,
                          );
                          if (asset) {
                            setSelectedDestinationAsset({
                              symbol: asset.symbol,
                              name: asset.name,
                            });
                          }
                        }}
                        className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                      >
                        {PRICED_CRYPTO_ASSETS.map((asset) => (
                          <option
                            key={asset.id}
                            value={asset.symbol}
                            disabled={asset.symbol === selectedAsset.symbol}
                          >
                            {asset.name} ({asset.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="trade-quantity"
                    className="text-xs text-zinc-400"
                  >
                    {tx("Asset quantity")}
                  </label>
                  <input
                    id="trade-quantity"
                    type="number"
                    min="0"
                    step="any"
                    value={tradeAmount}
                    onChange={(event) => setTradeAmount(event.target.value)}
                    placeholder={tx("Enter an amount")}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 font-mono text-xs text-white"
                  />
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-zinc-400">
                      {tx("Reference price")}
                    </span>
                    <span className="font-mono text-zinc-200">
                      {formatCurrency(selectedAssetPrice, displayCurrency)}
                    </span>
                  </div>
                  {tradeAction === "convert" && (
                    <div className="mt-3 flex items-center justify-between gap-4 text-xs">
                      <span className="text-zinc-400">
                        {tx("To asset")} · {selectedDestinationAsset.symbol}
                      </span>
                      <span className="font-mono text-zinc-200">
                        {formatCurrency(
                          selectedDestinationAssetPrice,
                          displayCurrency,
                        )}
                      </span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-4 border-t border-zinc-800 pt-3">
                    <span className="text-zinc-400">
                      {tx(
                        tradeAction === "convert"
                          ? "Estimated receive"
                          : "Estimated value",
                      )}
                    </span>
                    <span
                      aria-live="polite"
                      aria-atomic="true"
                      className="font-mono font-semibold text-zinc-100"
                    >
                      {tradeAction === "convert"
                        ? conversionEstimate === null
                          ? Number.isFinite(parsedTradeAmount) &&
                            parsedTradeAmount > 0
                            ? tx("Price unavailable")
                            : tx("Enter a valid amount")
                          : `${formatAssetAmount(conversionEstimate)} ${selectedDestinationAsset.symbol}`
                        : tradeEstimate === null
                          ? tx("Enter quantity and wait for a price")
                          : formatCurrency(tradeEstimate, displayCurrency)}
                    </span>
                  </div>
                  {pricesUpdatedAt && (
                    <p className="mt-3 text-[10px] text-zinc-500">
                      {tx("Price updated")} {formatDateTime(pricesUpdatedAt)}.
                    </p>
                  )}
                </div>
                {priceError && (
                  <p className="text-xs text-amber-300" role="status">
                    {tx(priceError)}{" "}
                    <button
                      type="button"
                      onClick={() => setPriceRefreshKey((key) => key + 1)}
                      className="underline"
                    >
                      {tx("Retry")}
                    </button>
                  </p>
                )}
              </div>
            </section>
          )}

          {activeTab === "transaction-history" && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-xl font-bold">
                    {tx("Transaction History")}
                  </h1>
                  <p className="mt-1 text-xs text-zinc-400">
                    {tx("Account transactions ordered from newest to oldest.")}
                  </p>
                  {transactionsHaveMore && (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {tx("Showing transactions loaded so far.")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor="transaction-type-filter"
                      className="block text-[10px] text-zinc-400"
                    >
                      {tx("Type")}
                    </label>
                    <select
                      id="transaction-type-filter"
                      value={transactionTypeFilter}
                      onChange={(event) =>
                        setTransactionTypeFilter(event.target.value)
                      }
                      className="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                    >
                      <option value="all">{tx("All types")}</option>
                      {transactionTypes.map((type) => (
                        <option key={tx(type)} value={type}>
                          {tx(type.replaceAll("_", " "))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={refreshAccountActivity}
                    disabled={transactionsLoading}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {transactionsLoading
                      ? tx("Refreshing…")
                      : tx("Refresh history")}
                  </button>
                </div>
              </div>

              {transactionsError ? (
                <div
                  className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-xs text-rose-200"
                  role="alert"
                >
                  <p>{tx(transactionsError)}</p>
                  <button
                    type="button"
                    onClick={refreshAccountActivity}
                    className="mt-3 underline"
                  >
                    {tx("Retry transaction history")}
                  </button>
                </div>
              ) : transactionsLoading && transactions.length === 0 ? (
                <p
                  className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400"
                  role="status"
                >
                  {tx("Loading transaction history…")}
                </p>
              ) : transactions.length === 0 &&
                transactionTypeFilter !== "all" ? (
                <p className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400">
                  {tx("No transactions match this type.")}
                </p>
              ) : transactions.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400">
                  {tx("No transaction records are available for this account.")}
                </p>
              ) : visibleTransactions.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400">
                  {tx("No transactions match this type.")}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#12141a]">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-4 py-3 font-medium">{tx("Type")}</th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Amount")}
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Status")}
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Date")}
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Reference")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {visibleTransactions.map((transaction) => {
                        const isExpanded =
                          expandedTransactionId === transaction.id;
                        const dateValue = Date.parse(transaction.created_at);
                        const formattedDate = Number.isNaN(dateValue)
                          ? tx("Date unavailable")
                          : formatDateTime(dateValue);
                        const detailsId = `transaction-details-${transaction.id}`;

                        return (
                          <React.Fragment key={transaction.id}>
                            <tr>
                              <td className="px-4 py-4 font-medium capitalize text-zinc-200">
                                <button
                                  type="button"
                                  aria-expanded={isExpanded}
                                  aria-controls={detailsId}
                                  aria-label={tx(
                                    isExpanded
                                      ? "Hide transaction details"
                                      : "Expand transaction details",
                                  )}
                                  onClick={() =>
                                    setExpandedTransactionId(
                                      isExpanded ? null : transaction.id,
                                    )
                                  }
                                  className="inline-flex items-center gap-2 text-left hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
                                >
                                  {tx(transaction.type.replaceAll("_", " "))}
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                </button>
                              </td>
                              <td className="px-4 py-4 text-right font-mono text-zinc-200">
                                {formatTransactionAmount(transaction)}{" "}
                                <span className="text-zinc-400">
                                  {transaction.currency}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                {renderTransactionStatusBadge(
                                  transaction.status,
                                  tx,
                                )}
                              </td>
                              <td className="px-4 py-4 text-right text-zinc-400">
                                {formattedDate}
                              </td>
                              <td
                                className="px-4 py-4 text-right font-mono text-zinc-500"
                                title={transaction.id}
                              >
                                {transaction.id.slice(0, 8)}
                              </td>
                            </tr>
                            <tr id={detailsId} hidden={!isExpanded}>
                              <td
                                colSpan={5}
                                className="border-t border-zinc-800/70 bg-zinc-900/40 px-4 py-4"
                              >
                                <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                  <div>
                                    <p className="text-zinc-500">
                                      {tx("Transaction details")}
                                    </p>
                                    <p className="mt-1 font-medium capitalize text-zinc-200">
                                      {tx(
                                        transaction.type.replaceAll("_", " "),
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-zinc-500">
                                      {tx("Asset")}
                                    </p>
                                    <p className="mt-1 font-mono text-zinc-200">
                                      {formatTransactionAmount(transaction)}{" "}
                                      {transaction.currency}
                                    </p>
                                  </div>
                                  {transaction.type === "deposit" &&
                                    transaction.gross_amount !== null &&
                                    transaction.gross_amount !== undefined &&
                                    Number.isFinite(
                                      Number(transaction.gross_amount),
                                    ) &&
                                    Number.isFinite(
                                      Number(transaction.fee_amount),
                                    ) &&
                                    Number.isFinite(
                                      Number(transaction.net_amount),
                                    ) && (
                                      <>
                                        <div>
                                          <p className="text-zinc-500">
                                            {tx("Deposit amount")}
                                          </p>
                                          <p className="mt-1 font-mono text-zinc-200">
                                            {formatFinancialAmount(
                                              transaction.gross_amount,
                                            )}{" "}
                                            {transaction.currency}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-zinc-500">
                                            {tx(
                                              "CoinMaster processing fee (7%)",
                                            )}
                                          </p>
                                          <p className="mt-1 font-mono text-zinc-200">
                                            {formatFinancialAmount(
                                              transaction.fee_amount,
                                            )}{" "}
                                            {transaction.currency}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-zinc-500">
                                            {tx("Net deposit amount")}
                                          </p>
                                          <p className="mt-1 font-mono text-zinc-200">
                                            {formatFinancialAmount(
                                              transaction.net_amount,
                                            )}{" "}
                                            {transaction.currency}
                                          </p>
                                        </div>
                                      </>
                                    )}
                                  {transaction.type === "withdrawal" &&
                                    transaction.gross_amount !== null &&
                                    transaction.gross_amount !== undefined &&
                                    Number.isFinite(
                                      Number(transaction.fee_amount),
                                    ) &&
                                    Number.isFinite(
                                      Number(transaction.net_amount),
                                    ) && (
                                      <>
                                        <div>
                                          <p className="text-zinc-500">
                                            {tx("Withdrawal amount")}
                                          </p>
                                          <p className="mt-1 font-mono text-zinc-200">
                                            {formatFinancialAmount(
                                              transaction.gross_amount,
                                            )}{" "}
                                            {transaction.currency}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-zinc-500">
                                            {tx(
                                              "CoinMaster withdrawal fee (0%)",
                                            )}
                                          </p>
                                          <p className="mt-1 font-mono text-zinc-200">
                                            {formatFinancialAmount(
                                              transaction.fee_amount,
                                            )}{" "}
                                            {transaction.currency}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-zinc-500">
                                            {tx("Net withdrawal amount")}
                                          </p>
                                          <p className="mt-1 font-mono text-zinc-200">
                                            {formatFinancialAmount(
                                              transaction.net_amount,
                                            )}{" "}
                                            {transaction.currency}
                                          </p>
                                        </div>
                                      </>
                                    )}
                                  <div>
                                    <p className="text-zinc-500">
                                      {tx("Status")}
                                    </p>
                                    <div className="mt-1">
                                      {renderTransactionStatusBadge(
                                        transaction.status,
                                        tx,
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-zinc-500">
                                      {tx("Transaction date")}
                                    </p>
                                    <p className="mt-1 text-zinc-200">
                                      {formattedDate}
                                    </p>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <p className="text-zinc-500">
                                      {tx("Transaction ID")}
                                    </p>
                                    <code className="mt-1 block break-all text-zinc-200">
                                      {transaction.id}
                                    </code>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {transactionsMoreError && (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-rose-200 sm:flex-row sm:items-center sm:justify-between"
                  role="alert"
                >
                  <p>{tx(transactionsMoreError)}</p>
                  <button
                    type="button"
                    onClick={loadMoreTransactions}
                    disabled={transactionsLoading || transactionsLoadingMore}
                    className="underline disabled:opacity-50"
                  >
                    {tx("Load more transactions")}
                  </button>
                </div>
              )}
              {transactionsHaveMore && !transactionsError && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreTransactions}
                    disabled={transactionsLoading || transactionsLoadingMore}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 text-xs font-medium text-zinc-200 transition-colors hover:border-blue-500/50 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {transactionsLoadingMore
                      ? tx("Loading more transactions…")
                      : tx("Load more transactions")}
                  </button>
                </div>
              )}
              {!transactionsHaveMore &&
                transactions.length > 0 &&
                !transactionsError && (
                  <p className="text-center text-[11px] text-zinc-500">
                    {tx(
                      "You have reached the end of your transaction history.",
                    )}
                  </p>
                )}
            </section>
          )}

          {activeTab === "portfolio" && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">{tx("Portfolio")}</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  {tx(
                    "Your wallet holdings valued using public CoinGecko prices.",
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <p className="text-xs text-zinc-500">
                    {tx("Total priced value")}
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {walletBalances.length
                      ? formatCurrency(totalWalletValue, displayCurrency)
                      : "—"}
                  </p>
                  {unpricedWalletCount > 0 && (
                    <p className="mt-2 text-[10px] text-amber-300">
                      {unpricedWalletCount}{" "}
                      {tx(unpricedWalletCount === 1 ? "asset" : "assets")}{" "}
                      {tx("excluded because a price is unavailable.")}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <p className="text-xs text-zinc-500">
                    {tx("Valuation currency")}
                  </p>
                  <p className="mt-2 text-2xl font-bold">{displayCurrency}</p>
                  <p className="mt-2 text-[10px] text-zinc-500">
                    {pricesUpdatedAt
                      ? `${tx("Prices updated")} ${formatDateTime(pricesUpdatedAt)}.`
                      : tx("Waiting for public price data.")}
                  </p>
                </div>
              </div>
              {walletError && (
                <p className="text-xs text-rose-300" role="alert">
                  {tx(walletError)}
                </p>
              )}
              {walletLoading && walletBalances.length === 0 ? (
                <p className="text-xs text-zinc-400" role="status">
                  {tx("Loading portfolio…")}
                </p>
              ) : walletBalances.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-6 text-sm text-zinc-400">
                  {tx("No wallet holdings are available for this account.")}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#12141a]">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-4 py-3 font-medium">{tx("Asset")}</th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Quantity")}
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Unit price")}
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Value")}
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {tx("Allocation")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {pricedPortfolioAssets.map((asset) => (
                        <tr key={asset.asset}>
                          <td className="px-4 py-4 font-semibold">
                            {asset.asset}
                          </td>
                          <td className="px-4 py-4 text-right font-mono">
                            {formatFinancialAmount(asset.balance)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-zinc-300">
                            {Number.isFinite(asset.price)
                              ? formatCurrency(asset.price, displayCurrency)
                              : tx("Unavailable")}
                          </td>
                          <td className="px-4 py-4 text-right font-mono">
                            {asset.value === null
                              ? tx("Unavailable")
                              : formatCurrency(asset.value, displayCurrency)}
                          </td>
                          <td className="px-4 py-4 text-right text-zinc-400">
                            {asset.allocation === null
                              ? "—"
                              : `${formatNumber(asset.allocation, appLocale, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === "watchlist" && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">
                  {tx("Watchlist & Price Alerts")}
                </h1>
                <p className="mt-1 text-xs text-zinc-400">
                  {tx(
                    "Follow public prices and create thresholds checked while you are signed in.",
                  )}
                </p>
              </div>

              {watchlistError && (
                <div
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200"
                  role="alert"
                >
                  <p>{tx(watchlistError)}</p>
                  <button
                    type="button"
                    onClick={
                      watchlistSavePending
                        ? retryWatchlistSave
                        : retryWatchlistLoad
                    }
                    disabled={watchlistSaving || watchlistLoading}
                    className="mt-2 underline disabled:opacity-50"
                  >
                    {watchlistSavePending
                      ? tx("Retry save")
                      : tx("Retry loading settings")}
                  </button>
                </div>
              )}
              {watchlistLoading && (
                <p
                  className="rounded-xl border border-zinc-800 bg-[#12141a] p-4 text-xs text-zinc-400"
                  role="status"
                >
                  {tx("Loading your saved watchlist and price alerts…")}
                </p>
              )}
              {watchlistUsingBrowserFallback && (
                <p
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200"
                  role="status"
                >
                  {tx(
                    "These settings are from this browser only. Editing is paused until account settings can be loaded, to avoid overwriting data saved on another device.",
                  )}
                </p>
              )}

              <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                <h2 className="font-semibold">{tx("Assets")}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PRICED_CRYPTO_ASSETS.map((asset) => {
                    const isWatched = watchlistSymbols.includes(asset.symbol);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleWatchlistAsset(asset.symbol)}
                        disabled={
                          !user?.id ||
                          watchlistOwnerId !== user.id ||
                          watchlistLoading ||
                          watchlistSaving ||
                          Boolean(watchlistError)
                        }
                        aria-pressed={isWatched}
                        className={`rounded-lg border px-3 py-2 text-xs transition ${
                          isWatched
                            ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                            : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                        }`}
                      >
                        {isWatched ? "★ " : "+ "}
                        {asset.symbol}
                      </button>
                    );
                  })}
                </div>

                {!watchlistLoading &&
                !watchlistError &&
                watchlistSymbols.length === 0 ? (
                  <p className="mt-5 text-xs text-zinc-500">
                    {tx(
                      "Choose assets above to add them to your account watchlist.",
                    )}
                  </p>
                ) : watchlistSymbols.length > 0 ? (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-zinc-500">
                        <tr className="border-b border-zinc-800">
                          <th className="py-3 font-medium">{tx("Asset")}</th>
                          <th className="py-3 text-right font-medium">
                            {tx("Price")}
                          </th>
                          <th className="py-3 text-right font-medium">
                            {tx("24h change")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/70">
                        {watchlistSymbols.map((symbol) => {
                          const asset = PRICED_CRYPTO_ASSETS.find(
                            (candidate) => candidate.symbol === symbol,
                          );
                          const quote =
                            cryptoPrices[asset.id]?.[displayCurrency];
                          return (
                            <tr key={symbol}>
                              <td className="py-3">
                                <span className="font-semibold">
                                  {asset.name}
                                </span>
                                <span className="ml-2 text-zinc-500">
                                  {symbol}
                                </span>
                              </td>
                              <td className="py-3 text-right font-mono">
                                {quote
                                  ? formatCurrency(quote.price, displayCurrency)
                                  : priceLoading
                                    ? tx("Loading…")
                                    : tx("Unavailable")}
                              </td>
                              <td
                                className={`py-3 text-right font-mono ${
                                  quote?.change === null ||
                                  quote?.change === undefined
                                    ? "text-zinc-500"
                                    : quote.change >= 0
                                      ? "text-emerald-400"
                                      : "text-rose-400"
                                }`}
                              >
                                {quote?.change === null ||
                                quote?.change === undefined
                                  ? tx("Unavailable")
                                  : `${quote.change >= 0 ? "+" : ""}${formatNumber(
                                      Math.abs(quote.change),
                                      appLocale,
                                      {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      },
                                    )}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                <h2 className="font-semibold">{tx("Create a price alert")}</h2>
                <form
                  onSubmit={handlePriceAlertSubmit}
                  className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end"
                >
                  <div>
                    <label
                      htmlFor="alert-asset"
                      className="text-xs text-zinc-400"
                    >
                      {tx("Asset")}
                    </label>
                    <select
                      id="alert-asset"
                      value={alertAssetSymbol}
                      onChange={(event) =>
                        setAlertAssetSymbol(event.target.value)
                      }
                      disabled={
                        !user?.id ||
                        watchlistOwnerId !== user.id ||
                        watchlistLoading ||
                        watchlistSaving ||
                        Boolean(watchlistError)
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      {PRICED_CRYPTO_ASSETS.map((asset) => (
                        <option key={asset.id} value={asset.symbol}>
                          {asset.symbol}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="alert-condition"
                      className="text-xs text-zinc-400"
                    >
                      {tx("Condition")}
                    </label>
                    <select
                      id="alert-condition"
                      value={alertCondition}
                      onChange={(event) =>
                        setAlertCondition(event.target.value)
                      }
                      disabled={
                        !user?.id ||
                        watchlistOwnerId !== user.id ||
                        watchlistLoading ||
                        watchlistSaving ||
                        Boolean(watchlistError)
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      <option value="above">
                        {tx("Price reaches or exceeds")}
                      </option>
                      <option value="below">
                        {tx("Price falls to or below")}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="alert-threshold"
                      className="text-xs text-zinc-400"
                    >
                      {tx("Threshold (")}
                      {displayCurrency})
                    </label>
                    <input
                      id="alert-threshold"
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={alertThreshold}
                      onChange={(event) =>
                        setAlertThreshold(event.target.value)
                      }
                      disabled={
                        !user?.id ||
                        watchlistOwnerId !== user.id ||
                        watchlistLoading ||
                        watchlistSaving ||
                        Boolean(watchlistError)
                      }
                      placeholder={tx("Enter target price")}
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-mono text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      !user?.id ||
                      watchlistOwnerId !== user.id ||
                      watchlistLoading ||
                      watchlistSaving ||
                      Boolean(watchlistError)
                    }
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tx("Add alert")}
                  </button>
                </form>

                {watchlistLoading ||
                (watchlistError &&
                  !watchlistUsingBrowserFallback) ? null : priceAlerts.length ===
                  0 ? (
                  <p className="mt-5 text-xs text-zinc-500">
                    {tx("No price alerts yet.")}
                  </p>
                ) : (
                  <ul className="mt-5 divide-y divide-zinc-800">
                    {priceAlerts.map((alert) => (
                      <li
                        key={alert.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                      >
                        <div>
                          <p className="font-medium">
                            {alert.symbol}{" "}
                            {alert.condition === "above" ? "≥" : "≤"}{" "}
                            {formatCurrency(alert.threshold, alert.currency)}
                          </p>
                          <p
                            className={`mt-1 ${
                              alert.triggeredAt
                                ? "text-emerald-400"
                                : "text-zinc-500"
                            }`}
                          >
                            {alert.triggeredAt
                              ? `${tx("Triggered at")} ${formatCurrency(alert.triggeredPrice, alert.currency)} · ${formatDateTime(alert.triggeredAt)}`
                              : tx(
                                  "Waiting for a matching public price update",
                                )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePriceAlert(alert.id)}
                          disabled={
                            !user?.id ||
                            watchlistOwnerId !== user.id ||
                            watchlistLoading ||
                            watchlistSaving ||
                            Boolean(watchlistError)
                          }
                          className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        >
                          {tx("Remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[10px] leading-5 text-zinc-500">
                  {watchlistUsingBrowserFallback
                    ? tx(
                        "Account sync is unavailable; browser-saved preferences have not been changed. Alerts are checked only when this app receives a price update while open.",
                      )
                    : tx(
                        "Watchlist and alert settings are saved to your account in Supabase and available across devices. Alerts are checked when this app receives a price update while open; they do not send background or email notifications.",
                      )}
                </p>
                {watchlistSaving && (
                  <p className="mt-3 text-xs text-zinc-400" role="status">
                    {tx("Saving your watchlist…")}
                  </p>
                )}
                {priceError && (
                  <p className="mt-3 text-xs text-amber-300" role="status">
                    {tx(
                      "Price alerts cannot be checked until price data is available.",
                    )}{" "}
                    {tx(priceError)}{" "}
                    <button
                      type="button"
                      onClick={() => setPriceRefreshKey((key) => key + 1)}
                      className="underline"
                    >
                      {tx("Retry")}
                    </button>
                  </p>
                )}
              </div>
            </section>
          )}

          {["investments", "mining"].includes(activeTab) && (
            <section className="mx-auto max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">
                  {
                    {
                      investments: "Investments",
                      mining: "Mining",
                    }[activeTab]
                  }
                </h1>
                <p className="mt-1 text-xs text-zinc-400">
                  {tx("Feature status and requirements")}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-300">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="font-semibold">
                      {tx("Section information")}
                    </h2>
                    <p className="text-sm leading-6 text-zinc-400">
                      {tx(
                        "Contact Support for information about this section.",
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateToTab("support")}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {tx("View support information")}
              </button>
            </section>
          )}

          {activeTab === "support" && (
            <section className="mx-auto max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">{tx("Help & Support")}</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  {tx("Account and feature information")}
                </p>
              </div>
              <div className="space-y-4">
                <article className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <h2 className="font-semibold">
                    {tx("Balances and portfolio values")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {tx("Wallet quantities and public market prices.")}
                  </p>
                </article>
                <article className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <h2 className="font-semibold">{tx("Transfers")}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {tx(
                      "Account-to-account transfers require a registered recipient and sufficient asset balance. If a request outcome is uncertain, retry the same recipient, asset, and amount so the original request can be checked safely.",
                    )}
                  </p>
                </article>
                <article className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <h2 className="font-semibold">{tx("Withdrawals")}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {tx(
                      "Withdrawal requests are reviewed internally. The requested amount is reserved until an administrator approves or declines the request.",
                    )}
                  </p>
                </article>
              </div>
              <form
                onSubmit={handleSupportRequestSubmit}
                className="space-y-5 rounded-2xl border border-zinc-800 bg-[#12141a] p-5 sm:p-6"
              >
                <div>
                  <h2 className="font-semibold">
                    {tx("Submit a support request")}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    {tx(
                      "Send us a message and our support team will follow up.",
                    )}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="support-subject"
                      className="mb-1.5 block text-xs font-medium text-zinc-300"
                    >
                      {tx("Subject")}
                    </label>
                    <input
                      id="support-subject"
                      type="text"
                      value={supportSubject}
                      onChange={(event) =>
                        setSupportSubject(event.target.value)
                      }
                      maxLength={160}
                      required
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="support-category"
                      className="mb-1.5 block text-xs font-medium text-zinc-300"
                    >
                      {tx("Category")}
                    </label>
                    <select
                      id="support-category"
                      value={supportCategory}
                      onChange={(event) =>
                        setSupportCategory(event.target.value)
                      }
                      required
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                    >
                      {SUPPORT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {tx(category[0].toUpperCase() + category.slice(1))}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="support-message"
                    className="mb-1.5 block text-xs font-medium text-zinc-300"
                  >
                    {tx("Message")}
                  </label>
                  <textarea
                    id="support-message"
                    value={supportMessage}
                    onChange={(event) => setSupportMessage(event.target.value)}
                    placeholder={tx("Describe how we can help…")}
                    maxLength={5000}
                    rows={6}
                    required
                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-blue-500"
                  />
                </div>
                {supportError && (
                  <p
                    className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200"
                    role="alert"
                  >
                    {tx(supportError)}
                  </p>
                )}
                {supportSuccess && (
                  <p
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200"
                    role="status"
                  >
                    {tx(supportSuccess)}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={supportSubmitting}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {supportSubmitting ? tx("Submitting…") : tx("Submit request")}
                </button>
              </form>

              <section className="space-y-4 rounded-2xl border border-zinc-800 bg-[#12141a] p-5 sm:p-6">
                <div>
                  <h2 className="font-semibold">{tx("Your requests")}</h2>
                </div>
                {supportRequestsError ? (
                  <div
                    className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-rose-200"
                    role="alert"
                  >
                    <p>{tx(supportRequestsError)}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setSupportRequestsRetryKey((key) => key + 1)
                      }
                      className="mt-2 underline"
                    >
                      {tx("Retry")}
                    </button>
                  </div>
                ) : supportRequestsLoading ? (
                  <p
                    className="py-6 text-center text-xs text-zinc-400"
                    role="status"
                  >
                    {tx("Loading support requests…")}
                  </p>
                ) : supportRequests.length === 0 ? (
                  <p className="py-6 text-center text-xs text-zinc-400">
                    {tx("No support requests yet.")}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {supportRequests.map((request) => (
                      <li
                        key={request.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="break-words text-sm font-medium text-zinc-100">
                              {request.subject}
                            </h3>
                            <p className="mt-1 text-[11px] capitalize text-zinc-400">
                              {tx(
                                request.category[0].toUpperCase() +
                                  request.category.slice(1),
                              )}{" "}
                              ·{" "}
                              {tx(
                                request.status
                                  .replaceAll("_", " ")
                                  .replace(/^\w/, (letter) =>
                                    letter.toUpperCase(),
                                  ),
                              )}
                            </p>
                          </div>
                          <time
                            dateTime={request.created_at}
                            className="shrink-0 text-[11px] text-zinc-500"
                          >
                            {Number.isNaN(Date.parse(request.created_at))
                              ? tx("Date unavailable")
                              : formatDateTime(request.created_at)}
                          </time>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">
                          {request.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </section>
          )}

          {activeTab === "wallet" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h1 className="text-xl font-bold">{tx("Wallet Hub")}</h1>
                  </div>

                  {user?.id && (
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {tx("Wallet account ID")}
                        </p>
                        <code
                          className="block max-w-52 truncate text-xs text-zinc-200"
                          title={user.id}
                        >
                          {`${user.id.slice(0, 8)}…${user.id.slice(-8)}`}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyWalletId}
                        aria-label={
                          walletIdCopied
                            ? "Account ID copied"
                            : "Copy account ID"
                        }
                        title={
                          walletIdCopied ? "Copied" : "Copy full account ID"
                        }
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        {walletIdCopied ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      {walletIdCopied && (
                        <span
                          role="status"
                          className="text-[10px] text-emerald-300"
                        >
                          {tx("Copied")}
                        </span>
                      )}
                      {walletIdCopyMessage && (
                        <span
                          role="status"
                          className="text-[10px] text-amber-300"
                        >
                          {tx(walletIdCopyMessage)}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    role="group"
                    aria-label={tx("Wallet actions")}
                    className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl"
                  >
                    {[
                      "deposit",
                      "withdraw",
                      "transfer",
                      ...(isAdmin ? ["admin-send"] : []),
                      ...(isAdmin ? ["admin-credit"] : []),
                    ].map((st) => (
                      <button
                        key={st}
                        type="button"
                        aria-pressed={walletSubTab === st}
                        onClick={() => setWalletSubTab(st)}

                        className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition ${
                          walletSubTab === st
                            ? "bg-blue-600 text-white shadow"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {st === "admin-credit"
                          ? tx("Admin credit")
                          : st === "admin-send"
                            ? tx("Admin send")
                            : st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">
                      {tx("Your balances")}
                    </h2>
                    <button
                      type="button"
                      onClick={() => fetchWalletBalances()}
                      disabled={walletLoading}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    >
                      {walletLoading
                        ? tx("Refreshing…")
                        : tx("Refresh balances")}
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {tx("Total priced value")}
                      </p>
                      <p className="mt-1 text-lg font-bold text-zinc-100">
                        {!walletLoading &&
                        !walletError &&
                        walletBalances.length > 0
                          ? formatCurrency(totalWalletValue, displayCurrency)
                          : "—"}
                      </p>
                      {unpricedWalletCount > 0 && (
                        <p className="mt-1 text-[10px] text-amber-300">
                          {tx("Excludes")} {unpricedWalletCount}{" "}
                          {tx(unpricedWalletCount === 1 ? "asset" : "assets")}{" "}
                          {tx("without a price.")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="display-currency"
                        className="text-[10px] text-zinc-400"
                      >
                        {tx("Display currency")}
                      </label>
                      <select
                        id="display-currency"
                        value={displayCurrency}
                        onChange={handleDisplayCurrencyChange}
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      >
                        {DISPLAY_CURRENCIES.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {priceError && (
                    <p className="text-xs text-amber-300" role="status">
                      {pricesUpdatedAt
                        ? `${tx("Price refresh failed. Values use the last successful update from")} ${formatDateTime(pricesUpdatedAt)}.`
                        : tx(
                            "Prices are unavailable; fiat values are not being estimated.",
                          )}{" "}
                      <button
                        type="button"
                        onClick={() => setPriceRefreshKey((key) => key + 1)}
                        className="underline"
                      >
                        {tx("Retry")}
                      </button>
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-500">
                    {tx("Public crypto prices refreshed about every minute.")}{" "}
                    <a
                      href="https://www.coingecko.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {tx("Price data by CoinGecko")}
                    </a>
                    {pricesUpdatedAt
                      ? ` · ${tx("Last updated")} ${formatDateTime(pricesUpdatedAt)}`
                      : ""}
                    {priceLoading && !pricesUpdatedAt
                      ? tx(" · Loading prices…")
                      : ""}
                  </p>
                  {walletError && (
                    <div
                      role="alert"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300"
                    >
                      <span>{tx(walletError)}</span>
                      <button
                        type="button"
                        onClick={() => fetchWalletBalances()}
                        disabled={walletLoading}
                        className="underline disabled:opacity-50"
                      >
                        {tx("Retry")}
                      </button>
                    </div>
                  )}
                  {walletLoading ? (
                    <p className="text-xs text-zinc-400">
                      {tx("Loading your balances…")}
                    </p>
                  ) : walletError ? null : walletBalances.length === 0 ? (
                    <p className="text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                      {tx(
                        "No wallet balance records are available for this account.",
                      )}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {walletBalances.map((wallet) => (
                        <div
                          key={wallet.asset}
                          className="bg-[#161821] border border-zinc-800 p-4 rounded-xl"
                        >
                          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                            {wallet.asset}
                          </p>
                          <p className="text-lg font-bold text-emerald-400 mt-1 break-all">
                            {formatFinancialAmount(wallet.balance)}
                          </p>
                          <p className="mt-2 text-xs font-medium text-zinc-300">
                            {Number.isFinite(
                              getCryptoPrice(
                                cryptoPrices,
                                wallet.asset,
                                currencyKey,
                              ),
                            )
                              ? formatCurrency(
                                  Number(wallet.balance) *
                                    getCryptoPrice(
                                      cryptoPrices,
                                      wallet.asset,
                                      currencyKey,
                                    ),
                                  displayCurrency,
                                )
                              : tx("Price unavailable")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {walletSubTab === "deposit" && (
                  <div className="mx-auto max-w-xl space-y-6">
                    <h2 className="text-lg font-semibold">{tx("Deposit")}</h2>
                    <div className="grid grid-cols-3 gap-2">
                      {["Asset", "Amount", "Review"].map((label, index) => (
                        <div
                          key={label}
                          aria-current={
                            depositStep === index + 1 ? "step" : undefined
                          }
                          className={`rounded-lg p-3 text-center text-xs ${
                            depositStep === index + 1
                              ? "border border-blue-500 bg-blue-600/20 text-blue-300"
                              : depositStep > index + 1
                                ? "bg-blue-500/10 text-blue-400"
                                : "bg-[#161821] text-zinc-500"
                          }`}
                        >
                          {tx(label)}
                        </div>
                      ))}
                    </div>
                    <form
                      onSubmit={handleDepositSubmit}
                      className="space-y-5 rounded-xl border border-zinc-800 bg-[#12141a] p-5"
                    >
                      {depositStep === 1 && (
                        <div className="space-y-4">
                          <label
                            htmlFor="deposit-asset"
                            className="block text-sm font-medium"
                          >
                            {tx("Choose an asset")}
                          </label>
                          <select
                            id="deposit-asset"
                            value={depositAsset}
                            onChange={(event) => {
                              setDepositAsset(event.target.value);
                              setDepositValidationError("");
                            }}
                            disabled={depositSubmitting}
                            className="w-full rounded-lg border border-zinc-700 bg-[#161821] p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                          >
                            {depositAssetOptions.map((asset) => (
                              <option key={asset} value={asset}>
                                {asset}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {depositStep === 2 && (
                        <div className="space-y-3">
                          <h3 className="font-medium">
                            {tx("Enter deposit amount")}
                          </h3>
                          <p className="text-sm text-zinc-400">
                            {tx("Selected asset:")} {depositAsset}
                          </p>
                          <label htmlFor="deposit-amount" className="sr-only">
                            {tx("Amount")}
                          </label>
                          <input
                            id="deposit-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            required
                            value={depositAmount}
                            onChange={(event) => {
                              setDepositAmount(event.target.value);
                              setDepositValidationError("");
                            }}
                            placeholder={`Amount in ${depositAsset}`}
                            className="w-full rounded-lg border border-zinc-700 bg-[#161821] p-3 text-white outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                      {depositStep === 3 && depositFeeDetails && (
                        <div className="space-y-4">
                          <h3 className="font-medium">
                            {tx("Review deposit")}
                          </h3>
                          <dl className="space-y-3 rounded-lg bg-[#161821] p-4 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-zinc-400">{tx("Asset")}</dt>
                              <dd>{depositAsset}</dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-zinc-400">
                                {tx("Deposit amount")}
                              </dt>
                              <dd>
                                {formatAssetAmount(
                                  depositFeeDetails.grossAmount,
                                )}{" "}
                                {depositAsset}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-zinc-400">
                                {tx("CoinMaster processing fee (7%)")}
                              </dt>
                              <dd>
                                {formatAssetAmount(depositFeeDetails.feeAmount)}{" "}
                                {depositAsset}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4 border-t border-zinc-700 pt-3 font-semibold">
                              <dt className="text-zinc-300">
                                {tx("Net deposit amount")}
                              </dt>
                              <dd>
                                {formatAssetAmount(depositFeeDetails.netAmount)}{" "}
                                {depositAsset}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}
                      {depositValidationError && (
                        <p className="text-sm text-rose-300" role="alert">
                          {tx(depositValidationError)}
                        </p>
                      )}
                      <div className="flex gap-3">
                        {depositStep > 1 && (
                          <button
                            type="button"
                            disabled={depositSubmitting}
                            onClick={() => {
                              setDepositStep((step) => step - 1);
                              setDepositValidationError("");
                            }}
                            className="flex-1 rounded-lg border border-zinc-700 p-3 disabled:opacity-50"
                          >
                            {tx("Back")}
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={depositSubmitting}
                          className="flex-1 rounded-lg bg-blue-600 p-3 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {depositSubmitting
                            ? tx("Processing…")
                            : depositStep === 3
                              ? tx("Complete Transaction")
                              : tx("Continue")}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {walletSubTab === "withdraw" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
                      {[
                        "1. Asset",
                        "2. Amount",
                        "3. Address",
                        "4. Network",
                        "5. Review",
                      ].map((label, idx) => (
                        <div
                          key={label}
                          className={`py-2 border-b-2 font-medium ${
                            withdrawStep === idx + 1
                              ? "border-blue-500 text-blue-400"
                              : "border-zinc-800 text-zinc-500"
                          }`}
                        >
                          {label}
                        </div>
                      ))}
                    </div>

                    <form
                      onSubmit={handleWithdrawSubmit}
                      className="space-y-4 max-w-md mx-auto"
                    >
                      {withdrawStep === 1 && (
                        <div>
                          <label
                            htmlFor="withdraw-method"
                            className="text-xs text-zinc-400"
                          >
                            {tx("Asset")}
                          </label>
                          <select
                            id="withdraw-method"
                            value={withdrawMethod}
                            onChange={(event) => {
                              if (event.target.value !== withdrawMethod) {
                                setWithdrawAddress("");
                                setWithdrawAmount("");
                                setWithdrawNetwork(
                                  WITHDRAWAL_NETWORKS[
                                    event.target.value
                                  ]?.[0] || "",
                                );
                              }
                              setWithdrawMethod(event.target.value);
                              setWithdrawValidationError("");
                            }}
                            className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="">{tx("Select an asset")}</option>
                            {Object.keys(WITHDRAWAL_NETWORKS).map((asset) => (
                              <option key={asset} value={asset}>
                                {asset}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {withdrawStep === 2 && (
                        <div>
                          <p className="text-xs text-zinc-400">
                            {tx("Available")} {withdrawMethod}:{" "}
                            {walletLoading
                              ? tx("Loading…")
                              : walletError
                                ? tx("Unavailable")
                                : walletBalances.find(
                                      (balance) =>
                                        balance.asset === withdrawMethod,
                                    )
                                  ? formatFinancialAmount(
                                      walletBalances.find(
                                        (balance) =>
                                          balance.asset === withdrawMethod,
                                      ).balance,
                                    )
                                  : tx("No balance record")}
                          </p>
                          <label
                            htmlFor="withdraw-amount"
                            className="mt-4 block text-xs text-zinc-400"
                          >
                            {tx("Amount")} ({withdrawMethod})
                          </label>
                          <input
                            id="withdraw-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            required
                            placeholder={tx("0")}
                            value={withdrawAmount}
                            onChange={(event) => {
                              setWithdrawAmount(event.target.value);
                              setWithdrawValidationError("");
                            }}
                            className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}

                      {withdrawStep === 3 && (
                        <div>
                          <label
                            htmlFor="withdraw-address"
                            className="text-xs text-zinc-400"
                          >
                            {tx("Destination address")}
                          </label>
                          <input
                            id="withdraw-address"
                            type="text"
                            autoComplete="off"
                            minLength={8}
                            required
                            placeholder={`Enter ${withdrawMethod} destination address`}
                            value={withdrawAddress}
                            onChange={(event) => {
                              setWithdrawAddress(event.target.value);
                              setWithdrawValidationError("");
                            }}
                            className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}

                      {withdrawStep === 4 && (
                        <div>
                          <label
                            htmlFor="withdraw-network"
                            className="text-xs text-zinc-400"
                          >
                            {tx("Network")}
                          </label>
                          <select
                            id="withdraw-network"
                            required
                            value={withdrawNetwork}
                            onChange={(event) => {
                              setWithdrawNetwork(event.target.value);
                              setWithdrawValidationError("");
                            }}
                            className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="">{tx("Select a network")}</option>
                            {withdrawalNetworkOptions.map((network) => (
                              <option key={network} value={network}>
                                {network}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {withdrawStep === 5 && (
                        <div className="space-y-4">
                          <h2 className="text-sm font-semibold">
                            {tx("Review withdrawal details")}
                          </h2>
                          <dl className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4">
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">{tx("Asset")}</dt>
                              <dd className="font-medium text-zinc-100">
                                {withdrawMethod}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">{tx("Network")}</dt>
                              <dd className="text-right font-medium text-zinc-100">
                                {withdrawNetwork}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">
                                {tx("Withdrawal amount")}
                              </dt>
                              <dd className="font-medium text-zinc-100">
                                {formatFinancialAmount(
                                  withdrawalFeeDetails?.grossAmount,
                                )}{" "}
                                {withdrawMethod}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">
                                {tx("CoinMaster withdrawal fee (0%)")}
                              </dt>
                              <dd className="font-medium text-zinc-100">
                                {formatFinancialAmount(
                                  withdrawalFeeDetails?.feeAmount,
                                )}{" "}
                                {withdrawMethod}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">
                                {tx("Net withdrawal amount")}
                              </dt>
                              <dd className="font-medium text-zinc-100">
                                {formatFinancialAmount(
                                  withdrawalFeeDetails?.netAmount,
                                )}{" "}
                                {withdrawMethod}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">
                                {tx("Destination address")}
                              </dt>
                              <dd className="max-w-[65%] break-all text-right font-mono text-zinc-100">
                                {withdrawAddress}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}

                      {withdrawValidationError && (
                        <p
                          id="withdraw-validation-error"
                          className="text-xs text-rose-300"
                          role="alert"
                        >
                          {tx(withdrawValidationError)}
                        </p>
                      )}

                      <div className="flex gap-3">
                        {withdrawStep > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setWithdrawValidationError("");
                              setWithdrawStep((step) => Math.max(1, step - 1));
                            }}
                            disabled={withdrawSubmitting}
                            className="flex-1 rounded-xl border border-zinc-700 py-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
                          >
                            {tx("Back")}
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={withdrawSubmitting}
                          className="flex-1 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white transition hover:bg-blue-500"
                        >
                          {withdrawSubmitting
                            ? tx("Processing…")
                            : withdrawStep === 4
                              ? tx("Review withdrawal")
                              : withdrawStep === 5
                                ? tx("Complete Transaction")
                                : tx("Continue")}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {(walletSubTab === "transfer" ||
                  (walletSubTab === "admin-send" && isAdmin)) && (
                  <div className="space-y-4 max-w-lg">
                    <div>
                      <h2 className="text-sm font-semibold">
                        {walletSubTab === "admin-send"
                          ? tx("Admin send")
                          : tx("Send assets")}
                      </h2>
                      <p className="text-xs text-zinc-400 mt-1">
                        {walletSubTab === "admin-send"
                          ? tx(
                              "Send assets to any registered account without checking or debiting the admin wallet. This is separate from Admin credit.",
                            )
                          : tx(
                              "Send assets to another registered CoinMaster account by email.",
                            )}
                      </p>
                    </div>
                    <form onSubmit={handleDemoTransfer} className="space-y-4">
                      <div>
                        <label
                          htmlFor="transfer-recipient"
                          className="text-xs text-zinc-400"
                        >
                          {tx("Recipient account email")}
                        </label>
                        <input
                          id="transfer-recipient"
                          type="email"
                          required
                          value={transferEmail}
                          onChange={(e) => setTransferEmail(e.target.value)}
                          placeholder={tx("recipient@example.com")}
                          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="transfer-asset"
                          className="text-xs text-zinc-400"
                        >
                          {tx("Asset")}
                        </label>
                        <select
                          id="transfer-asset"
                          value={transferAsset}
                          onChange={(e) => setTransferAsset(e.target.value)}
                          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {(walletSubTab === "admin-send"
                            ? [
                                "BTC",
                                "ETH",
                                "USDT",
                                "USDC",
                                "LTC",
                                "BNB",
                                "SOL",
                              ]
                            : ["BTC", "ETH", "USDT", "USDC"]
                          ).map((asset) => (
                            <option key={asset} value={asset}>
                              {asset}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="transfer-amount"
                          className="text-xs text-zinc-400"
                        >
                          {tx("Amount")}
                        </label>
                        <input
                          id="transfer-amount"
                          type="number"
                          min="0.00000001"
                          step="any"
                          required
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder={tx("0.00")}
                          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      {transferMessage && (
                        <p
                          role="status"
                          className={`text-xs ${transferMessage.includes("completed") ? "text-emerald-400" : "text-amber-400"}`}
                        >
                          {tx(transferMessage)}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={transferLoading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-xs"
                      >
                        {transferLoading
                          ? tx("Sending assets…")
                          : walletSubTab === "admin-send"
                            ? tx("Send as admin")
                            : tx("Send transfer")}
                      </button>
                    </form>
                  </div>
                )}

                {walletSubTab === "admin-credit" && isAdmin && (
                  <div className="max-w-lg space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold">
                        {tx("Admin asset distribution")}
                      </h2>
                      <p className="mt-1 text-xs text-zinc-400">
                        {tx(
                          "Credit a registered account directly. This action does not debit your wallet and is recorded in the account ledger.",
                        )}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="admin-credit-lookup-by"
                          className="text-xs text-zinc-400"
                        >
                          {tx("Find recipient by")}
                        </label>
                        <select
                          id="admin-credit-lookup-by"
                          value={adminCreditLookupBy}
                          onChange={(event) => {
                            setAdminCreditLookupBy(event.target.value);
                            setAdminCreditRecipient(null);
                            setAdminCreditConfirmed(false);
                            setAdminCreditMessage("");
                          }}
                          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                        >
                          <option value="email">{tx("Email")}</option>
                          <option value="user_id">
                            {tx("Supabase User ID")}
                          </option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="admin-credit-identifier"
                          className="text-xs text-zinc-400"
                        >
                          {adminCreditLookupBy === "email"
                            ? tx("Recipient email")
                            : tx("Recipient Supabase User ID")}
                        </label>
                        <input
                          id="admin-credit-identifier"
                          type={
                            adminCreditLookupBy === "email" ? "email" : "text"
                          }
                          required
                          value={adminCreditIdentifier}
                          onChange={(event) => {
                            setAdminCreditIdentifier(event.target.value);
                            setAdminCreditRecipient(null);
                            setAdminCreditConfirmed(false);
                            setAdminCreditMessage("");
                          }}
                          placeholder={
                            adminCreditLookupBy === "email"
                              ? "recipient@example.com"
                              : "8f14e45f-ea3b-4d5e-9a73-5d0e1a93abcd"
                          }
                          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleResolveAdminCreditRecipient}
                        disabled={adminCreditLoading}
                        className="w-full rounded-xl border border-zinc-700 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {adminCreditLoading
                          ? tx("Looking up recipient…")
                          : tx("Resolve recipient")}
                      </button>
                    </div>

                    {adminCreditRecipient && (
                      <form
                        onSubmit={handleAdminCredit}
                        className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4"
                      >
                        <div className="space-y-1 text-xs">
                          <p className="text-zinc-400">
                            {tx("Confirm recipient account")}
                          </p>
                          <p className="break-all font-semibold text-white">
                            {adminCreditRecipient.email}
                          </p>
                          <p className="break-all font-mono text-[10px] text-zinc-500">
                            {adminCreditRecipient.userId}
                          </p>
                        </div>
                        <label className="flex items-start gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            checked={adminCreditConfirmed}
                            onChange={(event) => {
                              setAdminCreditConfirmed(event.target.checked);
                              setAdminCreditMessage("");
                            }}
                            className="mt-0.5 accent-blue-500"
                          />
                          {tx("I confirm this is the intended recipient.")}
                        </label>
                        <div>
                          <label
                            htmlFor="admin-credit-asset"
                            className="text-xs text-zinc-400"
                          >
                            {tx("Asset")}
                          </label>
                          <select
                            id="admin-credit-asset"
                            value={adminCreditAsset}
                            onChange={(event) =>
                              setAdminCreditAsset(event.target.value)
                            }
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                          >
                            {[
                              "BTC",
                              "ETH",
                              "USDT",
                              "USDC",
                              "LTC",
                              "BNB",
                              "SOL",
                            ].map((asset) => (
                              <option key={asset} value={asset}>
                                {asset}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="admin-credit-amount"
                            className="text-xs text-zinc-400"
                          >
                            {tx("Amount")}
                          </label>
                          <input
                            id="admin-credit-amount"
                            type="number"
                            min="0.00000001"
                            step="any"
                            required
                            value={adminCreditAmount}
                            onChange={(event) =>
                              setAdminCreditAmount(event.target.value)
                            }
                            placeholder={tx("0.00")}
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={adminCreditLoading || !adminCreditConfirmed}
                          className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {adminCreditLoading
                            ? tx("Crediting account…")
                            : tx("Credit recipient wallet")}
                        </button>
                      </form>
                    )}

                    {adminCreditMessage && (
                      <p
                        role="status"
                        className={`text-xs ${adminCreditMessage.startsWith("Credited ") ? "text-emerald-300" : "text-amber-300"}`}
                      >
                        {tx(adminCreditMessage)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Withdrawal unavailable notice */}
      {withdrawErrorModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            ref={withdrawalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdrawal-unavailable-title"
            className="bg-[#161821] border border-zinc-800 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl"
          >
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3
                id="withdrawal-unavailable-title"
                className="font-bold text-base text-zinc-100"
              >
                {tx("Withdrawal unavailable")}
              </h3>
              <p className="text-xs text-zinc-400 mt-2" role="alert">
                {tx(
                  "Withdrawals are currently unavailable. Please contact our support team for assistance. We apologise for the inconvenience.",
                )}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWithdrawErrorModal(false)}
                className="flex-1 bg-zinc-900 border border-zinc-800 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
              >
                {tx("Close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawErrorModal(false);
                  navigateToTab("support");
                }}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-blue-500 transition shadow-lg shadow-blue-500/20"
              >
                {tx("Contact Support")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
