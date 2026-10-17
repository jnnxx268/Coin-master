
'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  Wallet,
  BarChart3,
  LineChart,
  Bot,
  TrendingUp,
  Copy,
  Pickaxe,
  Snowflake,
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
  ArrowRight
} from 'lucide-react';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  // App Navigation & UI States
  const [activeTab, setActiveTab] = useState('dashboard');
  const [walletSubTab, setWalletSubTab] = useState('deposit');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Database Data States
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Trade Execution Panel States
  const [tradeType, setTradeType] = useState('Crypto');
  const [tradeAction, setTradeAction] = useState('buy');
  const [selectedAsset, setSelectedAsset] = useState({ symbol: 'AVAX', name: 'Avalanche', price: '9.19' });
  const [tradeAmount, setTradeAmount] = useState('');
  const [leverage, setLeverage] = useState(5);
  const [hideChart, setHideChart] = useState(false);

  // Withdrawal 4-Step Wizard States
  const [withdrawStep, setWithdrawStep] = useState(1);
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessingWithdraw, setIsProcessingWithdraw] = useState(false);
  const [withdrawErrorModal, setWithdrawErrorModal] = useState(false);

  // 1. Check Supabase Auth Session on mount
  useEffect(() => {
    async function getAuthUser() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          setUser(currentUser);
          setOnboardingStage('app');
        }
      } catch (err) {
        console.error('Auth session error:', err);
      } finally {
        setUserLoading(false);
      }
    }
    getAuthUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setOnboardingStage('app');
      } else {
        setUser(null);
      }
      setUserLoading(false);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // 2. Fetch User Transactions & Notifications from Supabase
  useEffect(() => {
    async function fetchUserData() {
      if (!user) return;
      setLoadingData(true);
      try {
        const { data: txData } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (txData) setTransactions(txData);

        const { data: notifData } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (notifData) setNotifications(notifData);
      } catch (err) {
        console.error('Database fetch error:', err);
      } finally {
        setLoadingData(false);
      }
    }

    fetchUserData();
  }, [user]);

  // Handle Standalone Sign In / Sign Up
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) setAuthError(error.message);
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) setAuthError(error.message);
        else setAuthError('Account created! Please check your email for confirmation.');
      }
    } catch (err) {
      setAuthError('An unexpected authentication error occurred.');
    }
  };

  const handleSignOut = async () => {
    setUserDropdownOpen(false);
    await supabase.auth.signOut();
    setUser(null);
    setOnboardingStage('auth');
  };

  // Withdrawal Wizard Flow Handler
  const handleWithdrawSubmit = (e) => {
    e.preventDefault();
    if (!withdrawMethod || !withdrawAddress || !withdrawAmount) return;

    setIsProcessingWithdraw(true);
    setTimeout(() => {
      setIsProcessingWithdraw(false);
      setWithdrawErrorModal(true);
    }, 2000);
  };

  const getUserInitials = () => {
    if (!user || !user.email) return 'CM';
    return user.email.substring(0, 2).toUpperCase();
  };

  const marketTickers = [
    { symbol: 'US 500', name: 'S&P 500 Index', price: '5,864.20', change: '+0.04%', positive: true },
    { symbol: 'US 100', name: 'US 100 Cash CFD', price: '29,810.70', change: '-0.20%', positive: false },
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', price: '1.12132', change: '-0.07%', positive: false },
    { symbol: 'BTC/USD', name: 'Bitcoin', price: '82,130.00', change: '+0.68%', positive: true },
    { symbol: 'ETH/USD', name: 'Ethereum', price: '2,440.10', change: '+0.89%', positive: true },
    { symbol: 'XAU/USD', name: 'Gold Spot', price: '2,721.40', change: '+0.15%', positive: true },
  ];

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
            <h1 className="text-xl font-bold tracking-tight">Welcome to Coin Master</h1>
            <p className="text-xs text-zinc-400">Select your country and preferred language to continue</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>Select Country</span>
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="Nigeria">Nigeria</option>
                <option value="United States">United States</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="Canada">Canada</option>
                <option value="Germany">Germany</option>
                <option value="Ghana">Ghana</option>
              </select>
            </div>

            <div>
              <label className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">
                <Languages className="w-3.5 h-3.5 text-blue-500" />
                <span>Language Translation Preference</span>
              </label>
              <select
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
              onClick={() => setOnboardingStage('auth')}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 text-xs flex items-center justify-center space-x-2"
            >
              <span>Continue to Authentication</span>
              <ArrowRight className="w-4 h-4" />
            </button>
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
              {authMode === 'login' ? 'Sign In to Coin Master' : 'Create Account'}
            </h1>
            <p className="text-xs text-zinc-400">
              Region: <span className="text-blue-400 font-medium">{selectedCountry}</span> | Lang:{' '}
              <span className="text-blue-400 font-medium">{selectedLanguage}</span>
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@example.com"
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Password</label>
              <input
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
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError('');
              }}
              className="text-xs text-zinc-400 hover:text-blue-400 transition"
            >
              {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
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
      {/* SCROLLING TICKER TAPE */}
      <div className="w-full bg-[#12141a] border-b border-zinc-800/80 overflow-hidden py-2 select-none">
        <div className="flex w-max animate-marquee space-x-6 px-4">
          {[...marketTickers, ...marketTickers].map((item, idx) => (
            <div
              key={idx}
              className="flex items-center space-x-3 bg-zinc-900/60 border border-zinc-800/60 px-3 py-1.5 rounded-lg text-xs hover:border-zinc-700 transition"
            >
              <span className="font-semibold text-zinc-200">{item.symbol}</span>
              <span className="text-zinc-400">{item.price}</span>
              <span className={`font-mono ${item.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
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
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              CM
            </div>
            <span className="font-bold text-lg tracking-tight hidden sm:inline-block">Coin Master</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-zinc-900 border border-zinc-800 px-3.5 py-1.5 rounded-xl flex items-center space-x-2 text-xs font-medium">
            <span className="text-zinc-400">Balance:</span>
            <span className="text-emerald-400 font-bold">$50,565,000.00</span>
          </div>

          {/* Notifications Center */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full ring-2 ring-[#12141a]" />
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[#161821] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50">
                <div className="px-4 py-2 border-b border-zinc-800 flex justify-between items-center">
                  <span className="font-semibold text-sm">Notifications</span>
                  <span className="text-[10px] text-blue-400 font-mono">Supabase Sync</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-xs text-zinc-500 text-center">No notifications found</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="p-3 hover:bg-zinc-800/40 text-xs transition">
                        <div className="font-medium text-zinc-200">{n.title}</div>
                        <div className="text-zinc-400 mt-0.5">{n.message}</div>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {new Date(n.created_at).toLocaleDateString()}
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
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
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
              <div className="absolute right-0 mt-2 w-64 bg-[#161821] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 text-xs">
                <div className="px-4 py-2.5 border-b border-zinc-800">
                  <p className="text-zinc-400">Signed in as</p>
                  <p className="font-medium text-zinc-100 truncate mt-0.5">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setActiveTab('wallet');
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
                    onClick={() => setActiveTab('dashboard')}
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
                    onClick={() => setActiveTab('wallet')}
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
                <div className="space-y-1">
                  {[
                    { id: 'markets', label: 'Markets', icon: BarChart3 },
                    { id: 'trade', label: 'Trade', icon: LineChart },
                    { id: 'bots', label: 'Trading Bots', icon: Bot },
                    { id: 'investments', label: 'Investments', icon: TrendingUp },
                    { id: 'copy', label: 'Copy Trading', icon: Copy },
                    { id: 'mining', label: 'Mining', icon: Pickaxe },
                  ].map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
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
                    onClick={() => setActiveTab('portfolio')}
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
                    onClick={() => setActiveTab('support')}
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* TOP MARKETS */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-base">Top Markets</h2>
                  <button onClick={() => setActiveTab('markets')} className="text-xs text-blue-400 hover:underline font-medium">
                    View all →
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {marketTickers.slice(0, 6).map((m, idx) => (
                    <div key={idx} className="bg-[#161821] border border-zinc-800/60 rounded-xl p-3.5 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-sm">{m.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{m.symbol}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold">${m.price}</div>
                        <div className={`text-xs font-mono mt-0.5 ${m.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {m.change}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RECENT TRANSACTIONS SNAPSHOT (Separate from Wallet Section Ledger) */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-base">Recent Transactions (Quick View)</h2>
                  <button onClick={() => setActiveTab('wallet')} className="text-xs text-blue-400 hover:underline font-medium">
                    View Full Ledger in Wallet →
                  </button>
                </div>
                {loadingData ? (
                  <div className="py-8 text-center text-xs text-zinc-500">Loading Supabase records...</div>
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
                            <td className="py-3 font-mono">${tx.amount}</td>
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

              {/* PINNED BOTTOM LIVE CHART & QUICK TRADE PANEL */}
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-base">{selectedAsset.symbol} / USDT</span>
                    <span className="text-emerald-400 font-mono text-sm">${selectedAsset.price}</span>
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
                    [ TradingView Live Candle Chart - {selectedAsset.symbol}/USDT (15m) ]
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium uppercase">Asset Type</label>
                      <select
                        value={tradeType}
                        onChange={(e) => setTradeType(e.target.value)}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option>Crypto</option>
                        <option>Stocks</option>
                        <option>Forex</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium uppercase">Trade Amount ($)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 font-medium uppercase">Leverage ({leverage}x)</label>
                      <input
                        type="range"
                        min="2"
                        max="100"
                        value={leverage}
                        onChange={(e) => setLeverage(e.target.value)}
                        className="mt-2 w-full accent-blue-500"
                      />
                    </div>
                  </div>

                  <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-3 rounded-xl transition shadow-lg shadow-emerald-500/10 text-xs">
                    Execute Trade ({tradeAction.toUpperCase()} {selectedAsset.symbol})
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-[#12141a] border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h1 className="text-xl font-bold">Wallet Hub</h1>
                    <p className="text-xs text-zinc-400 mt-1">Manage deposits, withdrawals, and full financial ledger</p>
                  </div>

                  <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
                    {['deposit', 'withdraw', 'transfer'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setWalletSubTab(st)}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition ${
                          walletSubTab === st ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {walletSubTab === 'deposit' && (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-400">Select payment method:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {['Bitcoin', 'Ethereum', 'USDT', 'Bitcoin Cash'].map((coin) => (
                        <div key={coin} className="bg-[#161821] border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                          <span className="font-medium text-sm">{coin}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active
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
                      <div>
                        <label className="text-xs text-zinc-400">Withdrawal Asset</label>
                        <select
                          value={withdrawMethod}
                          onChange={(e) => setWithdrawMethod(e.target.value)}
                          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select Method</option>
                          <option value="USDT">USDT (TRC20)</option>
                          <option value="BTC">Bitcoin (BTC)</option>
                          <option value="ETH">Ethereum (ERC20)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400">Target Wallet Address</label>
                        <input
                          type="text"
                          placeholder="Paste destination address"
                          value={withdrawAddress}
                          onChange={(e) => setWithdrawAddress(e.target.value)}
                          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400">Amount ($)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isProcessingWithdraw}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20 text-xs"
                      >
                        {isProcessingWithdraw ? 'Processing Request...' : 'Confirm Withdrawal'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ERROR 201 MODAL */}
      {withdrawErrorModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#161821] border border-zinc-800 rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-zinc-100">Error 201</h3>
              <p className="text-xs text-zinc-400 mt-2">
                Could not process request at this moment. Please contact customer support.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setWithdrawErrorModal(false)}
                className="flex-1 bg-zinc-900 border border-zinc-800 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setWithdrawErrorModal(false);
                  setActiveTab('support');
                }}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-blue-500 transition shadow-lg shadow-blue-500/20"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
