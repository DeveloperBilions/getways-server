// Fiserv Digital Disbursements (DDP) Integration
// Supports: PayPal, Venmo, Debit Card, ACH, RTP, Coinbase, Visa+, eCheck

const crypto = require('crypto');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

// Status codes for transaction records
const STATUS_PENDING = 1;
const STATUS_SUCCESS = 2;
const STATUS_FAILED = 9;
const GAME_ID = '786';
const AOG_PLATFORM = 'AOGCOINCLUB';
const MAX_CASHOUT_AMOUNT = 10000;
const MIN_CASHOUT_AMOUNT = 0.01;

const CONFIG = {
  ddpBaseUrl: process.env.FISERV_DDP_BASE_URL || 'https://int.api.firstdata.com/ddp',
  ucomBaseUrl: process.env.FISERV_UCOM_BASE_URL || 'https://int.api.firstdata.com/ucom',
  clientId: process.env.FISERV_DDP_API_KEY || '',
  clientSecret: process.env.FISERV_DDP_API_SECRET || '',
  paymentType: process.env.FISERV_DDP_PAYMENT_TYPE || 'Gaming',
};

// Validate required env variables on load
if (!CONFIG.clientId || !CONFIG.clientSecret) {
  console.error('[DDP] WARNING: FISERV_DDP_API_KEY or FISERV_DDP_API_SECRET not set');
}

function createHmacSignature(method, bodyString) {
  const timestamp = Date.now();
  let raw = `${CONFIG.clientId}:${timestamp}`;

  if (method !== 'GET' && method !== 'DELETE' && bodyString) {
    const payloadHash = crypto.createHash('sha256').update(bodyString).digest('base64');
    raw += `:${payloadHash}`;
  }

  const signature = crypto.createHmac('sha256', CONFIG.clientSecret).update(raw).digest('base64');
  return { signature, timestamp };
}

function buildHeaders(method, bodyString, accessToken) {
  const { signature, timestamp } = createHmacSignature(method, bodyString);
  const headers = {
    'Content-Type': 'application/json',
    'Api-Key': CONFIG.clientId,
    'Timestamp': timestamp.toString(),
    'Authorization': `HMAC ${signature}`,
    'Client-Request-Id': uuidv4(),
  };
  if (accessToken) headers['access_token'] = accessToken;
  return headers;
}

// Extract a user-friendly error message from Fiserv error responses
function parseFiservError(data, statusCode) {
  if (data?.developerInfo?.fieldError?.length) {
    const fieldErr = data.developerInfo.fieldError[0];
    return fieldErr.message || data.message || 'Payment processing failed.';
  }
  if (data?.developerInfo?.developerMessage) {
    return data.developerInfo.developerMessage;
  }
  if (data?.message) return data.message;
  return `Payment processing failed (code: ${statusCode}).`;
}

async function callDDP(endpoint, method, body, service = 'ddp', accessToken) {
  const base = service === 'ucom' ? CONFIG.ucomBaseUrl : CONFIG.ddpBaseUrl;
  const url = `${base}/v1${endpoint}`;
  const bodyString = body ? JSON.stringify(body) : null;
  const headers = buildHeaders(method, bodyString, accessToken);

  const options = { method, headers };
  if (bodyString && method !== 'GET' && method !== 'DELETE') {
    options.body = bodyString;
  }

  console.log(`[DDP] ${method} ${url}`);
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[DDP] Error:', JSON.stringify(data, null, 2));
    throw new Error(parseFiservError(data, response.status));
  }

  return data;
}

const PaymentBuilders = {
  paypal(params) {
    if (!params.email) throw new Error('Email is required for PayPal.');
    return {
      source: 'PAYPAL',
      paypal: { email: { value: params.email } },
    };
  },

  venmo(params) {
    if (!params.phone) throw new Error('Phone number is required for Venmo.');
    return {
      source: 'VENMO',
      venmo: { phone: { value: params.phone } },
    };
  },

  debit(params) {
    if (!params.evToken) throw new Error('EV token is required for Debit Card.');
    return {
      source: 'DEBIT',
      card: { token: { tokenId: params.evToken, tokenProvider: 'ENROLMENT_VAULT' } },
    };
  },

  ach(params) {
    if (!params.evToken) throw new Error('EV token is required for ACH.');
    return {
      source: 'ACH',
      ach: { token: { tokenId: params.evToken, tokenProvider: 'ENROLMENT_VAULT' } },
    };
  },

  rtp(params) {
    if (!params.evToken) throw new Error('EV token is required for RTP.');
    return {
      source: 'RTP',
      ach: { token: { tokenId: params.evToken, tokenProvider: 'ENROLMENT_VAULT' } },
    };
  },

  coinbase(params) {
    if (!params.evToken) throw new Error('EV token is required for Coinbase.');
    return {
      source: 'COINBASE',
      coinbase: { token: { tokenId: params.evToken, tokenProvider: 'ENROLMENT_VAULT' } },
    };
  },

  visaplus(params) {
    if (!params.payName) throw new Error('PayName is required for Visa+.');
    if (!params.payName.startsWith('+')) throw new Error('PayName must start with + (e.g. +username.gpay).');
    return {
      source: 'VISAPLUS',
      visaPlus: { payName: params.payName },
    };
  },

  echeck() {
    return { source: 'ECHECK' };
  },
};

function buildRecipientPayment(method, params) {
  const builder = PaymentBuilders[method];
  if (!builder) throw new Error(`Unsupported payment method: ${method}`);
  return builder(params);
}

function encryptWithPublicKey(publicKey, data) {
  const pem = '-----BEGIN PUBLIC KEY-----\n' + publicKey.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
  const encrypted = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(data.toString())
  );
  return `ENC_[${encrypted.toString('base64')}]`;
}

// Require authentication on a request
function requireAuth(request) {
  if (!request.user) throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Authentication required.');
}

// Create Recipient
Parse.Cloud.define('fiservDDP_createRecipient', async (request) => {
  requireAuth(request);
  const { userData } = request.params || {};

  const merchantCustomerId = `USER-${request.user.id}-${Date.now()}`;

  const payload = {
    merchant: { merchantCustomerId },
    recipient: {
      recipientType: 'Consumer',
      firstName: userData?.firstName || request.user.get('firstName') || 'Unknown',
      lastName: userData?.lastName || request.user.get('lastName') || 'User',
      emailAddress: {
        value: userData?.email || request.user.get('email') || request.user.get('username'),
      },
      address: {
        type: 'work',
        street: userData?.address?.street || '123 Main Street',
        city: userData?.address?.city || 'New York',
        stateOrProvince: userData?.address?.state || 'NY',
        postalCode: userData?.address?.postalCode || '10001',
        country: 'USA',
      },
    },
  };

  const result = await callDDP('/recipients', 'POST', payload);
  return { success: true, merchantCustomerId, recipientId: result.recipientId };
});

// Update Recipient
Parse.Cloud.define('fiservDDP_updateRecipient', async (request) => {
  requireAuth(request);
  const { merchantCustomerId, userData } = request.params || {};
  if (!merchantCustomerId) throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantCustomerId is required.');

  const payload = { recipient: {} };
  if (userData?.firstName) payload.recipient.firstName = userData.firstName;
  if (userData?.lastName) payload.recipient.lastName = userData.lastName;
  if (userData?.email) payload.recipient.emailAddress = { value: userData.email };
  if (userData?.address) {
    payload.recipient.address = {
      type: 'work',
      street: userData.address.street,
      city: userData.address.city,
      stateOrProvince: userData.address.state,
      postalCode: userData.address.postalCode,
      country: userData.address.country || 'USA',
    };
  }

  const result = await callDDP(`/recipients/${merchantCustomerId}`, 'PATCH', payload);
  return { success: true, recipientId: result.recipientId };
});

// Get Recipient
Parse.Cloud.define('fiservDDP_getRecipient', async (request) => {
  requireAuth(request);
  const { merchantCustomerId } = request.params || {};
  if (!merchantCustomerId) throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantCustomerId is required.');

  const result = await callDDP(`/recipients/${merchantCustomerId}`, 'GET');
  return { success: true, recipient: result };
});

// Get Public Token (encryption key - valid 20 min)
Parse.Cloud.define('fiservDDP_getPublicToken', async (request) => {
  requireAuth(request);
  const { merchantCustomerId } = request.params || {};
  if (!merchantCustomerId) throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantCustomerId is required.');

  const result = await callDDP('/tokens', 'POST', {
    token: { fdCustomerId: merchantCustomerId },
    publicKeyRequired: true,
  }, 'ucom');

  return {
    success: true,
    tokenId: result.tokenId,
    publicKey: result.publicKey,
    expiresInSeconds: result.expiresInSeconds,
  };
});

// Encrypt + Create Nonce + Vault (combined)
Parse.Cloud.define('fiservDDP_encryptAndVault', async (request) => {
  requireAuth(request);
  const {
    merchantCustomerId, tokenId, publicKey,
    cardNumber, expiryMonth, expiryYear,
    routingNumber, accountNumber,
    accountType,
    bankAccountType,
  } = request.params || {};

  if (!merchantCustomerId || !tokenId || !publicKey) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantCustomerId, tokenId, and publicKey are required.');
  }

  let noncePayload;
  if (accountType === 'card') {
    if (!cardNumber || !expiryMonth || !expiryYear) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'Card number, expiry month, and year are required.');
    }
    noncePayload = {
      account: {
        type: 'CREDIT',
        credit: {
          cardNumber: encryptWithPublicKey(publicKey, cardNumber),
          expiryDate: {
            month: encryptWithPublicKey(publicKey, expiryMonth),
            year: encryptWithPublicKey(publicKey, expiryYear),
          },
        },
      },
      referenceToken: { tokenType: 'CLAIM_CHECK_NONCE' },
      fdCustomerId: merchantCustomerId,
    };
  } else {
    if (!accountNumber) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'Account number is required.');
    }
    noncePayload = {
      account: {
        type: 'ACH',
        ach: {
          routingNumber: routingNumber || '',
          accountNumber: encryptWithPublicKey(publicKey, accountNumber),
          type: bankAccountType || 'Checking',
        },
      },
      referenceToken: { tokenType: 'CLAIM_CHECK_NONCE' },
      fdCustomerId: merchantCustomerId,
    };
  }

  // Nonce token uses Bearer auth, not HMAC
  const bodyString = JSON.stringify(noncePayload);
  const { timestamp } = createHmacSignature('POST', bodyString);

  const nonceResponse = await fetch(`${CONFIG.ucomBaseUrl}/v1/account-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': CONFIG.clientId,
      'Timestamp': timestamp.toString(),
      'Authorization': `Bearer ${tokenId}`,
      'Client-Request-Id': uuidv4(),
    },
    body: bodyString,
  });

  const nonceData = await nonceResponse.json().catch(() => ({}));
  if (!nonceResponse.ok) {
    console.error('[DDP] Nonce token error:', JSON.stringify(nonceData, null, 2));
    throw new Error(parseFiservError(nonceData, nonceResponse.status));
  }

  const nonceTokenId = nonceData.token?.tokenId;
  if (!nonceTokenId) throw new Error('No nonce token received.');

  // Vault the payment method
  const vaultResult = await callDDP(
    `/recipients/${merchantCustomerId}/accounts`,
    'POST',
    { accounts: { token: { tokenId: nonceTokenId, tokenProvider: 'SINGLE_USE_TOKEN' } } },
    'ddp',
    tokenId
  );

  const evToken = vaultResult.accounts?.[0]?.token?.tokenId || nonceTokenId;
  return { success: true, evToken };
});

// Create Payment (standalone)
Parse.Cloud.define('fiservDDP_createPayment', async (request) => {
  requireAuth(request);
  const { merchantCustomerId, amount, paymentMethod, evToken, paymentDetails } = request.params || {};

  if (!merchantCustomerId || !amount || !paymentMethod) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantCustomerId, amount, and paymentMethod are required.');
  }

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_CASHOUT_AMOUNT) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Invalid amount.');
  }
  if (parsedAmount > MAX_CASHOUT_AMOUNT) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `Amount cannot exceed $${MAX_CASHOUT_AMOUNT}.`);
  }

  const method = paymentMethod.toLowerCase();
  const merchantTransactionId = `CASHOUT-${Date.now()}`;

  const methodFields = buildRecipientPayment(method, {
    email: paymentDetails?.email,
    phone: paymentDetails?.phone,
    payName: paymentDetails?.payName,
    evToken,
  });

  const payload = {
    amount: { total: parsedAmount, currency: 'USD' },
    merchantTransactionId,
    recipient: [{
      recipientProfileInfo: { merchantCustomerId },
      payments: { paymentType: CONFIG.paymentType },
      description: 'Sending Transaction',
      ...methodFields,
    }],
  };

  const result = await callDDP('/payments', 'POST', payload);
  return {
    success: true,
    transactionId: result.transactionId,
    merchantTransactionId,
    status: result.transactionStatus,
    portalUrl: result.recipient?.[0]?.portalUrl,
  };
});

// Cancel Payment - supports both merchantTransactionId and transactionId (TID)
Parse.Cloud.define('fiservDDP_cancelPayment', async (request) => {
  requireAuth(request);
  const { merchantTransactionId, transactionId, reason } = request.params || {};

  const cancelId = transactionId || merchantTransactionId;
  if (!cancelId) throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantTransactionId or transactionId is required.');

  const result = await callDDP(`/payments/${cancelId}/cancel`, 'PATCH', {
    description: reason || 'Cancel transaction due to customer request',
  });

  return {
    success: true,
    transactionId: result.transactionId,
    transactionStatus: result.transactionStatus,
    paymentStatus: result.paymentStatus,
  };
});

// Transaction Status
Parse.Cloud.define('fiservDDP_getTransactionStatus', async (request) => {
  requireAuth(request);
  const { merchantCustomerId } = request.params || {};
  if (!merchantCustomerId) throw new Parse.Error(Parse.Error.INVALID_JSON, 'merchantCustomerId is required.');

  const result = await callDDP(`/transactions/recipients/${merchantCustomerId}`, 'GET');
  return { success: true, transactions: result };
});

// Merchant Info
Parse.Cloud.define('fiservDDP_getMerchantInfo', async (request) => {
  requireAuth(request);
  const result = await callDDP('/merchantInfo', 'GET');
  return { success: true, merchantInfo: result };
});

// Get Cashout Methods from CashoutMethod database class
Parse.Cloud.define('getCashoutMethods', async (request) => {
  const q = new Parse.Query('CashoutMethod');
  q.equalTo('enabled', true);
  q.ascending('key');
  q.limit(100);
  const results = await q.find({ useMasterKey: true });

  return results.map((r) => ({
    key: r.get('key'),
    label: r.get('label'),
    provider: r.get('provider'),
    minAmount: r.get('minAmount') || 0,
    maxAmount: r.get('maxAmount') || 10000,
    fiservKey: r.get('fiservKey') || null,
  }));
});

// Main Cashout Flow
Parse.Cloud.define('fiservDDP_cashout', async (request) => {
  const {
    amount, paymentMethod,
    email, phone, paymentDetails,
    cardNumber, expiryMonth, expiryYear,
    routingNumber, accountNumber, accountType,
    description,
    userData, type = 'Getways',
    userId: paramUserId,
  } = request.params || {};

  const userId = paramUserId || request.user?.id || `USER-${Date.now()}`;
  const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;

  // Validate amount
  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_CASHOUT_AMOUNT) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'Valid amount is required.');
  }
  if (parsedAmount > MAX_CASHOUT_AMOUNT) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `Amount cannot exceed $${MAX_CASHOUT_AMOUNT}.`);
  }

  // Validate method
  const method = (paymentMethod || '').toLowerCase();
  const validMethods = Object.keys(PaymentBuilders);
  if (!validMethods.includes(method)) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `Supported methods: ${validMethods.join(', ')}`);
  }

  // Idempotency check: prevent duplicate cashouts within 60 seconds
  const isAOG = type === 'AOG';
  const TableName = isAOG ? 'Transactions' : 'TransactionRecords';
  const dupeQuery = new Parse.Query(TableName);
  dupeQuery.equalTo('userId', userId);
  dupeQuery.equalTo('paymentMethod', method);
  dupeQuery.equalTo('transactionAmount', parsedAmount);
  dupeQuery.equalTo('portal', 'FiservDDP');
  dupeQuery.greaterThan('transactionDate', new Date(Date.now() - 60000));
  const recentDupe = await dupeQuery.first({ useMasterKey: true });
  if (recentDupe) {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'A similar cashout was just submitted. Please wait before trying again.');
  }

  const VAULTING_METHODS = ['debit', 'ach', 'rtp', 'coinbase'];

  try {
    // Step 1: Create Recipient
    const merchantCustomerId = `USER-${userId}-${Date.now()}`;
    console.log(`[Cashout] Creating recipient: ${merchantCustomerId}`);

    await callDDP('/recipients', 'POST', {
      merchant: { merchantCustomerId },
      recipient: {
        recipientType: 'Consumer',
        firstName: userData?.firstName || user?.get('firstName') || 'Unknown',
        lastName: userData?.lastName || user?.get('lastName') || 'User',
        emailAddress: {
          value: email || user?.get('email') || user?.get('username') || 'user@example.com',
        },
        address: {
          type: 'work',
          street: userData?.address?.street || '123 Main Street',
          city: userData?.address?.city || 'New York',
          stateOrProvince: userData?.address?.state || 'NY',
          postalCode: userData?.address?.postalCode || '10001',
          country: 'USA',
        },
      },
    });

    // Step 2: Vault if needed (debit/ach/rtp/coinbase)
    let evToken = null;
    if (VAULTING_METHODS.includes(method)) {
      console.log(`[Cashout] Getting public token for ${merchantCustomerId}`);
      const pubTokenResult = await callDDP('/tokens', 'POST', {
        token: { fdCustomerId: merchantCustomerId },
        publicKeyRequired: true,
      }, 'ucom');

      const publicKey = pubTokenResult.publicKey;
      const tokenId = pubTokenResult.tokenId;

      console.log(`[Cashout] Encrypting & creating nonce token`);
      let noncePayload;
      if (method === 'debit') {
        noncePayload = {
          account: {
            type: 'CREDIT',
            credit: {
              cardNumber: encryptWithPublicKey(publicKey, cardNumber),
              expiryDate: {
                month: encryptWithPublicKey(publicKey, expiryMonth),
                year: encryptWithPublicKey(publicKey, expiryYear),
              },
            },
          },
          referenceToken: { tokenType: 'CLAIM_CHECK_NONCE' },
          fdCustomerId: merchantCustomerId,
        };
      } else {
        noncePayload = {
          account: {
            type: 'ACH',
            ach: {
              routingNumber: routingNumber || '',
              accountNumber: encryptWithPublicKey(publicKey, accountNumber),
              type: accountType || 'Checking',
            },
          },
          referenceToken: { tokenType: 'CLAIM_CHECK_NONCE' },
          fdCustomerId: merchantCustomerId,
        };
      }

      // Nonce token uses Bearer auth
      const nonceBodyString = JSON.stringify(noncePayload);
      const { timestamp } = createHmacSignature('POST', nonceBodyString);
      const nonceResponse = await fetch(`${CONFIG.ucomBaseUrl}/v1/account-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': CONFIG.clientId,
          'Timestamp': timestamp.toString(),
          'Authorization': `Bearer ${tokenId}`,
          'Client-Request-Id': uuidv4(),
        },
        body: nonceBodyString,
      });

      const nonceData = await nonceResponse.json().catch(() => ({}));
      if (!nonceResponse.ok) {
        console.error('[Cashout] Nonce error:', JSON.stringify(nonceData, null, 2));
        throw new Error(parseFiservError(nonceData, nonceResponse.status));
      }

      const nonceTokenId = nonceData.token?.tokenId;
      if (!nonceTokenId) throw new Error('No nonce token received.');

      console.log(`[Cashout] Vaulting payment method`);
      const vaultResult = await callDDP(
        `/recipients/${merchantCustomerId}/accounts`, 'POST',
        { accounts: { token: { tokenId: nonceTokenId, tokenProvider: 'SINGLE_USE_TOKEN' } } },
        'ddp', tokenId
      );

      evToken = vaultResult.accounts?.[0]?.token?.tokenId || nonceTokenId;
      console.log(`[Cashout] Vaulted. EV Token obtained.`);
    }

    // Step 3: Build and send payment
    const merchantTransactionId = `CASHOUT-${userId.slice(-6)}-${Date.now()}`;
    console.log(`[Cashout] Creating ${method} payment: ${merchantTransactionId}`);

    const methodFields = buildRecipientPayment(method, {
      email, phone, evToken,
      payName: paymentDetails?.payName,
    });

    const paymentPayload = {
      amount: { total: parsedAmount, currency: 'USD' },
      merchantTransactionId,
      recipient: [{
        recipientProfileInfo: { merchantCustomerId },
        payments: { paymentType: CONFIG.paymentType },
        description: description || 'Sending Transaction',
        ...methodFields,
      }],
    };

    const paymentResult = await callDDP('/payments', 'POST', paymentPayload);
    console.log(`[Cashout] Payment created: ${paymentResult.transactionId}`);

    // Save transaction record
    const Record = Parse.Object.extend(TableName);
    const record = new Record();

    const txStatus = paymentResult.transactionStatus;
    const paymentStatus = paymentResult.recipient?.[0]?.payments?.paymentStatus;

    record.set('userId', userId);
    record.set('type', 'redeem');
    record.set('merchantCustomerId', merchantCustomerId);
    record.set('merchantTransactionId', merchantTransactionId);
    record.set('fiservTransactionId', paymentResult.transactionId);
    record.set('transactionAmount', parsedAmount);
    record.set('paymentMethod', method);
    record.set('status', (txStatus === 'TC' || paymentStatus === 'DI') ? STATUS_SUCCESS : STATUS_PENDING);
    record.set('fiservTransactionStatus', txStatus);
    record.set('fiservPaymentStatus', paymentStatus);
    record.set('portal', 'FiservDDP');
    record.set('transactionDate', new Date());
    record.set('username', user?.get('username') || '');
    record.set('userParentId', user?.get('userParentId') || '');
    record.set('gameId', GAME_ID);
    if (isAOG) record.set('platform', AOG_PLATFORM);

    await record.save(null, { useMasterKey: true });

    return {
      success: true,
      transactionId: paymentResult.transactionId,
      merchantTransactionId,
      status: paymentResult.transactionStatus,
      portalUrl: paymentResult.recipient?.[0]?.portalUrl,
      fiservTransactionId: paymentResult.transactionId,
    };
  } catch (error) {
    console.error('[Cashout] Failed:', error.message);

    // Save failed transaction record for audit
    try {
      const Record = Parse.Object.extend(TableName);
      const failRecord = new Record();
      failRecord.set('userId', userId);
      failRecord.set('type', 'redeem');
      failRecord.set('transactionAmount', parsedAmount);
      failRecord.set('paymentMethod', method);
      failRecord.set('status', STATUS_FAILED);
      failRecord.set('portal', 'FiservDDP');
      failRecord.set('transactionDate', new Date());
      failRecord.set('username', user?.get('username') || '');
      failRecord.set('userParentId', user?.get('userParentId') || '');
      failRecord.set('gameId', GAME_ID);
      if (isAOG) failRecord.set('platform', AOG_PLATFORM);
      await failRecord.save(null, { useMasterKey: true });
    } catch (saveErr) {
      console.error('[Cashout] Failed to save error record:', saveErr.message);
    }

    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Cashout failed: ${error.message}`);
  }
});

console.log('FiservDigitalDisbursements.js loaded');

module.exports = { createHmacSignature, buildHeaders, callDDP, CONFIG };
