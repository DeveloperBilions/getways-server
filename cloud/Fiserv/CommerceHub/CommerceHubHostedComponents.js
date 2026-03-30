// Commerce Hub Hosted Components — Backend Cloud Functions

const crypto = require('crypto');
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('../../utility/utlis');

// Constants
const GATEWAY_STATE = Object.freeze({
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  DECLINED: 'DECLINED',
});

const PORTAL_NAME = 'CommerceHubSDK';
const DEFAULT_TERMINAL_ID = '10000001';
const SESSION_TTL_MS = 30 * 60 * 1000;
const AOG_PLATFORM = 'AOGCOINCLUB';

const REQUIRED_ENV_VARS = [
  'COMMERCE_HUB_MERCHANT_ID',
  'COMMERCE_HUB_API_KEY',
  'COMMERCE_HUB_API_SECRET',
  'COMMERCE_HUB_HOST_URL',
];

// Startup validation — fail fast if required env vars are missing
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`CommerceHubHostedComponents: missing required env var ${envVar}`);
  }
}

// Shared helpers

// Resolve Parse table name based on transaction type ("AOG" or "Getways")
const getTableName = (type) => (type === 'AOG' ? 'Transactions' : 'TransactionRecords');

// Generate HMAC-SHA256 signature: rawSignature = apiKey + clientRequestId + timestamp + requestBody
const generateCommerceHubSignature = (apiKey, apiSecret, requestBody, timestamp, clientRequestId) => {
  const rawSignature = `${apiKey}${clientRequestId}${timestamp}${requestBody}`;
  const hmac = crypto.createHmac('sha256', apiSecret);
  hmac.update(rawSignature);
  return hmac.digest('base64');
};

// Build full Commerce Hub request headers (HMAC auth)
const generateCommerceHubHeaders = (body = '') => {
  const apiKey = process.env.COMMERCE_HUB_API_KEY;
  const apiSecret = process.env.COMMERCE_HUB_API_SECRET;
  const clientRequestId = crypto.randomUUID();
  const timestamp = Date.now().toString();

  return {
    'Content-Type': 'application/json',
    'Client-Request-Id': clientRequestId,
    'Api-Key': apiKey,
    'Timestamp': timestamp,
    'Auth-Token-Type': 'HMAC',
    'Authorization': generateCommerceHubSignature(apiKey, apiSecret, body, timestamp, clientRequestId),
  };
};

// Generate unique merchant transaction ID
const generateMerchantTransactionId = (userId) => {
  const ts = Date.now().toString().slice(-8);
  const shortUser = userId.slice(-6);
  return `CHSDK-${shortUser}-${ts}`;
};

// Cloud Functions

// STEP 2 — Whitelist domains for CSP. Endpoint: POST /security/v1/saq/whitelist/domains
Parse.Cloud.define('commerceHubWhitelistDomains', async (request) => {
  const { domains } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Authentication required.');
  }
  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Domains array is required.');
  }

  try {
    const requestBody = { domains };
    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('[CommerceHub] Whitelisting domains', JSON.stringify({ count: domains.length }));

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/security/v1/saq/whitelist/domains`,
      requestBody,
      { headers },
    );

    console.log('[CommerceHub] Domains whitelisted successfully', JSON.stringify({ valid: response.data.validDomains?.length }));

    return {
      success: true,
      validDomains: response.data.validDomains || [],
      invalidDomains: response.data.invalidDomains || [],
    };
  } catch (error) {
    console.error('[CommerceHub] Domain whitelist failed', error.response?.data?.message || error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      'Failed to whitelist domains. Please try again.',
    );
  }
});

// STEP 3 — Acquire security credentials (server-side only). Endpoint: POST /payments-vas/v1/security/credentials
Parse.Cloud.define('commerceHubCreateCredentials', async (request) => {
  const { amount, customerInfo, billingAddress, use3DS = false } = request.params || {};

  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== 'number' || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Invalid amount: must be a positive number.');
  }

  try {
    const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
    const terminalId = process.env.COMMERCE_HUB_TERMINAL_ID || DEFAULT_TERMINAL_ID;

    const requestBody = {
      amount: { total: parsedAmount, currency: 'USD' },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId,
      },
    };

    // 3DS: only adds customer/billing data when use3DS=true (frontend defaults to false)
    if (use3DS) {
      if (customerInfo) {
        requestBody.customer = {
          merchantCustomerId: user?.id || 'guest',
          email: customerInfo.email || user?.get('email') || '',
          ...(customerInfo.phone && {
            phone: [{ type: 'MOBILE', phoneNumber: customerInfo.phone }],
          }),
        };
      }
      if (billingAddress) {
        requestBody.billingAddress = {
          firstName: billingAddress.firstName || '',
          lastName: billingAddress.lastName || '',
          address: {
            street: billingAddress.street || '',
            houseNumberOrName: billingAddress.houseNumberOrName || '',
            city: billingAddress.city || '',
            stateOrProvince: billingAddress.stateOrProvince || '',
            postalCode: billingAddress.postalCode || '',
            country: billingAddress.country || 'US',
          },
        };
      }
    }

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('[CommerceHub] Requesting security credentials', JSON.stringify({ amount: parsedAmount }));

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`,
      requestBody,
      { headers },
    );

    const data = response.data;
    console.log('[CommerceHub] Security credentials acquired');

    return {
      success: true,
      sessionId: data.sessionId,
      accessToken: data.accessToken,
      publicKey: data.publicKey,
      keyId: data.keyId,
      accessTokenIssuedTime: data.accessTokenIssuedTime,
      accessTokenTimeToLive: data.accessTokenTimeToLive,
      asymmetricEncryptionAlgorithm: data.asymmetricEncryptionAlgorithm,
      expiresAt: data.expiresAt,
    };
  } catch (error) {
    console.error('[CommerceHub] Credentials creation failed', error.response?.data?.message || error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      'Failed to create security credentials. Please try again.',
    );
  }
});

// Initialize recharge — acquires credentials (Step 3) + creates pending transaction record
Parse.Cloud.define('commerceHubInitRecharge', async (request) => {
  const {
    amount,
    remark,
    customerInfo,
    billingAddress,
    use3DS = false,
    type = 'Getways',
    userId: paramUserId,
  } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Authentication required.');
  }

  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== 'number' || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Invalid amount: must be a positive number.');
  }

  try {
    const userIdForTransaction = paramUserId || request.user?.id || `USER-${Date.now()}`;
    const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
    const merchantTransactionId = generateMerchantTransactionId(userIdForTransaction);
    const tableName = getTableName(type);

    // Acquire credentials (internal server-side call)
    const credentialsResponse = await Parse.Cloud.run(
      'commerceHubCreateCredentials',
      { amount: parsedAmount, customerInfo, billingAddress, use3DS },
      { useMasterKey: true },
    );

    // Create pending transaction record
    const Table = Parse.Object.extend(tableName);
    const txn = new Table();

    txn.set('type', 'recharge');
    txn.set('gameId', '786');
    txn.set('username', user?.get('username') || '');
    txn.set('userId', userIdForTransaction);
    txn.set('transactionDate', new Date());
    txn.set('transactionAmount', parsedAmount);
    txn.set('remark', remark || 'Commerce Hub Recharge');
    txn.set('useWallet', false);
    txn.set('userParentId', user?.get('userParentId') || '');
    txn.set('status', 1);
    txn.set('portal', PORTAL_NAME);
    txn.set('merchantTransactionId', merchantTransactionId);
    txn.set('sessionId', credentialsResponse.sessionId);
    txn.set('use3DS', use3DS);

    if (type === 'AOG') {
      txn.set('platform', AOG_PLATFORM);
    }

    await txn.save(null, { useMasterKey: true });

    console.log('[CommerceHub] Recharge initialized', JSON.stringify({ transactionId: txn.id, merchantTransactionId }));

    return {
      success: true,
      transactionId: txn.id,
      merchantTransactionId,
      credentials: credentialsResponse,
    };
  } catch (error) {
    console.error('[CommerceHub] Init recharge failed', error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      'Failed to initialize recharge. Please try again.',
    );
  }
});

// STEP 6 — Complete recharge: submit charges. Endpoint: POST /payments/v1/charges. Includes idempotency guard.
Parse.Cloud.define('commerceHubCompleteRecharge', async (request) => {
  const {
    transactionId,
    paymentToken,
    authenticationTransactionId,
    transactionState,
    type = 'Getways',
  } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Authentication required.');
  }

  if (!transactionId || !paymentToken) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      'Transaction ID and payment token are required.',
    );
  }

  const tableName = getTableName(type);
  let transaction;

  try {
    const Table = Parse.Object.extend(tableName);
    const query = new Parse.Query(Table);
    query.equalTo('objectId', transactionId);
    transaction = await query.first({ useMasterKey: true });
    if (!transaction) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Transaction not found.');
    }

    // Idempotency guard — only process pending transactions
    if (transaction.get('status') !== 1) {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Transaction is not in pending state.');
    }

    const amount = transaction.get('transactionAmount');
    const sessionId = transaction.get('sessionId');
    const terminalId = process.env.COMMERCE_HUB_TERMINAL_ID || DEFAULT_TERMINAL_ID;

    // Build charges request per docs minimum required fields
    const requestBody = {
      source: {
        sourceType: 'PaymentSession',
        sessionId,
      },
      transactionDetails: {
        captureFlag: true,
        merchantTransactionId: transaction.get('merchantTransactionId'),
      },
      transactionInteraction: {
        origin: 'ECOM',
        eciIndicator: 'CHANNEL_ENCRYPTED',
        posConditionCode: 'CARD_NOT_PRESENT_ECOM',
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId,
      },
    };

    // 3DS: only attaches auth reference if caller provides it (frontend doesn't)
    if (authenticationTransactionId && transactionState) {
      requestBody.authenticationRequest = { authenticationTransactionId };
      transaction.set('authenticationTransactionId', authenticationTransactionId);
      transaction.set('transactionState', transactionState);
    }

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('[CommerceHub] Submitting charges', JSON.stringify({ transactionId }));

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/charges`,
      requestBody,
      { headers },
    );

    const gatewayResponse = response.data.gatewayResponse;

    console.log('[CommerceHub] Charges response received', JSON.stringify({ transactionId, state: gatewayResponse.transactionState }));

    // Payment approved
    if (
      gatewayResponse.transactionState === GATEWAY_STATE.AUTHORIZED ||
      gatewayResponse.transactionState === GATEWAY_STATE.CAPTURED
    ) {
      const userId = transaction.get('userId');
      const parentUserId = await getParentUserId(userId);
      await updatePotBalance(parentUserId, amount, 'recharge');

      transaction.set('status', 2);
      transaction.set('completedAt', new Date());
      transaction.set('gatewayTransactionId', gatewayResponse.transactionProcessingDetails?.transactionId);
      transaction.set('gatewayState', gatewayResponse.transactionState);
      transaction.set('paymentToken', paymentToken);
      await transaction.save(null, { useMasterKey: true });

      console.log('[CommerceHub] Recharge completed successfully', JSON.stringify({ transactionId: transaction.id }));

      return {
        success: true,
        transactionId: transaction.id,
        status: 'completed',
        gatewayTransactionId: gatewayResponse.transactionProcessingDetails?.transactionId,
      };
    }

    // Payment declined
    if (gatewayResponse.transactionState === GATEWAY_STATE.DECLINED) {
      transaction.set('status', 9);
      transaction.set('failedAt', new Date());
      transaction.set('failureReason', gatewayResponse.gatewayMessage || 'Transaction declined');
      await transaction.save(null, { useMasterKey: true });

      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        'Payment was declined. Please try a different payment method.',
      );
    }

    // Other states (WAITING, PENDING, etc.)
    transaction.set('gatewayState', gatewayResponse.transactionState);
    transaction.set('paymentToken', paymentToken);
    await transaction.save(null, { useMasterKey: true });

    return {
      success: false,
      transactionId: transaction.id,
      status: gatewayResponse.transactionState,
      message: 'Transaction is pending. Please check back later.',
    };
  } catch (error) {
    console.error('[CommerceHub] Complete recharge failed', JSON.stringify({ transactionId, message: error.message }));

    // Best-effort: mark transaction as failed if still pending
    if (transaction && transaction.get('status') === 1) {
      try {
        transaction.set('status', 9);
        transaction.set('failedAt', new Date());
        transaction.set('failureReason', error.message);
        await transaction.save(null, { useMasterKey: true });
      } catch (updateError) {
        console.error('[CommerceHub] Failed to update transaction status', JSON.stringify({ transactionId }));
      }
    }

    if (error instanceof Parse.Error) throw error;
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      'Failed to complete recharge. Please try again.',
    );
  }
});

// Cron — expire pending transactions older than 30 minutes (both tables)
Parse.Cloud.define('expireOldCommerceHubTransactions', async (request) => {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  let totalExpired = 0;

  for (const tableName of ['TransactionRecords', 'Transactions']) {
    try {
      const Table = Parse.Object.extend(tableName);
      const query = new Parse.Query(Table);
      query.equalTo('portal', PORTAL_NAME);
      query.equalTo('status', 1);
      query.lessThan('createdAt', cutoff);
      query.limit(100);

      const expired = await query.find({ useMasterKey: true });

      for (const txn of expired) {
        try {
          txn.set('status', 9);
          txn.set('failedAt', new Date());
          txn.set('failureReason', 'Transaction expired (30 minute timeout)');
          await txn.save(null, { useMasterKey: true });
          totalExpired++;
        } catch (err) {
          console.error('[CommerceHub] Failed to expire single transaction', JSON.stringify({ id: txn.id, table: tableName }));
        }
      }
    } catch (err) {
      console.error('[CommerceHub] Expiration query failed', JSON.stringify({ table: tableName, message: err.message }));
    }
  }

  console.log('[CommerceHub] Expiration check completed', JSON.stringify({ expired: totalExpired }));
  return { success: true, expired: totalExpired };
});

// Get transaction details by ID (authenticated, scoped to calling user)
Parse.Cloud.define('getCommerceHubTransaction', async (request) => {
  const { transactionId } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Authentication required.');
  }
  if (!transactionId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Transaction ID is required.');
  }

  try {
    const Table = Parse.Object.extend('TransactionRecords');
    const query = new Parse.Query(Table);
    query.equalTo('objectId', transactionId);
    query.equalTo('userId', request.user.id);

    const txn = await query.first({ useMasterKey: true });
    if (!txn) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Transaction not found.');
    }

    return {
      success: true,
      transaction: {
        id: txn.id,
        amount: txn.get('transactionAmount'),
        status: txn.get('status'),
        merchantTransactionId: txn.get('merchantTransactionId'),
        createdAt: txn.get('createdAt'),
        completedAt: txn.get('completedAt'),
        gatewayState: txn.get('gatewayState'),
        gatewayTransactionId: txn.get('gatewayTransactionId'),
      },
    };
  } catch (error) {
    if (error instanceof Parse.Error) throw error;
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Failed to get transaction details.');
  }
});

module.exports = {
  generateCommerceHubHeaders,
  generateMerchantTransactionId,
};
