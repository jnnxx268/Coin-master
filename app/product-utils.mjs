const LANGUAGE_LOCALES = {
  English: 'en',
  French: 'fr',
  Spanish: 'es',
  Portuguese: 'pt',
  German: 'de',
};

const COUNTRY_REGION_CODES = {
  Argentina: 'AR',
  Brazil: 'BR',
  Canada: 'CA',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  'Costa Rica': 'CR',
  'Dominican Republic': 'DO',
  France: 'FR',
  Germany: 'DE',
  Ghana: 'GH',
  India: 'IN',
  Italy: 'IT',
  Jamaica: 'JM',
  Japan: 'JP',
  Mexico: 'MX',
  Netherlands: 'NL',
  Nigeria: 'NG',
  Panama: 'PA',
  Peru: 'PE',
  Singapore: 'SG',
  'South Korea': 'KR',
  Spain: 'ES',
  Switzerland: 'CH',
  'United Kingdom': 'GB',
  'United States': 'US',
};

export const PLAN_PRICES = Object.freeze({
  starter: 0,
  active: 19,
  advanced: 49,
});

export const normalizePlanKey = (value) =>
  typeof value === 'string' && Object.hasOwn(PLAN_PRICES, value)
    ? value
    : null;

export const createPlanSelectionStore = (
  storage,
  storageKey,
  eventTarget = globalThis
) => {
  let snapshot = null;
  let initialized = false;
  const listeners = new Set();
  const getSnapshot = () => {
    if (!initialized) {
      try {
        snapshot = normalizePlanKey(storage.getItem(storageKey));
      } catch (error) {
        console.error('Selected plan read error:', error);
        snapshot = null;
      }
      initialized = true;
    }
    return snapshot;
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    const handleStorage = (event) => {
      if (event.key !== storageKey) return;
      initialized = false;
      getSnapshot();
      listeners.forEach((notify) => notify());
    };
    eventTarget.addEventListener?.('storage', handleStorage);
    return () => {
      listeners.delete(listener);
      eventTarget.removeEventListener?.('storage', handleStorage);
    };
  };
  const select = (value) => {
    const normalizedPlan = normalizePlanKey(value);
    if (!normalizedPlan) {
      throw new TypeError('A supported plan must be selected.');
    }

    snapshot = normalizedPlan;
    initialized = true;
    listeners.forEach((listener) => listener());
    storage.setItem(storageKey, normalizedPlan);
  };

  return { getSnapshot, subscribe, select };
};

export const buildSignupMetadata = (country, language, selectedPlan) => {
  const plan = normalizePlanKey(selectedPlan);

  return {
    country,
    preferred_language: language,
    ...(plan ? { selected_plan: plan } : {}),
  };
};

export const resolveAppLocale = (language, country) => {
  const languageCode = LANGUAGE_LOCALES[language] || 'en';
  const regionCode = COUNTRY_REGION_CODES[country];
  return regionCode ? `${languageCode}-${regionCode}` : languageCode;
};

export const formatNumber = (value, locale, options = {}) => {
  const parsedValue = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value;
  if (!Number.isFinite(parsedValue)) return '';

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    ...options,
  }).format(parsedValue);
};

export const formatCurrency = (
  value,
  currency,
  locale,
  unavailableLabel = 'Price unavailable',
  options = {}
) => {
  const parsedValue = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value;
  if (!Number.isFinite(parsedValue)) return unavailableLabel;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    ...options,
  }).format(parsedValue);
};

export const formatAssetAmount = (value, locale) =>
  formatNumber(value, locale, { maximumFractionDigits: 8 });

export const formatFinancialAmount = (value, locale) =>
  formatNumber(value, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatDate = (value, locale) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
};

export const formatDateTime = (value, locale) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
};

export const getConversionEstimate = (
  amount,
  sourcePrice,
  destinationPrice
) => {
  if (typeof amount === 'string' && amount.trim() === '') return null;

  const quantity = Number(amount);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(sourcePrice) ||
    sourcePrice <= 0 ||
    !Number.isFinite(destinationPrice) ||
    destinationPrice <= 0
  ) {
    return null;
  }

  const estimatedAmount = (quantity * sourcePrice) / destinationPrice;
  return Number.isFinite(estimatedAmount) && estimatedAmount > 0
    ? estimatedAmount
    : null;
};

const parseFinancialAmountCents = (amount) => {
  const text = typeof amount === 'number' && Number.isFinite(amount)
    ? String(amount)
    : typeof amount === 'string'
      ? amount.trim()
      : '';
  const match = /^(?:(\d+)(?:\.(\d{0,2}))?|\.(\d{1,2}))$/.exec(text);
  if (!match) return null;

  const wholePart = match[1] || '0';
  const fractionalPart = match[2] ?? match[3] ?? '';
  const cents = BigInt(wholePart) * 100n
    + BigInt(fractionalPart.padEnd(2, '0') || '0');
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(cents);
};

const financialAmountFromCents = (cents) => cents / 100;

export const getDepositFeeDetails = (amount) => {
  const grossCents = parseFinancialAmountCents(amount);
  if (grossCents === null) return null;

  const feeCents = Number(
    (BigInt(grossCents) * 7n + 50n) / 100n
  );
  const grossAmount = financialAmountFromCents(grossCents);
  const feeAmount = financialAmountFromCents(feeCents);
  return {
    grossAmount,
    feeAmount,
    netAmount: financialAmountFromCents(grossCents - feeCents),
  };
};

export const getWithdrawalFeeDetails = (amount) => {
  const amountCents = parseFinancialAmountCents(amount);
  if (amountCents === null) return null;

  const requestedAmount = financialAmountFromCents(amountCents);
  return {
    grossAmount: requestedAmount,
    feeAmount: 0,
    netAmount: requestedAmount,
  };
};

export const getTransactionPageResult = (rows, pageSize) => {
  if (!Array.isArray(rows) || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new TypeError('Transaction rows and a positive page size are required.');
  }

  const data = rows.slice(0, pageSize);
  const lastTransaction = data.at(-1);
  return {
    data,
    hasMore: rows.length > pageSize,
    nextCursor: lastTransaction
      ? {
          created_at: lastTransaction.created_at,
          id: lastTransaction.id,
        }
      : null,
  };
};

export const buildTransactionCursorFilter = (cursor) => {
  if (
    !cursor ||
    typeof cursor.created_at !== 'string' ||
    !Number.isFinite(Date.parse(cursor.created_at)) ||
    typeof cursor.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      cursor.id
    )
  ) {
    throw new TypeError('A valid transaction cursor is required.');
  }

  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
};

export const filterTransactionsByType = (transactions, type) =>
  type === 'all'
    ? transactions
    : transactions.filter((transaction) => transaction.type === type);

export const getTransactionStatusPresentation = (status) => {
  const normalizedStatus = typeof status === 'string'
    ? status.trim().toLowerCase().replaceAll(/[_-]+/g, ' ')
    : '';
  const statusAliases = {
    complete: 'completed',
    successful: 'completed',
    cancelled: 'canceled',
  };
  const label = statusAliases[normalizedStatus] || normalizedStatus || 'Unknown';
  const styles = {
    completed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    pending: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    approved: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
    declined: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
    verified: 'border-teal-500/20 bg-teal-500/10 text-teal-300',
    rejected: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
    failed: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
    processing: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
    canceled: 'border-zinc-700 bg-zinc-800/60 text-zinc-300',
    refunded: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
    reversed: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
  };

  return {
    label,
    className: `inline-flex rounded-full border px-2 py-1 text-[10px] ${
      styles[label] || 'border-zinc-700 bg-zinc-800/60 text-zinc-300'
    }`,
  };
};

export const getAuthenticationErrorMessage = (error) => {
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  const message = typeof error?.message === 'string'
    ? error.message.toLowerCase()
    : '';

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Email not confirmed. Resend the confirmation email below.';
  }
  if (
    code === 'user_already_confirmed' ||
    message.includes('email already confirmed')
  ) {
    return 'Email is already confirmed. Try signing in.';
  }
  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials')
  ) {
    return 'Invalid email or password.';
  }
  if (
    code === 'user_already_exists' ||
    message.includes('user already registered') ||
    message.includes('user already exists')
  ) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code === 'weak_password' || message.includes('password should be at least')) {
    return 'Password does not meet the requirements. Choose a stronger password and try again.';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'too_many_requests' ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return 'Too many requests. Please wait before trying again.';
  }
  if (
    code === 'otp_expired' ||
    code === 'session_not_found' ||
    message.includes('expired') ||
    message.includes('invalid token') ||
    message.includes('auth session missing')
  ) {
    return 'This link is invalid or has expired. Request a new link and try again.';
  }

  return 'Authentication could not be completed. Please try again.';
};

export const getPasswordRecoveryFailureKind = (urlValue) => {
  const url = new URL(urlValue, 'https://coinmaster.invalid');
  const hashParams = new URLSearchParams(url.hash.slice(1));
  const errorCode = url.searchParams.get('error_code') ||
    hashParams.get('error_code');
  const error = url.searchParams.get('error') || hashParams.get('error');

  if (!errorCode && !error) return null;
  return errorCode === 'otp_expired' ? 'expired' : 'verification_failed';
};
