import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildSignupMetadata,
  buildTransactionCursorFilter,
  createPlanSelectionStore,
  filterTransactionsByType,
  formatAssetAmount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFinancialAmount,
  formatNumber,
  getAuthenticationErrorMessage,
  getConversionEstimate,
  getDepositFeeDetails,
  getWithdrawalFeeDetails,
  getPasswordRecoveryFailureKind,
  getTransactionPageResult,
  getTransactionStatusPresentation,
  normalizePlanKey,
  resolveAppLocale,
} from './product-utils.mjs';

const translationSource = await readFile(
  new URL('./app-translations.js', import.meta.url),
  'utf8'
);
const {
  APP_TRANSLATION_KEYS,
  getAppTranslationKeyCounts,
  translateAppText,
} = await import(
  `data:text/javascript;base64,${Buffer.from(translationSource).toString('base64')}`
);

test('plan selection persists, validates, and reaches signup metadata without billing', () => {
  const savedValues = new Map();
  const storage = {
    getItem: (key) => savedValues.get(key) ?? null,
    setItem: (key, value) => savedValues.set(key, value),
  };
  const firstStore = createPlanSelectionStore(storage, 'selected-plan', {});
  assert.equal(normalizePlanKey('active'), 'active');
  assert.equal(normalizePlanKey('unlisted'), null);
  firstStore.select('active');
  assert.equal(savedValues.get('selected-plan'), 'active');
  assert.equal(
    createPlanSelectionStore(storage, 'selected-plan', {}).getSnapshot(),
    'active'
  );
  assert.deepEqual(buildSignupMetadata('Canada', 'French', 'advanced'), {
    country: 'Canada',
    preferred_language: 'French',
    selected_plan: 'advanced',
  });
  assert.deepEqual(buildSignupMetadata('Canada', 'French', null), {
    country: 'Canada',
    preferred_language: 'French',
  });
});

test('conversion estimate requires positive quantity and both valid prices', () => {
  assert.equal(getConversionEstimate('0.5', 60000, 3000), 10);
  for (const [amount, source, destination] of [
    ['', 1, 1],
    ['not-a-number', 1, 1],
    ['0', 1, 1],
    ['-1', 1, 1],
    ['1', 0, 1],
    ['1', 1, Number.NaN],
    ['1', 1, 0],
  ]) {
    assert.equal(getConversionEstimate(amount, source, destination), null);
  }
});

test('deposit fee uses cent rounding and credits the reconciled net amount', () => {
  for (const [amount, feeAmount, netAmount] of [
    ['100', 7, 93],
    ['200', 14, 186],
    ['300', 21, 279],
    ['500', 35, 465],
    ['1000', 70, 930],
    ['0.50', 0.04, 0.46],
  ]) {
    const details = getDepositFeeDetails(amount);
    assert.deepEqual(details, {
      grossAmount: Number(amount),
      feeAmount,
      netAmount,
    });
    assert.equal(
      details.grossAmount,
      details.feeAmount + details.netAmount
    );
  }
  for (const amount of ['', '0', '-1', 'invalid', 'Infinity', '0.001']) {
    assert.equal(getDepositFeeDetails(amount), null);
  }
});

test('withdrawals keep the full requested amount with no processing fee', () => {
  for (const amount of ['100', '200', '500', '1.05']) {
    assert.deepEqual(getWithdrawalFeeDetails(amount), {
      grossAmount: Number(amount),
      feeAmount: 0,
      netAmount: Number(amount),
    });
  }
  for (const amount of ['', '0', '-1', 'invalid', '1.001']) {
    assert.equal(getWithdrawalFeeDetails(amount), null);
  }
});

test('number, asset, currency, and date formatting honor the selected locale', () => {
  for (const [language, country, expectedLocale] of [
    ['English', 'Nigeria', 'en-NG'],
    ['French', 'France', 'fr-FR'],
    ['Spanish', 'Spain', 'es-ES'],
    ['Portuguese', 'Brazil', 'pt-BR'],
    ['German', 'Germany', 'de-DE'],
  ]) {
    const locale = resolveAppLocale(language, country);
    assert.equal(locale, expectedLocale);
    assert.equal(
      formatNumber(1234.5, locale),
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(1234.5)
    );
    assert.ok(formatCurrency(1234.5, 'USD', locale));
  }

  const locale = resolveAppLocale('German', 'Germany');
  assert.equal(locale, 'de-DE');
  assert.match(formatNumber(1234.5, locale), /1\.234,5/);
  assert.match(formatAssetAmount(0.123456789, locale), /0,12345679/);
  assert.equal(formatFinancialAmount(1, locale), '1,00');
  assert.match(formatCurrency(1234.5, 'EUR', locale), /1\.234,50/);
  assert.equal(formatCurrency(Number.NaN, 'EUR', locale), 'Price unavailable');
  assert.ok(formatDate('2026-01-02T03:04:00Z', locale));
  assert.ok(formatDateTime('2026-01-02T03:04:00Z', locale));
  assert.equal(formatDate('not-a-date', locale), null);
  assert.equal(formatDateTime(null, locale), null);
  assert.equal(resolveAppLocale('English', 'Other / not listed'), 'en');
});

test('transaction pages and type filters use a stable timestamp-plus-id cursor', () => {
  const rows = [
    { id: '00000000-0000-4000-8000-000000000001', created_at: '2026-04-04T00:00:00Z', type: 'transfer_sent' },
    { id: '00000000-0000-4000-8000-000000000002', created_at: '2026-04-04T00:00:00Z', type: 'transfer_received' },
    { id: '00000000-0000-4000-8000-000000000003', created_at: '2026-04-03T00:00:00Z', type: 'transfer_sent' },
  ];
  const page = getTransactionPageResult(rows, 2);

  assert.deepEqual(page.data, rows.slice(0, 2));
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, {
    created_at: rows[1].created_at,
    id: rows[1].id,
  });
  assert.equal(
    buildTransactionCursorFilter(page.nextCursor),
    `created_at.lt.${rows[1].created_at},and(created_at.eq.${rows[1].created_at},id.lt.${rows[1].id})`
  );
  assert.deepEqual(filterTransactionsByType(rows, 'transfer_sent'), [
    rows[0],
    rows[2],
  ]);
  assert.throws(() => buildTransactionCursorFilter({ created_at: 'x', id: 'x' }));
  assert.equal(getTransactionPageResult([], 20).hasMore, false);
});

test('transaction status presentation preserves status distinctions and aliases', () => {
  assert.equal(getTransactionStatusPresentation('pending').label, 'pending');
  assert.equal(getTransactionStatusPresentation('failed').label, 'failed');
  assert.equal(getTransactionStatusPresentation('complete').label, 'completed');
  assert.equal(getTransactionStatusPresentation('in-review').label, 'in review');
  assert.notEqual(
    getTransactionStatusPresentation('pending').className,
    getTransactionStatusPresentation('completed').className
  );
  assert.notEqual(
    getTransactionStatusPresentation('approved').className,
    getTransactionStatusPresentation('declined').className
  );
  assert.match(
    getTransactionStatusPresentation('declined').className,
    /rose/
  );
});

test('authentication errors and reset-link states remain distinguishable', () => {
  assert.equal(
    getAuthenticationErrorMessage({ code: 'email_not_confirmed' }),
    'Email not confirmed. Resend the confirmation email below.'
  );
  assert.equal(
    getAuthenticationErrorMessage({ code: 'invalid_credentials' }),
    'Invalid email or password.'
  );
  assert.equal(
    getPasswordRecoveryFailureKind('https://coinmaster.invalid/?error_code=otp_expired'),
    'expired'
  );
  assert.equal(
    getPasswordRecoveryFailureKind('https://coinmaster.invalid/#error=access_denied'),
    'verification_failed'
  );
  assert.equal(
    getPasswordRecoveryFailureKind('https://coinmaster.invalid/'),
    null
  );
});

test('new product strings are translated consistently in all five languages', () => {
  const keyCounts = Object.values(getAppTranslationKeyCounts());
  assert.equal(new Set(keyCounts).size, 1);

  for (const language of [
    'English',
    'French',
    'Spanish',
    'Portuguese',
    'German',
  ]) {
    for (const key of [
      'Selected plan',
      'From asset',
      'To asset',
      'Estimated receive',
      'Enter a valid amount',
      'Last updated',
      'Prices updated',
      'Triggered at',
    ]) {
      if (language !== 'English') {
        assert.notEqual(translateAppText(language, key), key);
      }
    }
  }

  for (const key of [
    'Backend',
    'Withdrawal Requests',
    'Deposit Requests',
    'Processing History',
    'Net amount after fees',
    'CoinMaster processing fee (7%)',
    'Net deposit amount',
    'Deposit approved and credited.',
    'Deposit failed.',
    'Withdrawal completed.',
    'Withdrawal failed and reserved balance released.',
    'Section information',
    'Contact Support for information about this section.',
    'Wallet quantities and public market prices.',
    'Withdrawals are currently unavailable. Please contact our support team for assistance. We apologise for the inconvenience.',
  ]) {
    assert.ok(APP_TRANSLATION_KEYS.includes(key), `Missing translation key: ${key}`);
    for (const language of ['French', 'Spanish', 'Portuguese', 'German']) {
      if (key !== 'Backend') {
        assert.notEqual(translateAppText(language, key), key, `${language} is missing: ${key}`);
      }
    }
  }
});
