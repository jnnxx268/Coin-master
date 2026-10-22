
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
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
  Check
} from 'lucide-react';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const DISPLAY_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'GHS', 'NGN'];
const DISPLAY_CURRENCY_STORAGE_KEY = 'coinmaster.display-currency';
const WATCHLIST_STORAGE_KEY = 'coinmaster.watchlist-alerts';
const ACTIVE_TAB_STORAGE_KEY = 'coinmaster.active-tab';
const APP_SECTION_IDS = [
  'dashboard',
  'wallet',
  'markets',
  'trade',
  'transaction-history',
  'investments',
  'mining',
  'watchlist',
  'portfolio',
  'support',
];
const PRICE_REFRESH_INTERVAL_MS = 60_000;
const COINGECKO_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price';
const PRICED_CRYPTO_ASSETS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
];

const formatCurrency = (amount, currency) => {
  if (!Number.isFinite(amount)) return 'Price unavailable';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatAssetAmount = (amount) =>
  Number(amount).toLocaleString('en-US', { maximumFractionDigits: 8 });

const getWithdrawalNetwork = (asset) => ({
  USDT: 'TRON (TRC20)',
  BTC: 'Bitcoin network',
  ETH: 'Ethereum (ERC20)',
}[asset] || 'Not selected');

const maskWithdrawalAddress = (address) => {
  const normalizedAddress = address.trim();
  if (normalizedAddress.length <= 10) return '•'.repeat(normalizedAddress.length);

  return `${normalizedAddress.slice(0, 6)}…${normalizedAddress.slice(-4)}`;
};

const getCryptoPrice = (prices, assetSymbol, currency) => {
  const asset = PRICED_CRYPTO_ASSETS.find(
    (pricedAsset) => pricedAsset.symbol === assetSymbol
  );

  return asset ? prices[asset.id]?.[currency]?.price : undefined;
};

const requireSupabaseClient = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured for this application.');
  }

  return supabase;
};

const getWatchlistLoadErrorMessage = (error, hasBrowserSettings) => {
  const suffix = hasBrowserSettings
    ? ' Browser-saved settings are shown and were not changed.'
    : ' Any browser-saved settings were preserved.';
  const code = error?.code;
  const status = error?.status;

  if (!supabase) {
    return `Account settings are unavailable because the Supabase connection is not configured.${suffix}`;
  }
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    status === 404
  ) {
    return `Account settings could not be found. Confirm the watchlist migration is applied to the configured Supabase project.${suffix}`;
  }
  if (code === '42501' || status === 401 || status === 403) {
    return `Supabase denied access to account settings. Check the authenticated role grants and owner-scoped RLS policies.${suffix}`;
  }
  if (error instanceof TypeError || /fetch|network/i.test(error?.message || '')) {
    return `Could not connect to account settings. Check the Supabase URL and network connection, then retry.${suffix}`;
  }

  return `Could not load account settings. Check the Supabase connection, watchlist migration, and access policies, then retry.${suffix}`;
};

const parseWatchlistPreferences = (preferences) => {
  if (
    !preferences ||
    !Array.isArray(preferences.watchlist) ||
    !Array.isArray(preferences.alerts) ||
    preferences.watchlist.some((symbol) =>
      !PRICED_CRYPTO_ASSETS.some((asset) => asset.symbol === symbol)
    ) ||
    preferences.alerts.some((alert) =>
      !alert ||
      typeof alert.id !== 'string' ||
      !PRICED_CRYPTO_ASSETS.some((asset) => asset.symbol === alert.symbol) ||
      !['above', 'below'].includes(alert.condition) ||
      !DISPLAY_CURRENCIES.includes(alert.currency) ||
      typeof alert.threshold !== 'number' ||
      !Number.isFinite(alert.threshold) ||
      alert.threshold <= 0 ||
      !(alert.triggeredAt === null || typeof alert.triggeredAt === 'string') ||
      !(alert.triggeredPrice === null ||
        (typeof alert.triggeredPrice === 'number' &&
          Number.isFinite(alert.triggeredPrice)))
    )
  ) {
    throw new Error('Saved watchlist or price alert data is invalid.');
  }

  return {
    watchlist: [...new Set(preferences.watchlist)],
    alerts: preferences.alerts,
  };
};

const loadLegacyWatchlistPreferences = (userId) => {
  const storedPreferences = globalThis.localStorage.getItem(
    `${WATCHLIST_STORAGE_KEY}.${userId}`
  );
  if (storedPreferences === null) return null;

  return parseWatchlistPreferences(JSON.parse(storedPreferences));
};

const saveWatchlistPreferencesToSupabase = async (userId, preferences) => {
  const client = requireSupabaseClient();
  const { error } = await client
    .from('user_watchlist_preferences')
    .upsert(
      {
        user_id: userId,
        watchlist: preferences.watchlist,
        price_alerts: preferences.alerts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
};

const loadWatchlistPreferencesFromSupabase = async (userId) => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from('user_watchlist_preferences')
    .select('watchlist, price_alerts')
    .eq('user_id', userId)
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
    .from('user_watchlist_preferences')
    .insert({
      user_id: userId,
      watchlist: legacyPreferences.watchlist,
      price_alerts: legacyPreferences.alerts,
    });

  if (!insertError) return legacyPreferences;

  if (insertError.code === '23505') {
    const { data: racedData, error: racedReadError } = await client
      .from('user_watchlist_preferences')
      .select('watchlist, price_alerts')
      .eq('user_id', userId)
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
    .from('wallet_balances')
    .select('asset, balance, updated_at')
    .eq('user_id', userId)
    .order('asset', { ascending: true });

  if (error) throw error;

  return data || [];
};

const loadAccountActivity = async (userId) => {
  const client = requireSupabaseClient();
  const [transactionsResult, notificationsResult] = await Promise.all([
    client
      .from('transactions')
      .select('id, user_id, type, amount, currency, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    client
      .from('notifications')
      .select('id, user_id, title, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  ]);

  return { transactionsResult, notificationsResult };
};

const fingerprintTransferPayload = async (payload) => {
  if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) {
    throw new Error('Secure browser cryptography is unavailable.');
  }

  const encodedPayload = new globalThis.TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    encodedPayload
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export default function CoinMasterApp() {
  // Onboarding & Auth Flow States
  // Steps: 'country-lang' -> 'auth' -> 'app'
  const [onboardingStage, setOnboardingStage] = useState('country-lang');
  const [selectedCountry, setSelectedCountry] = useState('Nigeria');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Supabase User Session State
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [authSessionError, setAuthSessionError] = useState('');
  const currentUserIdRef = useRef(null);
  const authEventVersionRef = useRef(0);
  const authMountedRef = useRef(false);

  // App Navigation & UI States
  const [activeTab, setActiveTab] = useState('dashboard');
  const [navigationPreferenceError, setNavigationPreferenceError] = useState('');
  const [walletSubTab, setWalletSubTab] = useState('deposit');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Database Data States
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState('');
  const [notificationsError, setNotificationsError] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');

  // Wallet balances are loaded for the signed-in user from Supabase.
  const [walletBalances, setWalletBalances] = useState([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const currencyPreferenceLoadedRef = useRef(false);
  const [currencyPreferenceError, setCurrencyPreferenceError] = useState('');
  const [priceRefreshKey, setPriceRefreshKey] = useState(0);
  const [watchlistSymbols, setWatchlistSymbols] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [alertAssetSymbol, setAlertAssetSymbol] = useState('BTC');
  const [alertCondition, setAlertCondition] = useState('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [watchlistError, setWatchlistError] = useState('');
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
  const [transferEmail, setTransferEmail] = useState('');
  const [transferAsset, setTransferAsset] = useState('USDT');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');
  const transferInFlightRef = useRef(false);
  const [walletIdCopied, setWalletIdCopied] = useState(false);
  const [walletIdCopyMessage, setWalletIdCopyMessage] = useState('');
  const [adminCreditLookupBy, setAdminCreditLookupBy] = useState('email');
  const [adminCreditIdentifier, setAdminCreditIdentifier] = useState('');
  const [adminCreditRecipient, setAdminCreditRecipient] = useState(null);
  const [adminCreditConfirmed, setAdminCreditConfirmed] = useState(false);
  const [adminCreditAsset, setAdminCreditAsset] = useState('USDT');
  const [adminCreditAmount, setAdminCreditAmount] = useState('');
  const [adminCreditLoading, setAdminCreditLoading] = useState(false);
  const [adminCreditMessage, setAdminCreditMessage] = useState('');
  const adminCreditInFlightRef = useRef(false);

  // Trade preview state; no order execution is connected.
  const [tradeAction, setTradeAction] = useState('buy');
  const [selectedAsset, setSelectedAsset] = useState({
    symbol: 'BTC',
    name: 'Bitcoin',
  });
  const [tradeAmount, setTradeAmount] = useState('');
  const [hideChart, setHideChart] = useState(false);

  // Withdrawal 4-step review states. No withdrawal backend is connected.
  const [withdrawStep, setWithdrawStep] = useState(1);
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawValidationError, setWithdrawValidationError] = useState('');
  const [withdrawErrorModal, setWithdrawErrorModal] = useState(false);
  const isAdmin =
    user?.app_metadata?.admin === true ||
    user?.app_metadata?.admin === 'true';

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const controller = new AbortController();
    let active = true;
    let requestInFlight = false;

    const fetchPrices = async () => {
      if (requestInFlight) return;

      requestInFlight = true;
      setPriceLoading(true);
      setPriceError('');

      const params = new URLSearchParams({
        ids: PRICED_CRYPTO_ASSETS.map((asset) => asset.id).join(','),
        vs_currencies: DISPLAY_CURRENCIES.map((currency) =>
          currency.toLowerCase()
        ).join(','),
        include_24hr_change: 'true',
      });

      try {
        const response = await fetch(
          `${COINGECKO_PRICE_URL}?${params.toString()}`,
          { cache: 'no-store', signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            `Public price request failed (${response.status}).`
          );
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

            if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
              throw new Error(
                `Public price response included an invalid ${asset.symbol} price.`
              );
            }

            pricesByCurrency[currency] = {
              price,
              change: typeof change === 'number' && Number.isFinite(change)
                ? change
                : null,
            };
          }

          nextPrices[asset.id] = pricesByCurrency;
        }

        if (active && currentUserIdRef.current === user.id) {
          setCryptoPrices(nextPrices);
          setPricesUpdatedAt(new Date());
          setPriceError('');
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
                alert.currency
              );
              const triggered = Number.isFinite(price) && (
                (alert.condition === 'above' && price >= alert.threshold) ||
                (alert.condition === 'below' && price <= alert.threshold)
              );

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
                  setWatchlistError('');
                }
              } catch (err) {
                if (active && currentUserIdRef.current === user.id) {
                  console.error('Triggered price alert save error:', err);
                  setWatchlistError(
                    'A triggered alert could not be saved. Retry saving to keep this status across devices.'
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
        if (!active || err?.name === 'AbortError') return;

        console.error('Public crypto price fetch error:', err);
        setPriceError(
          err?.message || 'Public crypto prices could not be loaded.'
        );
      } finally {
        requestInFlight = false;
        if (active) setPriceLoading(false);
      }
    };

    fetchPrices();
    const interval = globalThis.setInterval(
      fetchPrices,
      PRICE_REFRESH_INTERVAL_MS
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
        ) return;

        watchlistSymbolsRef.current = preferences.watchlist;
        priceAlertsRef.current = preferences.alerts;
        watchlistOwnerRef.current = userId;
        setWatchlistSymbols(preferences.watchlist);
        setPriceAlerts(preferences.alerts);
        setWatchlistOwnerId(userId);
        setWatchlistError('');
        setWatchlistUsingBrowserFallback(false);
      })
      .catch((err) => {
        if (
          !active ||
          requestId !== watchlistLoadRequestRef.current ||
          currentUserIdRef.current !== userId
        ) return;

        console.error('Watchlist preferences load error:', err);
        let browserPreferences = null;
        try {
          browserPreferences = loadLegacyWatchlistPreferences(userId);
        } catch (browserError) {
          console.error('Browser watchlist preferences read error:', browserError);
        }

        if (browserPreferences) {
          watchlistSymbolsRef.current = browserPreferences.watchlist;
          priceAlertsRef.current = browserPreferences.alerts;
          setWatchlistSymbols(browserPreferences.watchlist);
          setPriceAlerts(browserPreferences.alerts);
          setWatchlistUsingBrowserFallback(true);
        }
        setWatchlistError(
          getWatchlistLoadErrorMessage(err, Boolean(browserPreferences))
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
          DISPLAY_CURRENCY_STORAGE_KEY
        );
        if (DISPLAY_CURRENCIES.includes(savedCurrency)) {
          setDisplayCurrency(savedCurrency);
        }
      } catch (err) {
        console.error('Display currency preference read error:', err);
        setCurrencyPreferenceError(
          'Your display currency preference could not be loaded.'
        );
      }
    }

    currentUserIdRef.current = nextUserId;
    setUser(nextUser);

    if (accountChanged) {
      setAdminCreditRecipient(null);
      setAdminCreditConfirmed(false);
      setAdminCreditMessage('');
      setAdminCreditIdentifier('');
      setAdminCreditLookupBy('email');
      setAdminCreditAmount('');
      setWalletSubTab('deposit');

      if (nextUserId) {
        try {
          const savedTab = globalThis.localStorage.getItem(
            `${ACTIVE_TAB_STORAGE_KEY}.${nextUserId}`
          );
          setActiveTab(
            APP_SECTION_IDS.includes(savedTab) ? savedTab : 'dashboard'
          );
          setNavigationPreferenceError('');
        } catch (err) {
          console.error('App section preference read error:', err);
          setActiveTab('dashboard');
          setNavigationPreferenceError(
            'Your previous app section could not be restored.'
          );
        }
      } else {
        setActiveTab('dashboard');
        setNavigationPreferenceError('');
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
      setAlertAssetSymbol('BTC');
      setAlertCondition('above');
      setAlertThreshold('');
      setWatchlistLoading(Boolean(nextUser));
      setWatchlistSaving(false);
      setWatchlistError('');
      setWatchlistUsingBrowserFallback(false);

      setTransactions([]);
      setNotifications([]);
      setTransactionsError('');
      setNotificationsError('');
      setTransactionsLoading(Boolean(nextUser));
      setNotificationsLoading(Boolean(nextUser));
      setWalletBalances([]);
      setWalletError('');
      setWalletLoading(Boolean(nextUser));
    }

    if (nextUser) {
      setOnboardingStage('app');
    } else if (fromAuthEvent && accountChanged) {
      setOnboardingStage('auth');
    }
  }, []);

  const restoreAuthSession = useCallback(async () => {
    const eventVersion = authEventVersionRef.current;

    try {
      const {
        data: { session },
        error
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
      ) return;

      console.error('Auth session restoration error:', err);
      setAuthSessionError(
        supabase
          ? 'Your session could not be restored. Please try again.'
          : 'Authentication is unavailable because the Supabase connection is not configured.'
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
      (_event, session) => {
        authEventVersionRef.current += 1;
        applySessionUser(session?.user || null, true);
        setAuthSessionError('');
        setUserLoading(false);
      }
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

    loadAccountActivity(accountUserId)
      .then(({ transactionsResult, notificationsResult }) => {
        if (!active) return;

        if (transactionsResult.error) {
          console.error('Transaction fetch error:', transactionsResult.error);
          setTransactionsError('Could not load transaction history.');
          setTransactions([]);
        } else {
          setTransactions(transactionsResult.data || []);
        }

        if (notificationsResult.error) {
          console.error('Notification fetch error:', notificationsResult.error);
          setNotificationsError('Could not load notifications.');
          setNotifications([]);
        } else {
          setNotifications(notificationsResult.data || []);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('Account activity fetch error:', err);
        setTransactionsError('Could not load transaction history.');
        setNotificationsError('Could not load notifications.');
        setTransactions([]);
        setNotifications([]);
      })
      .finally(() => {
        if (active) {
          setTransactionsLoading(false);
          setNotificationsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accountUserId]);

  // Load only the current user's wallet balances.
  const fetchWalletBalances = useCallback((isCurrent = () => true) => {
    if (!user) return;

    const requestedUserId = user.id;
    const requestIsCurrent = () =>
      currentUserIdRef.current === requestedUserId && isCurrent();

    if (requestIsCurrent()) {
      setWalletBalances([]);
      setWalletError('');
      setWalletLoading(true);
    }

    loadWalletBalances(requestedUserId)
      .then((balances) => {
        if (requestIsCurrent()) {
          setWalletBalances(balances);
          setWalletError('');
        }
      })
      .catch((err) => {
        if (requestIsCurrent()) {
          console.error('Wallet balance fetch error:', err);
          setWalletBalances([]);
          setWalletError(
            'Could not load your balances. Check the connection and wallet database setup, then retry.'
          );
        }
      })
      .finally(() => {
        if (requestIsCurrent()) setWalletLoading(false);
      });
  }, [user]);

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
    setTransactionsLoading(true);
    setNotificationsLoading(true);

    try {
      const { transactionsResult, notificationsResult } =
        await loadAccountActivity(requestedUserId);
      if (currentUserIdRef.current !== requestedUserId) return;

      if (transactionsResult.error) {
        console.error('Transaction refresh error:', transactionsResult.error);
        setTransactionsError('Could not load transaction history.');
      } else {
        setTransactions(transactionsResult.data || []);
        setTransactionsError('');
      }

      if (notificationsResult.error) {
        console.error('Notification refresh error:', notificationsResult.error);
        setNotificationsError('Could not load notifications.');
      } else {
        setNotifications(notificationsResult.data || []);
        setNotificationsError('');
      }
    } catch (err) {
      if (currentUserIdRef.current !== requestedUserId) return;
      console.error('Account activity refresh error:', err);
      setTransactionsError('Could not load transaction history.');
      setNotificationsError('Could not load notifications.');
    } finally {
      if (currentUserIdRef.current === requestedUserId) {
        setTransactionsLoading(false);
        setNotificationsLoading(false);
      }
    }
  };

  const handleDemoTransfer = async (e) => {
    e.preventDefault();
    setTransferMessage('');

    const isAdminSend = walletSubTab === 'admin-send';
    const amount = Number(transferAmount);

    if (
      !transferEmail.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setTransferMessage(
        'Enter a recipient email and an amount greater than zero.'
      );
      return;
    }

    if (
      transferEmail.trim().toLowerCase() ===
      user?.email?.toLowerCase()
    ) {
      setTransferMessage(
        'You cannot transfer assets to your own account.'
      );
      return;
    }

    const recipientEmail = transferEmail.trim();
    const payload = JSON.stringify([
      user?.id,
      recipientEmail.toLowerCase(),
      transferAsset,
      amount,
      isAdminSend
    ]);
    if (!user?.id) {
      setTransferMessage('Sign in before sending a transfer.');
      return;
    }

    if (transferInFlightRef.current) return;
    transferInFlightRef.current = true;

    const requestStorageKey = `coinmaster.pending-${isAdminSend ? 'admin-send' : 'transfer'}.${user.id}`;
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
            pendingRequest.requestId
          ) ||
          typeof pendingRequest.payloadFingerprint !== 'string'
        ) {
          throw new Error('The saved transfer request is invalid.');
        }

        if (pendingRequest.payloadFingerprint !== fingerprint) {
          setTransferMessage(
            'A previous transfer has an unconfirmed result. Retry with the same recipient, asset, and amount before starting another transfer.'
          );
          transferInFlightRef.current = false;
          return;
        }
      } else {
        const requestId = globalThis.crypto?.randomUUID?.();
        if (!requestId) {
          throw new Error('This browser cannot create a secure request ID.');
        }

        pendingRequest = { requestId, payloadFingerprint: fingerprint };
        globalThis.localStorage.setItem(
          requestStorageKey,
          JSON.stringify(pendingRequest)
        );
      }
    } catch (err) {
      console.error('Transfer retry-key setup error:', err);
      setTransferMessage(
        'Could not prepare a safe transfer retry key. Allow browser storage and secure cryptography, then retry.'
      );
      transferInFlightRef.current = false;
      return;
    }

    setTransferLoading(true);
    let outcomeUnknown = true;
    let retryKeyClearFailed = false;

    try {
      const { error } = await requireSupabaseClient().rpc(
        isAdminSend ? 'admin_send_demo_asset' : 'transfer_demo_asset',
        {
          p_recipient_email: recipientEmail,
          p_asset: transferAsset,
          p_amount: amount,
          p_request_id: pendingRequest.requestId,
        }
      );

      if (error) {
        if (error.code) {
          outcomeUnknown = false;
          try {
            globalThis.localStorage.removeItem(requestStorageKey);
          } catch (storageError) {
            retryKeyClearFailed = true;
            console.error('Transfer retry-key cleanup error:', storageError);
          }
        }
        throw error;
      }

      outcomeUnknown = false;
      try {
        globalThis.localStorage.removeItem(requestStorageKey);
        setTransferMessage(
          `${isAdminSend ? 'Admin send' : 'Transfer'} of ${amount} ${transferAsset} completed.`
        );
        setTransferEmail('');
        setTransferAmount('');
      } catch (storageError) {
        retryKeyClearFailed = true;
        console.error('Transfer retry-key cleanup error:', storageError);
        setTransferMessage(
          'Transfer completed, but the browser could not clear its retry key. Retry with the same recipient, asset, and amount to confirm it safely.'
        );
      }

      setWalletLoading(true);
      await Promise.all([
        fetchWalletBalances(),
        refreshAccountActivity()
      ]);
    } catch (err) {
      console.error('Demo transfer error:', err);

      setTransferMessage(
        `${err?.message || 'Transfer result could not be confirmed.'}${outcomeUnknown ? ' Retry with the same recipient, asset, and amount to reuse the request ID.' : retryKeyClearFailed ? ' Clear this site’s saved data before starting another transfer.' : ''}`
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
        `Enter the recipient's ${adminCreditLookupBy === 'email' ? 'email' : 'Supabase User ID'}.`
      );
      return;
    }

    setAdminCreditLoading(true);
    setAdminCreditMessage('');
    setAdminCreditRecipient(null);
    setAdminCreditConfirmed(false);

    try {
      const { data, error } = await requireSupabaseClient().rpc(
        'admin_resolve_demo_asset_recipient',
        {
          p_identifier: identifier,
          p_lookup_by: adminCreditLookupBy,
        }
      );

      if (error) throw error;
      if (
        typeof data?.user_id !== 'string' ||
        typeof data?.email !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          data.user_id
        )
      ) {
        throw new Error('Recipient lookup returned an invalid account.');
      }

      setAdminCreditRecipient({
        userId: data.user_id,
        email: data.email,
        lookupBy: adminCreditLookupBy,
        identifier,
      });
    } catch (err) {
      console.error('Admin recipient lookup error:', err);
      setAdminCreditMessage(
        err?.message || 'Could not resolve the recipient account.'
      );
    } finally {
      setAdminCreditLoading(false);
    }
  };

  const handleAdminCredit = async (e) => {
    e.preventDefault();
    setAdminCreditMessage('');

    const amount = Number(adminCreditAmount);
    if (!adminCreditRecipient) {
      setAdminCreditMessage('Resolve and confirm a recipient first.');
      return;
    }
    if (!adminCreditConfirmed) {
      setAdminCreditMessage('Confirm the resolved recipient before crediting.');
      return;
    }
    if (
      adminCreditRecipient.lookupBy !== adminCreditLookupBy ||
      adminCreditRecipient.identifier !== adminCreditIdentifier.trim()
    ) {
      setAdminCreditRecipient(null);
      setAdminCreditMessage('Resolve the current recipient before crediting.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdminCreditMessage('Enter a valid amount greater than zero.');
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
            pendingRequest.requestId
          ) ||
          typeof pendingRequest.payloadFingerprint !== 'string'
        ) {
          throw new Error('The saved admin credit request is invalid.');
        }
        if (pendingRequest.payloadFingerprint !== fingerprint) {
          setAdminCreditMessage(
            'A previous credit has an unconfirmed result. Retry with the same recipient, asset, and amount before starting another credit.'
          );
          return;
        }
      } else {
        const requestId = globalThis.crypto?.randomUUID?.();
        if (!requestId) {
          throw new Error('This browser cannot create a secure request ID.');
        }
        pendingRequest = { requestId, payloadFingerprint: fingerprint };
        globalThis.localStorage.setItem(
          requestStorageKey,
          JSON.stringify(pendingRequest)
        );
      }

      setAdminCreditLoading(true);
      const { error } = await requireSupabaseClient().rpc(
        'admin_credit_demo_asset',
        {
          p_user_id: adminCreditRecipient.userId,
          p_asset: adminCreditAsset,
          p_amount: amount,
          p_request_id: pendingRequest.requestId,
        }
      );

      if (error) {
        if (error.code) {
          outcomeUnknown = false;
          try {
            globalThis.localStorage.removeItem(requestStorageKey);
          } catch (storageError) {
            retryKeyClearFailed = true;
            console.error('Admin credit retry-key cleanup error:', storageError);
          }
        }
        throw error;
      }

      outcomeUnknown = false;
      try {
        globalThis.localStorage.removeItem(requestStorageKey);
        setAdminCreditMessage(
          `Credited ${amount} ${adminCreditAsset} to ${adminCreditRecipient.email}.`
        );
        setAdminCreditAmount('');
      } catch (storageError) {
        retryKeyClearFailed = true;
        console.error('Admin credit retry-key cleanup error:', storageError);
        setAdminCreditMessage(
          'Credit completed, but the browser could not clear its retry key. Retry with the same recipient, asset, and amount to confirm it safely.'
        );
      }
    } catch (err) {
      console.error('Admin asset credit error:', err);
      setAdminCreditMessage(
        `${err?.message || 'Credit result could not be confirmed.'}${outcomeUnknown ? ' Retry with the same recipient, asset, and amount to reuse the request ID.' : retryKeyClearFailed ? ' Clear this site’s saved data before starting another credit.' : ''}`
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
      setWalletIdCopyMessage('');
      setWalletIdCopied(true);
      globalThis.setTimeout(() => setWalletIdCopied(false), 2000);
    } catch (err) {
      console.error('Wallet account ID copy error:', err);
      setWalletIdCopyMessage(
        'Could not copy the account ID. Select and copy it manually.'
      );
    }
  };

  // Handle Standalone Sign In / Sign Up
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    try {
      if (authMode === 'login') {
        const { error } = await requireSupabaseClient().auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) setAuthError(error.message);
      } else {
        const { error } = await requireSupabaseClient().auth.signUp({
          email: authEmail,
          password: authPassword,
        });

        if (error) {
          setAuthError(error.message);
        } else {
          setAuthError(
            'Account created! Please check your email for confirmation.'
          );
        }
      }
    } catch (err) {
      setAuthError(
        'An unexpected authentication error occurred.'
      );
    }
  };

  const handleSignOut = async () => {
    setUserDropdownOpen(false);

    try {
      const { error } = await requireSupabaseClient().auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error('Sign-out error:', err);
      setAuthError('Could not sign out. Please try again.');
    }
  };

  // The final step only reports availability; no withdrawal backend is connected.
  const handleWithdrawSubmit = (e) => {
    e.preventDefault();

    if (withdrawStep === 1) {
      if (!withdrawMethod) {
        setWithdrawValidationError('Select a withdrawal method to continue.');
        return;
      }
      setWithdrawValidationError('');
      setWithdrawStep(2);
      return;
    }

    if (withdrawStep === 2) {
      if (!withdrawAddress.trim()) {
        setWithdrawValidationError('Enter the destination address to continue.');
        return;
      }
      setWithdrawValidationError('');
      setWithdrawStep(3);
      return;
    }

    if (withdrawStep === 3) {
      const amount = Number(withdrawAmount);
      const wallet = walletBalances.find(
        (balance) => balance.asset === withdrawMethod
      );

      if (walletLoading || walletError || !wallet) {
        setWithdrawValidationError(
          'A current balance is required to validate this withdrawal. Refresh your balances and try again.'
        );
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        setWithdrawValidationError('Enter an amount greater than zero.');
        return;
      }
      const availableBalance = Number(wallet.balance);
      if (!Number.isFinite(availableBalance) || availableBalance < 0) {
        setWithdrawValidationError(
          'The available balance could not be validated. Refresh your balances and try again.'
        );
        return;
      }
      if (amount > availableBalance) {
        setWithdrawValidationError(
          `The amount exceeds your available ${withdrawMethod} balance of ${formatAssetAmount(wallet.balance)}.`
        );
        return;
      }

      setWithdrawValidationError('');
      setWithdrawStep(4);
      return;
    }

    if (withdrawStep === 4) {
      setWithdrawErrorModal(true);
    }
  };

  const getUserInitials = () => {
    if (!user || !user.email) return 'CM';
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
      change: change === null || change === undefined
        ? '24h change unavailable'
        : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
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
        nextCurrency
      );
      setCurrencyPreferenceError('');
    } catch (err) {
      console.error('Display currency preference save error:', err);
      setCurrencyPreferenceError(
        'Your selection applies for this session but could not be saved.'
      );
    }
  };

  const totalWalletValue = walletBalances.reduce((total, wallet) => {
    const price = getCryptoPrice(
      cryptoPrices,
      wallet.asset,
      currencyKey
    );

    return Number.isFinite(price)
      ? total + Number(wallet.balance) * price
      : total;
  }, 0);

  const unpricedWalletCount = walletBalances.filter((wallet) => {
    return !Number.isFinite(
      getCryptoPrice(cryptoPrices, wallet.asset, currencyKey)
    );
  }).length;

  const pricedPortfolioAssets = walletBalances.map((wallet) => {
    const price = getCryptoPrice(
      cryptoPrices,
      wallet.asset,
      currencyKey
    );
    const value = Number.isFinite(price)
      ? Number(wallet.balance) * price
      : null;

    return {
      ...wallet,
      price,
      value,
      allocation: Number.isFinite(value) && totalWalletValue > 0
        ? (value / totalWalletValue) * 100
        : null,
    };
  });

  const selectedAssetPrice = getCryptoPrice(
    cryptoPrices,
    selectedAsset.symbol,
    currencyKey
  );
  const parsedTradeAmount = Number(tradeAmount);
  const tradeEstimate = Number.isFinite(selectedAssetPrice) &&
    Number.isFinite(parsedTradeAmount) &&
    parsedTradeAmount > 0
    ? selectedAssetPrice * parsedTradeAmount
    : null;
  const transactionTypes = [...new Set(
    transactions.map((transaction) => transaction.type).filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
  const visibleTransactions = transactionTypeFilter === 'all'
    ? transactions
    : transactions.filter(
      (transaction) => transaction.type === transactionTypeFilter
    );

  const openTradePreview = () => {
    navigateToTab('trade');
  };

  const navigateToTab = (tab) => {
    if (!APP_SECTION_IDS.includes(tab)) return;

    setActiveTab(tab);
    if (!user?.id) return;

    try {
      globalThis.localStorage.setItem(
        `${ACTIVE_TAB_STORAGE_KEY}.${user.id}`,
        tab
      );
      setNavigationPreferenceError('');
    } catch (err) {
      console.error('App section preference save error:', err);
      setNavigationPreferenceError(
        'Your current app section could not be saved for the next visit.'
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
    ) return false;

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
      ) return false;

      watchlistSymbolsRef.current = symbols;
      priceAlertsRef.current = alerts;
      setWatchlistSymbols(symbols);
      setPriceAlerts(alerts);
      pendingWatchlistSaveRef.current = null;
      setWatchlistSavePending(false);
      setWatchlistError('');
      return true;
    } catch (err) {
      if (currentUserIdRef.current === userId) {
        console.error('Watchlist preferences save error:', err);
        setWatchlistError(
          'Could not save your watchlist or alert. Your previous saved settings are unchanged; retry to save this change.'
        );
      }
      return false;
    } finally {
      if (watchlistSavingOwnerRef.current === userId) {
        watchlistSavingRef.current = false;
        watchlistSavingOwnerRef.current = null;
      }
      if (
        currentUserIdRef.current === userId &&
        !watchlistSavingRef.current
      ) {
        setWatchlistSaving(false);
      }
    }
  };

  const retryWatchlistSave = () => {
    const pendingSave = pendingWatchlistSaveRef.current;
    if (!pendingSave || pendingSave.userId !== user?.id) return;

    saveWatchlistPreferences(
      pendingSave.watchlist,
      pendingSave.alerts
    );
  };

  const retryWatchlistLoad = () => {
    setWatchlistError('');
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
      setWatchlistError('Enter a price threshold greater than zero.');
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
        setAlertThreshold('');
      }
    } catch (err) {
      console.error('Price alert creation error:', err);
      setWatchlistError('A price alert could not be created in this browser.');
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
        <p className="text-sm text-zinc-400">Restoring your session…</p>
      </div>
    );
  }

  if (authSessionError) {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4">
        <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-4 text-center shadow-2xl">
          <h1 className="text-lg font-bold">Session unavailable</h1>
          <p className="text-sm text-rose-300" role="alert">
            {authSessionError}
          </p>
          <button
            type="button"
            onClick={() => {
              setUserLoading(true);
              setAuthSessionError('');
              restoreAuthSession();
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // ONBOARDING STAGE 1: COUNTRY & TRANSLATION
  // ==========================================
  if (!user && onboardingStage === 'country-lang') {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 mx-auto text-lg">
              CM
            </div>

            <h1 className="text-xl font-bold tracking-tight">
              Welcome to Coin Master
            </h1>

            <p className="text-xs text-zinc-400">
              Select your country and preferred language to continue
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="onboarding-country" className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>Select Country</span>
              </label>

              <select
                id="onboarding-country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="Argentina">Argentina</option>
                <option value="Brazil">Brazil</option>
                <option value="Canada">Canada</option>
                <option value="Chile">Chile</option>
                <option value="China">China</option>
                <option value="Colombia">Colombia</option>
                <option value="Costa Rica">Costa Rica</option>
                <option value="Dominican Republic">Dominican Republic</option>
                <option value="France">France</option>
                <option value="Germany">Germany</option>
                <option value="Ghana">Ghana</option>
                <option value="India">India</option>
                <option value="Italy">Italy</option>
                <option value="Jamaica">Jamaica</option>
                <option value="Japan">Japan</option>
                <option value="Mexico">Mexico</option>
                <option value="Netherlands">Netherlands</option>
                <option value="Nigeria">Nigeria</option>
                <option value="Other / not listed">Other / not listed</option>
                <option value="Panama">Panama</option>
                <option value="Peru">Peru</option>
                <option value="Singapore">Singapore</option>
                <option value="South Korea">South Korea</option>
                <option value="Spain">Spain</option>
                <option value="Switzerland">Switzerland</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="United States">United States</option>
              </select>
            </div>

            <div>
              <label htmlFor="onboarding-language" className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">
                <Languages className="w-3.5 h-3.5 text-blue-500" />
                <span>Language Translation Preference</span>
              </label>

              <select
                id="onboarding-language"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="English">English</option>
                <option value="French">French (Français)</option>
                <option value="Spanish">Spanish (Español)</option>
                <option value="Portuguese">Portuguese (Português)</option>
                <option value="German">German (Deutsch)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setOnboardingStage('auth')}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-blue-600/20"
            >
              Continue
              <ArrowRight className="inline ml-2 w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
                setOnboardingStage('auth');
              }}
              className="w-full rounded-xl border border-zinc-800 py-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Already have an account? Sign in
            </button>
            <p className="text-center text-[10px] leading-5 text-zinc-500">
              These choices only appear during sign-up; they do not configure account settings or regional availability.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // ONBOARDING STAGE 2: STANDALONE SIGN IN / SIGN UP
  // ==========================================
  if (!user && onboardingStage === 'auth') {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 mx-auto text-lg">
              CM
            </div>

            <h1 className="text-xl font-bold tracking-tight">
              {authMode === 'login'
                ? 'Sign In to Coin Master'
                : 'Create Account'}
            </h1>

            <p className="text-xs text-zinc-400">
              Region:{' '}
              <span className="text-blue-400 font-medium">
                {selectedCountry}
              </span>
              {' | Lang: '}
              <span className="text-blue-400 font-medium">
                {selectedLanguage}
              </span>
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Email Address
              </label>

              <input
                id="auth-email"
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@example.com"
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Password
              </label>

              <input
                id="auth-password"
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOnboardingStage('country-lang')}
                className="w-1/3 bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium py-3 rounded-xl hover:bg-zinc-800 transition text-xs"
              >
                Back
              </button>

              <button
                type="submit"
                className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 text-xs"
              >
                {authMode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </form>

          <div className="text-center pt-2">
            <button
              onClick={() => {
                setAuthMode(
                  authMode === 'login' ? 'signup' : 'login'
                );
                setAuthError('');
              }}
              className="text-xs text-zinc-400 hover:text-blue-400 transition"
            >
              {authMode === 'login'
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </button>
          </div>
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
        Skip to main content
      </a>
      {/* SCROLLING TICKER TAPE */}
      <div className="w-full bg-[#12141a] border-b border-zinc-800/80 overflow-hidden py-2 select-none">
        <div className="flex w-max animate-marquee space-x-6 px-4">
          {[...marketTickers, ...marketTickers].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center space-x-3 bg-zinc-900/60 border border-zinc-800/60 px-3 py-1.5 rounded-lg text-xs hover:border-zinc-700 transition"
            >
              <span className="font-semibold text-zinc-200">
                {item.symbol}
              </span>

              <span className="text-zinc-400">
                {Number.isFinite(item.price)
                  ? formatCurrency(item.price, displayCurrency)
                  : 'Price unavailable'}
              </span>

              <span
                className={`font-mono ${
                  item.positive
                    ? 'text-emerald-400'
                    : 'text-rose-400'
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
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-drawer"
            className="md:hidden p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
          >
            {mobileMenuOpen
              ? <X className="w-5 h-5" />
              : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              CM
            </div>

            <span className="font-bold text-lg tracking-tight hidden sm:inline-block">
              Coin Master
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Notifications Center */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setNotificationsOpen(!notificationsOpen)
              }
              aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ''}`}
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
              <div id="notifications-panel" role="region" aria-label="Notifications" className="absolute right-0 mt-2 w-80 bg-[#161821] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-zinc-800 flex justify-between items-center">
                  <span className="font-semibold text-sm">
                    Notifications
                  </span>

                  <span className="text-[10px] text-blue-400 font-mono">
                    Supabase Sync
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                  {notificationsLoading ? (
                    <div className="p-4 text-xs text-zinc-500 text-center" role="status">
                      Loading notifications…
                    </div>
                  ) : notificationsError ? (
                    <div className="p-4 text-xs text-rose-300 text-center" role="alert">
                      <p>{notificationsError}</p>
                      <button
                        type="button"
                        onClick={refreshAccountActivity}
                        className="mt-2 text-blue-400 hover:text-blue-300 underline"
                      >
                        Try again
                      </button>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-4 text-xs text-zinc-500 text-center">
                      No notifications found
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-3 hover:bg-zinc-800/40 text-xs transition"
                      >
                        <div className="font-medium text-zinc-200">
                          {n.title}
                        </div>

                        <div className="text-zinc-400 mt-0.5">
                          {n.message}
                        </div>

                        <div className="text-[10px] text-zinc-500 mt-1">
                          {new Date(
                            n.created_at
                          ).toLocaleDateString()}
                        </div>

                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              aria-label="User account menu"
              aria-expanded={userDropdownOpen}
              aria-controls="user-account-menu"
              className="flex items-center space-x-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1.5 rounded-xl transition"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold text-xs flex items-center justify-center">
                {getUserInitials()}
              </div>
              <span className="text-xs font-medium max-w-[120px] truncate hidden sm:inline-block">
                {user?.email || 'User'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            {userDropdownOpen && (
              <div id="user-account-menu" className="absolute right-0 mt-2 w-64 bg-[#161821] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 text-xs">
                <div className="px-4 py-2.5 border-b border-zinc-800">
                  <p className="text-zinc-400">Signed in as</p>
                  <p className="font-medium text-zinc-100 truncate mt-0.5">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      navigateToTab('wallet');
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-zinc-300 hover:bg-zinc-800/60 flex items-center space-x-2"
                  >
                    <Wallet className="w-4 h-4 text-zinc-400" />
                    <span>Wallet & Balance</span>
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/60 md:hidden"
          />
          <aside
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="fixed bottom-0 left-0 top-16 z-50 flex w-80 max-w-[85vw] flex-col border-r border-zinc-800 bg-[#12141a] shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
              <h2 className="text-sm font-semibold">Navigation</h2>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav
              aria-label="Mobile app sections"
              className="flex-1 space-y-1 overflow-y-auto p-3"
            >
              {[
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                { id: 'wallet', label: 'Wallet', icon: Wallet },
                { id: 'markets', label: 'Markets', icon: BarChart3 },
                { id: 'trade', label: 'Trade', icon: LineChart },
                { id: 'transaction-history', label: 'Transaction History', icon: History },
                { id: 'investments', label: 'Investments', icon: TrendingUp },
                { id: 'mining', label: 'Mining', icon: Pickaxe },
                { id: 'watchlist', label: 'Watchlist & Price Alerts', icon: Star },
                { id: 'portfolio', label: 'Portfolio', icon: PieChart },
                { id: 'support', label: 'Help & Support', icon: HelpCircle },
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
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? 'border border-blue-500/30 bg-blue-600/20 text-blue-300'
                        : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white'
                    }`}
                  >
                    <IconComp className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
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
                <span>Sign Out</span>
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
            sidebarCollapsed ? 'w-20' : 'w-64'
          } bg-[#12141a] border-r border-zinc-800/80 flex-col justify-between transition-all duration-200 hidden md:flex`}
        >
          <div className="p-4 space-y-6">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-end text-zinc-400 hover:text-white p-1"
            >
              {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>

            <nav className="space-y-6">
              <div>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">Main</p>
                )}
                <div className="space-y-1">
                  <button
                    onClick={() => navigateToTab('dashboard')}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === 'dashboard'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                    }`}
                  >
                    <LayoutDashboard className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>Dashboard</span>}
                  </button>

                  <button
                    onClick={() => navigateToTab('wallet')}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === 'wallet'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                    }`}
                  >
                    <Wallet className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>Wallet</span>}
                  </button>
                </div>
              </div>

              <div>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">
                    Trading & Investing
                  </p>
                )}
                {currencyPreferenceError && (
                  <p className="text-xs text-amber-300" role="status">
                    {currencyPreferenceError}
                  </p>
                )}
                <div className="space-y-1">
                  {[
                    { id: 'markets', label: 'Markets', icon: BarChart3 },
                    { id: 'trade', label: 'Trade', icon: LineChart },
                    { id: 'transaction-history', label: 'Transaction History', icon: History },
                    { id: 'investments', label: 'Investments', icon: TrendingUp },
                    { id: 'mining', label: 'Mining', icon: Pickaxe },
                    { id: 'watchlist', label: 'Watchlist & Alerts', icon: Star },
                  ].map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigateToTab(item.id)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                          activeTab === item.id
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                        }`}
                      >
                        <IconComp className="w-5 h-5 shrink-0" />
                        {!sidebarCollapsed && <span>{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                {!sidebarCollapsed && (
                  <p className="px-3 text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-2">
                    Account & Support
                  </p>
                )}
                <div className="space-y-1">
                  <button
                    onClick={() => navigateToTab('portfolio')}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === 'portfolio'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                    }`}
                  >
                    <PieChart className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>Portfolio</span>}
                  </button>

                  <button
                    onClick={() => navigateToTab('support')}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-xs transition ${
                      activeTab === 'support'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                    }`}
                  >
                    <HelpCircle className="w-5 h-5 shrink-0" />
                    {!sidebarCollapsed && <span>Help & Support</span>}
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
              {!sidebarCollapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {navigationPreferenceError && (
            <p className="mx-auto max-w-7xl text-xs text-amber-300" role="status">
              {navigationPreferenceError}
            </p>
          )}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* TOP MARKETS */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="font-semibold text-base">Crypto prices</h2>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Public prices via CoinGecko
                      {pricesUpdatedAt
                        ? ` · Updated ${pricesUpdatedAt.toLocaleTimeString()}`
                        : ''}
                    </p>
                  </div>
                  <button onClick={() => navigateToTab('markets')} className="text-xs text-blue-400 hover:underline font-medium">
                    More markets →
                  </button>
                </div>
                {priceError && (
                  <p className="mb-3 text-xs text-amber-300" role="status">
                    {pricesUpdatedAt
                      ? `Price refresh failed; showing the last successful prices. ${priceError}`
                      : `Prices are unavailable. ${priceError}`}
                    <button
                      type="button"
                      onClick={() => setPriceRefreshKey((key) => key + 1)}
                      className="ml-2 underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {marketTickers.map((m) => (
                    <div key={m.id} className="bg-[#161821] border border-zinc-800/60 rounded-xl p-3.5 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-sm">{m.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{m.symbol}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold">
                          {Number.isFinite(m.price)
                            ? formatCurrency(m.price, displayCurrency)
                            : priceLoading
                              ? 'Loading…'
                              : 'Unavailable'}
                        </div>
                        {Number.isFinite(m.price) && (
                          <div className={`text-xs font-mono mt-0.5 ${m.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
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
                  <h2 className="font-semibold text-base">Recent Transactions (Quick View)</h2>
                  <button onClick={() => navigateToTab('transaction-history')} className="text-xs text-blue-400 hover:underline font-medium">
                    View Transaction History →
                  </button>
                </div>
                {transactionsLoading ? (
                  <div className="py-8 text-center text-xs text-zinc-500">Loading Supabase records...</div>
                ) : transactionsError ? (
                  <div className="py-8 text-center text-xs text-rose-300" role="alert">
                    <p>{transactionsError}</p>
                    <button
                      type="button"
                      onClick={refreshAccountActivity}
                      className="mt-2 text-blue-400 hover:text-blue-300 underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">No transaction records in database</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500">
                          <th className="pb-3 font-medium">Type</th>
                          <th className="pb-3 font-medium">Amount</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {transactions.slice(0, 4).map((tx) => (
                          <tr key={tx.id}>
                            <td className="py-3 font-medium text-zinc-200 capitalize">{tx.type}</td>
                            <td className="py-3 font-mono">{formatAssetAmount(tx.amount)}</td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {tx.status || 'Completed'}
                              </span>
                            </td>
                            <td className="py-3 text-zinc-500">{new Date(tx.created_at).toLocaleDateString()}</td>
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
                          currencyKey
                        ),
                        displayCurrency
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => setHideChart(!hideChart)}
                    className="text-xs bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white"
                  >
                    {hideChart ? 'Show chart' : 'Hide chart'}
                  </button>
                </div>

                {!hideChart && (
                  <div className="h-48 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-center text-xs text-zinc-600 font-mono">
                    Public price reference only. Price history chart unavailable.
                  </div>
                )}

                <div className="bg-[#161821] border border-zinc-800/80 rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-900 rounded-lg">
                    {['buy', 'sell', 'convert'].map((act) => (
                      <button
                        key={act}
                        onClick={() => setTradeAction(act)}
                        className={`py-2 rounded-md font-semibold text-xs capitalize transition ${
                          tradeAction === act ? 'bg-emerald-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {act}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium uppercase">
                        {selectedAsset.symbol} quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium uppercase">
                        {tradeAction} estimate · {displayCurrency}
                      </label>
                      <p className="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-white">
                        {tradeEstimate === null
                          ? 'Enter a quantity in the preview'
                          : formatCurrency(tradeEstimate, displayCurrency)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openTradePreview}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition text-xs"
                  >
                    Review price estimate
                  </button>
                  <p className="text-[10px] text-zinc-500">
                    This preview does not execute a trade or change balances.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'markets' && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">Crypto markets</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Public reference prices from CoinGecko in {displayCurrency}.
                  {pricesUpdatedAt
                    ? ` Last updated ${pricesUpdatedAt.toLocaleString()}.`
                    : ' Waiting for the first price update.'}
                </p>
              </div>
              {priceError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200" role="status">
                  <p>{priceError}</p>
                  <button
                    type="button"
                    onClick={() => setPriceRefreshKey((key) => key + 1)}
                    className="mt-2 underline"
                  >
                    Retry price update
                  </button>
                </div>
              )}
              <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#12141a]">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-3 font-medium">Asset</th>
                      <th className="px-4 py-3 text-right font-medium">Price</th>
                      <th className="px-4 py-3 text-right font-medium">24h change</th>
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {PRICED_CRYPTO_ASSETS.map((asset) => {
                      const quote = cryptoPrices[asset.id]?.[displayCurrency];
                      return (
                        <tr key={asset.id}>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-zinc-100">{asset.name}</p>
                            <p className="mt-1 text-zinc-500">{asset.symbol}</p>
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-zinc-200">
                            {quote
                              ? formatCurrency(quote.price, displayCurrency)
                              : priceLoading
                                ? 'Loading…'
                                : 'Unavailable'}
                          </td>
                          <td className={`px-4 py-4 text-right font-mono ${
                            quote?.change === null || quote?.change === undefined
                              ? 'text-zinc-500'
                              : quote.change >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                          }`}>
                            {quote?.change === null || quote?.change === undefined
                              ? 'Unavailable'
                              : `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%`}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAsset({
                                  symbol: asset.symbol,
                                  name: asset.name,
                                });
                                navigateToTab('trade');
                              }}
                              className="rounded-lg border border-blue-500/30 px-3 py-2 text-blue-300 hover:bg-blue-500/10"
                            >
                              Preview
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-zinc-500">
                Quotes are informational public market data, not an offer or execution price.
              </p>
            </section>
          )}

          {activeTab === 'trade' && (
            <section className="mx-auto max-w-3xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">Trade preview</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Review a public price estimate. Trading execution is not connected.
                </p>
              </div>
              <div className="space-y-5 rounded-2xl border border-zinc-800 bg-[#12141a] p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="trade-action" className="text-xs text-zinc-400">
                      Preview type
                    </label>
                    <select
                      id="trade-action"
                      value={tradeAction}
                      onChange={(event) => setTradeAction(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      {['buy', 'sell', 'convert'].map((action) => (
                        <option key={action} value={action}>
                          {action.charAt(0).toUpperCase() + action.slice(1)} estimate
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="trade-asset" className="text-xs text-zinc-400">
                      Asset
                    </label>
                    <select
                      id="trade-asset"
                      value={selectedAsset.symbol}
                      onChange={(event) => {
                        const asset = PRICED_CRYPTO_ASSETS.find(
                          (candidate) => candidate.symbol === event.target.value
                        );
                        if (asset) {
                          setSelectedAsset({
                            symbol: asset.symbol,
                            name: asset.name,
                          });
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      {PRICED_CRYPTO_ASSETS.map((asset) => (
                        <option key={asset.id} value={asset.symbol}>
                          {asset.name} ({asset.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="trade-quantity" className="text-xs text-zinc-400">
                    Asset quantity
                  </label>
                  <input
                    id="trade-quantity"
                    type="number"
                    min="0"
                    step="any"
                    value={tradeAmount}
                    onChange={(event) => setTradeAmount(event.target.value)}
                    placeholder="Enter an amount"
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 font-mono text-xs text-white"
                  />
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Reference price</span>
                    <span className="font-mono text-zinc-200">
                      {formatCurrency(selectedAssetPrice, displayCurrency)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 border-t border-zinc-800 pt-3">
                    <span className="text-zinc-400">Estimated value</span>
                    <span className="font-mono font-semibold text-zinc-100">
                      {tradeEstimate === null
                        ? 'Enter quantity and wait for a price'
                        : formatCurrency(tradeEstimate, displayCurrency)}
                    </span>
                  </div>
                  {pricesUpdatedAt && (
                    <p className="mt-3 text-[10px] text-zinc-500">
                      Price updated {pricesUpdatedAt.toLocaleString()}.
                    </p>
                  )}
                </div>
                {priceError && (
                  <p className="text-xs text-amber-300" role="status">
                    {priceError}
                    {' '}
                    <button
                      type="button"
                      onClick={() => setPriceRefreshKey((key) => key + 1)}
                      className="underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-100">
                  This is a reference estimate only. No order is submitted, no balance is changed, and fees or slippage are not included.
                </div>
              </div>
            </section>
          )}

          {activeTab === 'transaction-history' && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-xl font-bold">Transaction History</h1>
                  <p className="mt-1 text-xs text-zinc-400">
                    Account transactions ordered from newest to oldest.
                    {!transactionsLoading && !transactionsError
                      ? ` ${transactions.length} record${transactions.length === 1 ? '' : 's'}.`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label
                      htmlFor="transaction-type-filter"
                      className="block text-[10px] text-zinc-400"
                    >
                      Type
                    </label>
                    <select
                      id="transaction-type-filter"
                      value={transactionTypeFilter}
                      onChange={(event) =>
                        setTransactionTypeFilter(event.target.value)
                      }
                      className="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                    >
                      <option value="all">All types</option>
                      {transactionTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll('_', ' ')}
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
                    {transactionsLoading ? 'Refreshing…' : 'Refresh history'}
                  </button>
                </div>
              </div>

              {transactionsError ? (
                <div
                  className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-xs text-rose-200"
                  role="alert"
                >
                  <p>{transactionsError}</p>
                  <button
                    type="button"
                    onClick={refreshAccountActivity}
                    className="mt-3 underline"
                  >
                    Retry transaction history
                  </button>
                </div>
              ) : transactionsLoading && transactions.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400" role="status">
                  Loading transaction history…
                </p>
              ) : transactions.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400">
                  No transaction records are available for this account.
                </p>
              ) : visibleTransactions.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-[#12141a] p-8 text-center text-sm text-zinc-400">
                  No transactions match this type.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#12141a]">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 text-right font-medium">Amount</th>
                        <th className="px-4 py-3 text-right font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Date</th>
                        <th className="px-4 py-3 text-right font-medium">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {visibleTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-4 py-4 font-medium capitalize text-zinc-200">
                            {transaction.type.replaceAll('_', ' ')}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-zinc-200">
                            {formatAssetAmount(transaction.amount)}{' '}
                            <span className="text-zinc-400">
                              {transaction.currency}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-[10px] text-zinc-300">
                              {transaction.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-zinc-400">
                            {Number.isNaN(Date.parse(transaction.created_at))
                              ? 'Date unavailable'
                              : new Date(transaction.created_at).toLocaleString()}
                          </td>
                          <td
                            className="px-4 py-4 text-right font-mono text-zinc-500"
                            title={transaction.id}
                          >
                            {transaction.id.slice(0, 8)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-zinc-500">
                This history displays records returned for your account; it does not initiate or modify transactions.
              </p>
            </section>
          )}

          {activeTab === 'portfolio' && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">Portfolio</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Your wallet holdings valued using public CoinGecko prices.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <p className="text-xs text-zinc-500">Total priced value</p>
                  <p className="mt-2 text-2xl font-bold">
                    {walletBalances.length
                      ? formatCurrency(totalWalletValue, displayCurrency)
                      : '—'}
                  </p>
                  {unpricedWalletCount > 0 && (
                    <p className="mt-2 text-[10px] text-amber-300">
                      {unpricedWalletCount} asset{unpricedWalletCount === 1 ? '' : 's'} excluded because a price is unavailable.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <p className="text-xs text-zinc-500">Valuation currency</p>
                  <p className="mt-2 text-2xl font-bold">{displayCurrency}</p>
                  <p className="mt-2 text-[10px] text-zinc-500">
                    {pricesUpdatedAt
                      ? `Prices updated ${pricesUpdatedAt.toLocaleString()}.`
                      : 'Waiting for public price data.'}
                  </p>
                </div>
              </div>
              {walletError && (
                <p className="text-xs text-rose-300" role="alert">{walletError}</p>
              )}
              {walletLoading && walletBalances.length === 0 ? (
                <p className="text-xs text-zinc-400" role="status">Loading portfolio…</p>
              ) : walletBalances.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-6 text-sm text-zinc-400">
                  No wallet holdings are available for this account.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#12141a]">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-4 py-3 font-medium">Asset</th>
                        <th className="px-4 py-3 text-right font-medium">Quantity</th>
                        <th className="px-4 py-3 text-right font-medium">Unit price</th>
                        <th className="px-4 py-3 text-right font-medium">Value</th>
                        <th className="px-4 py-3 text-right font-medium">Allocation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {pricedPortfolioAssets.map((asset) => (
                        <tr key={asset.asset}>
                          <td className="px-4 py-4 font-semibold">{asset.asset}</td>
                          <td className="px-4 py-4 text-right font-mono">
                            {formatAssetAmount(asset.balance)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-zinc-300">
                            {Number.isFinite(asset.price)
                              ? formatCurrency(asset.price, displayCurrency)
                              : 'Unavailable'}
                          </td>
                          <td className="px-4 py-4 text-right font-mono">
                            {asset.value === null
                              ? 'Unavailable'
                              : formatCurrency(asset.value, displayCurrency)}
                          </td>
                          <td className="px-4 py-4 text-right text-zinc-400">
                            {asset.allocation === null
                              ? '—'
                              : `${asset.allocation.toFixed(2)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'watchlist' && (
            <section className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">Watchlist & Price Alerts</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Follow public prices and create thresholds checked while you are signed in.
                </p>
              </div>

              {watchlistError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200" role="alert">
                  <p>{watchlistError}</p>
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
                    {watchlistSavePending ? 'Retry save' : 'Retry loading settings'}
                  </button>
                </div>
              )}
              {watchlistLoading && (
                <p
                  className="rounded-xl border border-zinc-800 bg-[#12141a] p-4 text-xs text-zinc-400"
                  role="status"
                >
                  Loading your saved watchlist and price alerts…
                </p>
              )}
              {watchlistUsingBrowserFallback && (
                <p
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200"
                  role="status"
                >
                  These settings are from this browser only. Editing is paused until account settings can be loaded, to avoid overwriting data saved on another device.
                </p>
              )}

              <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                <h2 className="font-semibold">Assets</h2>
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
                            ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                            : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        {isWatched ? '★ ' : '+ '}
                        {asset.symbol}
                      </button>
                    );
                  })}
                </div>

                {!watchlistLoading && !watchlistError && watchlistSymbols.length === 0 ? (
                  <p className="mt-5 text-xs text-zinc-500">
                    Choose assets above to add them to your account watchlist.
                  </p>
                ) : watchlistSymbols.length > 0 ? (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-zinc-500">
                        <tr className="border-b border-zinc-800">
                          <th className="py-3 font-medium">Asset</th>
                          <th className="py-3 text-right font-medium">Price</th>
                          <th className="py-3 text-right font-medium">24h change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/70">
                        {watchlistSymbols.map((symbol) => {
                          const asset = PRICED_CRYPTO_ASSETS.find(
                            (candidate) => candidate.symbol === symbol
                          );
                          const quote = cryptoPrices[asset.id]?.[displayCurrency];
                          return (
                            <tr key={symbol}>
                              <td className="py-3">
                                <span className="font-semibold">{asset.name}</span>
                                <span className="ml-2 text-zinc-500">{symbol}</span>
                              </td>
                              <td className="py-3 text-right font-mono">
                                {quote
                                  ? formatCurrency(quote.price, displayCurrency)
                                  : priceLoading
                                    ? 'Loading…'
                                    : 'Unavailable'}
                              </td>
                              <td className={`py-3 text-right font-mono ${
                                quote?.change === null || quote?.change === undefined
                                  ? 'text-zinc-500'
                                  : quote.change >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                              }`}>
                                {quote?.change === null || quote?.change === undefined
                                  ? 'Unavailable'
                                  : `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%`}
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
                <h2 className="font-semibold">Create a price alert</h2>
                <form
                  onSubmit={handlePriceAlertSubmit}
                  className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end"
                >
                  <div>
                    <label htmlFor="alert-asset" className="text-xs text-zinc-400">
                      Asset
                    </label>
                    <select
                      id="alert-asset"
                      value={alertAssetSymbol}
                      onChange={(event) => setAlertAssetSymbol(event.target.value)}
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
                    <label htmlFor="alert-condition" className="text-xs text-zinc-400">
                      Condition
                    </label>
                    <select
                      id="alert-condition"
                      value={alertCondition}
                      onChange={(event) => setAlertCondition(event.target.value)}
                      disabled={
                        !user?.id ||
                        watchlistOwnerId !== user.id ||
                        watchlistLoading ||
                        watchlistSaving ||
                        Boolean(watchlistError)
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                    >
                      <option value="above">Price reaches or exceeds</option>
                      <option value="below">Price falls to or below</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="alert-threshold" className="text-xs text-zinc-400">
                      Threshold ({displayCurrency})
                    </label>
                    <input
                      id="alert-threshold"
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={alertThreshold}
                      onChange={(event) => setAlertThreshold(event.target.value)}
                      disabled={
                        !user?.id ||
                        watchlistOwnerId !== user.id ||
                        watchlistLoading ||
                        watchlistSaving ||
                        Boolean(watchlistError)
                      }
                      placeholder="Enter target price"
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
                    Add alert
                  </button>
                </form>

                {watchlistLoading || (watchlistError && !watchlistUsingBrowserFallback)
                  ? null
                  : priceAlerts.length === 0 ? (
                  <p className="mt-5 text-xs text-zinc-500">
                    No price alerts yet.
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
                            {alert.symbol} {alert.condition === 'above' ? '≥' : '≤'}{' '}
                            {formatCurrency(alert.threshold, alert.currency)}
                          </p>
                          <p className={`mt-1 ${
                            alert.triggeredAt ? 'text-emerald-400' : 'text-zinc-500'
                          }`}>
                            {alert.triggeredAt
                              ? `Triggered at ${formatCurrency(alert.triggeredPrice, alert.currency)} · ${new Date(alert.triggeredAt).toLocaleString()}`
                              : 'Waiting for a matching public price update'}
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
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[10px] leading-5 text-zinc-500">
                  {watchlistUsingBrowserFallback
                    ? 'Account sync is unavailable; browser-saved preferences have not been changed. Alerts are checked only when this app receives a price update while open.'
                    : 'Watchlist and alert settings are saved to your account in Supabase and available across devices. Alerts are checked when this app receives a price update while open; they do not send background or email notifications.'}
                </p>
                {watchlistSaving && (
                  <p className="mt-3 text-xs text-zinc-400" role="status">
                    Saving your watchlist…
                  </p>
                )}
                {priceError && (
                  <p className="mt-3 text-xs text-amber-300" role="status">
                    Price alerts cannot be checked until price data is available. {priceError}
                    {' '}
                    <button
                      type="button"
                      onClick={() => setPriceRefreshKey((key) => key + 1)}
                      className="underline"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            </section>
          )}

          {['investments', 'mining'].includes(activeTab) && (
            <section className="mx-auto max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">
                  {{
                    investments: 'Investments',
                    mining: 'Mining',
                  }[activeTab]}
                </h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Feature status and requirements
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-[#12141a] p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-300">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="font-semibold">Not connected yet</h2>
                    <p className="text-sm leading-6 text-zinc-400">
                      {activeTab === 'investments' &&
                        'Investment products, position records, terms, and settlement logic are not configured. No investment positions or returns are being calculated.'}
                      {activeTab === 'mining' &&
                        'Mining hardware, pool connections, and verified payout records are not connected. No mining activity or rewards are being generated.'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Your existing wallet balances and history are unchanged.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateToTab('support')}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                View support information
              </button>
            </section>
          )}

          {activeTab === 'support' && (
            <section className="mx-auto max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold">Help & Support</h1>
                <p className="mt-1 text-xs text-zinc-400">
                  Account and feature information
                </p>
              </div>
              <div className="space-y-4">
                <article className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <h2 className="font-semibold">Balances and portfolio values</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Coin quantities come from your account wallet. Fiat valuations use public CoinGecko price quotes and may be delayed or unavailable. They are reference estimates, not trade execution prices.
                  </p>
                </article>
                <article className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <h2 className="font-semibold">Transfers</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Account-to-account transfers require a registered recipient and sufficient asset balance. If a request outcome is uncertain, retry the same recipient, asset, and amount so the original request can be checked safely.
                  </p>
                </article>
                <article className="rounded-2xl border border-zinc-800 bg-[#12141a] p-5">
                  <h2 className="font-semibold">Withdrawals</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Withdrawal processing and fee calculation are not connected. The review flow does not submit a request or move funds.
                  </p>
                </article>
                <article className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <h2 className="font-semibold text-amber-200">Support contact not configured</h2>
                  <p className="mt-2 text-sm leading-6 text-amber-100/70">
                    This project does not currently provide a support address or ticket service. No support request has been sent. Use the contact channel provided by the project owner.
                  </p>
                </article>
              </div>
            </section>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h1 className="text-xl font-bold">Wallet Hub</h1>
                    <p className="text-xs text-zinc-400 mt-1">View account balances and transfer assets between CoinMaster accounts. This wallet is not connected to blockchain deposits or withdrawals.</p>
                  </div>

                  {user?.id && (
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          Wallet account ID
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
                        aria-label={walletIdCopied ? 'Account ID copied' : 'Copy account ID'}
                        title={walletIdCopied ? 'Copied' : 'Copy full account ID'}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        {walletIdCopied
                          ? <Check className="h-4 w-4 text-emerald-400" />
                          : <Copy className="h-4 w-4" />}
                      </button>
                            {walletIdCopied && (
                              <span role="status" className="text-[10px] text-emerald-300">
                                Copied
                              </span>
                            )}
                            {walletIdCopyMessage && (
                              <span role="status" className="text-[10px] text-amber-300">
                                {walletIdCopyMessage}
                        </span>
                      )}
                    </div>
                  )}

                  <div role="group" aria-label="Wallet actions" className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
                    {[
                      'deposit',
                      'withdraw',
                      'transfer',
                      ...(isAdmin ? ['admin-send'] : []),
                      ...(isAdmin ? ['admin-credit'] : []),
                    ].map((st) => (
                      <button
                        key={st}
                        type="button"
                        aria-pressed={walletSubTab === st}
                        onClick={() => setWalletSubTab(st)}

                        className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition ${
                          walletSubTab === st ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {st === 'admin-credit'
                          ? 'Admin credit'
                          : st === 'admin-send'
                            ? 'Admin send'
                            : st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Your balances</h2>
                    <button type="button" onClick={() => fetchWalletBalances()} disabled={walletLoading} className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50">{walletLoading ? 'Refreshing…' : 'Refresh balances'}</button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                        Total priced value
                      </p>
                      <p className="mt-1 text-lg font-bold text-zinc-100">
                        {!walletLoading && !walletError && walletBalances.length > 0
                          ? formatCurrency(totalWalletValue, displayCurrency)
                          : '—'}
                      </p>
                      {unpricedWalletCount > 0 && (
                        <p className="mt-1 text-[10px] text-amber-300">
                          Excludes {unpricedWalletCount} asset
                          {unpricedWalletCount === 1 ? '' : 's'} without a price.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="display-currency"
                        className="text-[10px] text-zinc-400"
                      >
                        Display currency
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
                        ? `Price refresh failed. Values use the last successful update from ${pricesUpdatedAt.toLocaleString()}.`
                        : 'Prices are unavailable; fiat values are not being estimated.'}
                      {' '}
                      <button
                        type="button"
                        onClick={() => setPriceRefreshKey((key) => key + 1)}
                        className="underline"
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-500">
                    Public crypto prices refreshed about every minute.
                    {' '}
                    <a
                      href="https://www.coingecko.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Price data by CoinGecko
                    </a>
                    {pricesUpdatedAt
                      ? ` · Last updated ${pricesUpdatedAt.toLocaleString()}`
                      : ''}
                    {priceLoading && !pricesUpdatedAt
                      ? ' · Loading prices…'
                      : ''}
                  </p>
                  {walletError && (
                    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">
                      <span>{walletError}</span>
                      <button type="button" onClick={() => fetchWalletBalances()} disabled={walletLoading} className="underline disabled:opacity-50">
                        Retry
                      </button>
                    </div>
                  )}
                  {walletLoading ? (
                    <p className="text-xs text-zinc-400">Loading your balances…</p>
                  ) : walletError ? null : walletBalances.length === 0 ? (
                    <p className="text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">No wallet balance records are available for this account.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {walletBalances.map((wallet) => (
                        <div key={wallet.asset} className="bg-[#161821] border border-zinc-800 p-4 rounded-xl">
                          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{wallet.asset}</p>
                          <p className="text-lg font-bold text-emerald-400 mt-1 break-all">{formatAssetAmount(wallet.balance)}</p>
                          <p className="mt-2 text-xs font-medium text-zinc-300">
                            {Number.isFinite(
                              getCryptoPrice(
                                cryptoPrices,
                                wallet.asset,
                                currencyKey
                              )
                            )
                              ? formatCurrency(
                                Number(wallet.balance) *
                                  getCryptoPrice(
                                    cryptoPrices,
                                    wallet.asset,
                                    currencyKey
                                  ),
                                displayCurrency
                              )
                              : 'Price unavailable'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {walletSubTab === 'deposit' && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold">Deposit methods</h2>
                      <p className="mt-1 text-xs text-zinc-400">Deposit processing is not connected. No payment or blockchain deposit can be made here.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {['Bitcoin', 'Ethereum', 'USDT', 'Bitcoin Cash'].map((coin) => (
                        <div key={coin} className="bg-[#161821] border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                          <span className="font-medium text-sm">{coin}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Not connected
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {walletSubTab === 'withdraw' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      {['1. Method', '2. Details', '3. Amount', '4. Review'].map((label, idx) => (
                        <div
                          key={label}
                          className={`py-2 border-b-2 font-medium ${
                            withdrawStep === idx + 1 ? 'border-blue-500 text-blue-400' : 'border-zinc-800 text-zinc-500'
                          }`}
                        >
                          {label}
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleWithdrawSubmit} className="space-y-4 max-w-md mx-auto">
                      {withdrawStep === 1 && (
                        <div>
                          <label htmlFor="withdraw-method" className="text-xs text-zinc-400">Withdrawal method</label>
                          <select
                            id="withdraw-method"
                            value={withdrawMethod}
                            onChange={(event) => {
                              if (event.target.value !== withdrawMethod) {
                                setWithdrawAddress('');
                                setWithdrawAmount('');
                              }
                              setWithdrawMethod(event.target.value);
                              setWithdrawValidationError('');
                            }}
                            className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Select a method</option>
                            <option value="USDT">USDT · TRON (TRC20)</option>
                            <option value="BTC">Bitcoin · Bitcoin network</option>
                            <option value="ETH">ETH · Ethereum (ERC20)</option>
                          </select>
                        </div>
                      )}

                      {withdrawStep === 2 && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs">
                            <p className="text-zinc-400">Selected method</p>
                            <p className="mt-1 font-medium text-zinc-100">
                              {withdrawMethod} · {getWithdrawalNetwork(withdrawMethod)}
                            </p>
                          </div>
                          <div>
                            <label htmlFor="withdraw-address" className="text-xs text-zinc-400">Destination address</label>
                            <input
                              id="withdraw-address"
                              type="text"
                              autoComplete="off"
                              placeholder={`Enter ${withdrawMethod} destination address`}
                              value={withdrawAddress}
                              onChange={(event) => {
                                setWithdrawAddress(event.target.value);
                                setWithdrawValidationError('');
                              }}
                              className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                            />
                            <p className="mt-2 text-[10px] leading-5 text-amber-300">
                              Confirm that the address supports {getWithdrawalNetwork(withdrawMethod)}. Address compatibility is not verified here.
                            </p>
                          </div>
                        </div>
                      )}

                      {withdrawStep === 3 && (
                        <div className="space-y-3">
                          <p className="text-xs text-zinc-400">
                            Available {withdrawMethod}:{' '}
                            {walletLoading
                              ? 'Loading…'
                              : walletError
                                ? 'Unavailable'
                                : walletBalances.find((balance) => balance.asset === withdrawMethod)
                                  ? formatAssetAmount(walletBalances.find((balance) => balance.asset === withdrawMethod).balance)
                                  : 'No balance record'}
                          </p>
                          <div>
                            <label htmlFor="withdraw-amount" className="text-xs text-zinc-400">
                              Amount ({withdrawMethod})
                            </label>
                            <input
                              id="withdraw-amount"
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={withdrawAmount}
                              onChange={(event) => {
                                setWithdrawAmount(event.target.value);
                                setWithdrawValidationError('');
                              }}
                              className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      )}

                      {withdrawStep === 4 && (
                        <div className="space-y-4">
                          <h2 className="text-sm font-semibold">Review withdrawal details</h2>
                          <dl className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4">
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">Asset</dt>
                              <dd className="font-medium text-zinc-100">{withdrawMethod}</dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">Network / method</dt>
                              <dd className="text-right font-medium text-zinc-100">{getWithdrawalNetwork(withdrawMethod)}</dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">Amount</dt>
                              <dd className="font-medium text-zinc-100">{formatAssetAmount(Number(withdrawAmount))} {withdrawMethod}</dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">Network / processing fee</dt>
                              <dd className="text-right text-amber-300">Not configured</dd>
                            </div>
                            <div className="flex justify-between gap-4 py-3 text-xs">
                              <dt className="text-zinc-400">Destination</dt>
                              <dd className="font-mono text-zinc-100">{maskWithdrawalAddress(withdrawAddress)}</dd>
                            </div>
                          </dl>
                          <p className="text-xs leading-5 text-amber-300">
                            Review only. Withdrawal processing and fee calculation are not connected; no request will be submitted.
                          </p>
                        </div>
                      )}

                      {withdrawValidationError && (
                        <p id="withdraw-validation-error" className="text-xs text-rose-300" role="alert">
                          {withdrawValidationError}
                        </p>
                      )}

                      <div className="flex gap-3">
                        {withdrawStep > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setWithdrawValidationError('');
                              setWithdrawStep((step) => Math.max(1, step - 1));
                            }}
                            className="flex-1 rounded-xl border border-zinc-700 py-3 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
                          >
                            Back
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white transition hover:bg-blue-500"
                        >
                          {withdrawStep === 3
                            ? 'Review withdrawal'
                            : withdrawStep === 4
                              ? 'Confirm withdrawal'
                              : 'Continue'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {(walletSubTab === 'transfer' ||
                  (walletSubTab === 'admin-send' && isAdmin)) && (
                  <div className="space-y-4 max-w-lg">
                    <div>
                      <h2 className="text-sm font-semibold">
                        {walletSubTab === 'admin-send'
                          ? 'Admin send'
                          : 'Send assets'}
                      </h2>
                      <p className="text-xs text-zinc-400 mt-1">
                        {walletSubTab === 'admin-send'
                          ? 'Send assets to any registered account without checking or debiting the admin wallet. This is separate from Admin credit.'
                          : 'Send assets to another registered CoinMaster account by email.'}
                      </p>
                    </div>
                    <form onSubmit={handleDemoTransfer} className="space-y-4">
                      <div>
                        <label htmlFor="transfer-recipient" className="text-xs text-zinc-400">Recipient account email</label>
                        <input id="transfer-recipient" type="email" required value={transferEmail} onChange={(e) => setTransferEmail(e.target.value)} placeholder="recipient@example.com" className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label htmlFor="transfer-asset" className="text-xs text-zinc-400">Asset</label>
                        <select id="transfer-asset" value={transferAsset} onChange={(e) => setTransferAsset(e.target.value)} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500">
                          {(walletSubTab === 'admin-send'
                            ? ['BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL']
                            : ['BTC', 'ETH', 'USDT', 'USDC']
                          ).map((asset) => <option key={asset} value={asset}>{asset}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="transfer-amount" className="text-xs text-zinc-400">Amount</label>
                        <input id="transfer-amount" type="number" min="0.00000001" step="any" required value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0.00" className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500" />
                      </div>
                      {transferMessage && <p role="status" className={`text-xs ${transferMessage.includes('completed') ? 'text-emerald-400' : 'text-amber-400'}`}>{transferMessage}</p>}
                      <button type="submit" disabled={transferLoading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-xs">{transferLoading ? 'Sending assets…' : walletSubTab === 'admin-send' ? 'Send as admin' : 'Send transfer'}</button>
                    </form>
                  </div>
                )}

                {walletSubTab === 'admin-credit' && isAdmin && (
                  <div className="max-w-lg space-y-4">
                    <div>
                      <h2 className="text-sm font-semibold">Admin asset distribution</h2>
                      <p className="mt-1 text-xs text-zinc-400">
                        Credit a registered account directly. This action does not debit your wallet and is recorded in the account ledger.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="admin-credit-lookup-by"
                          className="text-xs text-zinc-400"
                        >
                          Find recipient by
                        </label>
                        <select
                          id="admin-credit-lookup-by"
                          value={adminCreditLookupBy}
                          onChange={(event) => {
                            setAdminCreditLookupBy(event.target.value);
                            setAdminCreditRecipient(null);
                            setAdminCreditConfirmed(false);
                            setAdminCreditMessage('');
                          }}
                          className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                        >
                          <option value="email">Email</option>
                          <option value="user_id">Supabase User ID</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="admin-credit-identifier"
                          className="text-xs text-zinc-400"
                        >
                          {adminCreditLookupBy === 'email'
                            ? 'Recipient email'
                            : 'Recipient Supabase User ID'}
                        </label>
                        <input
                          id="admin-credit-identifier"
                          type={adminCreditLookupBy === 'email' ? 'email' : 'text'}
                          required
                          value={adminCreditIdentifier}
                          onChange={(event) => {
                            setAdminCreditIdentifier(event.target.value);
                            setAdminCreditRecipient(null);
                            setAdminCreditConfirmed(false);
                            setAdminCreditMessage('');
                          }}
                          placeholder={
                            adminCreditLookupBy === 'email'
                              ? 'recipient@example.com'
                              : '8f14e45f-ea3b-4d5e-9a73-5d0e1a93abcd'
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
                        {adminCreditLoading ? 'Looking up recipient…' : 'Resolve recipient'}
                      </button>
                    </div>

                    {adminCreditRecipient && (
                      <form onSubmit={handleAdminCredit} className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                        <div className="space-y-1 text-xs">
                          <p className="text-zinc-400">Confirm recipient account</p>
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
                              setAdminCreditMessage('');
                            }}
                            className="mt-0.5 accent-blue-500"
                          />
                          I confirm this is the intended recipient.
                        </label>
                        <div>
                          <label
                            htmlFor="admin-credit-asset"
                            className="text-xs text-zinc-400"
                          >
                            Asset
                          </label>
                          <select
                            id="admin-credit-asset"
                            value={adminCreditAsset}
                            onChange={(event) => setAdminCreditAsset(event.target.value)}
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                          >
                            {['BTC', 'ETH', 'USDT', 'USDC', 'LTC', 'BNB', 'SOL'].map((asset) => (
                              <option key={asset} value={asset}>{asset}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="admin-credit-amount"
                            className="text-xs text-zinc-400"
                          >
                            Amount
                          </label>
                          <input
                            id="admin-credit-amount"
                            type="number"
                            min="0.00000001"
                            step="any"
                            required
                            value={adminCreditAmount}
                            onChange={(event) => setAdminCreditAmount(event.target.value)}
                            placeholder="0.00"
                            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs text-white"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={adminCreditLoading || !adminCreditConfirmed}
                          className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {adminCreditLoading ? 'Crediting account…' : 'Credit recipient wallet'}
                        </button>
                      </form>
                    )}

                    {adminCreditMessage && (
                      <p
                        role="status"
                        className={`text-xs ${adminCreditMessage.startsWith('Credited ') ? 'text-emerald-300' : 'text-amber-300'}`}
                      >
                        {adminCreditMessage}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdrawal-unavailable-title"
            className="bg-[#161821] border border-zinc-800 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl"
          >
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 id="withdrawal-unavailable-title" className="font-bold text-base text-zinc-100">Withdrawal unavailable</h3>
              <p className="text-xs text-zinc-400 mt-2" role="alert">
                No withdrawal service is connected. No request was submitted and no funds were moved.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWithdrawErrorModal(false)}
                className="flex-1 bg-zinc-900 border border-zinc-800 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawErrorModal(false);
                  navigateToTab('support');
                }}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-blue-500 transition shadow-lg shadow-blue-500/20"
              >
                Support information
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
