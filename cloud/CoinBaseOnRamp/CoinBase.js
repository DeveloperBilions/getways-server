 const fs = require("fs");
 const jwt = require("jsonwebtoken");
  const axios = require("axios");

const base64url = require("base64url");
const crypto = require("crypto");
const _sodium = require("libsodium-wrappers");
//Demo
// const COINBASE_KEY_NAME = "0dc9d50d-05b8-45f5-b769-ec205b6439e5";
// const COINBASE_KEY_SECRET = "QH80yCT6HNUiWZq4UowFkv81WVIUr7I7VWZBWRFrw00bgcXugTlZU2BNaN2QSkG6qE9jguG6e6IwrkPqt6jIEg==";

//Live
// const COINBASE_KEY_NAME = "2aedc492-fd0d-453d-adb5-bbc5dfc13567";
// const COINBASE_KEY_SECRET = "vR0v/RHfQ6FsOaqLjC56q3dktb4//2EtkCnl1mPLOEEddM+Tnu2CY/8h5R1CruT/+2YEXTuEQHVPu/F7eP/ICg==";

//Latest
const COINBASE_KEY_NAME = "16201d2e-a55f-4634-8327-631dfe30fab2";
const COINBASE_KEY_SECRET = "x8SK4xATTzrZ48M06sRUUQtGpR4aglcUQcFoFbWcJhH7ih0RPFB480vP2bvmG4QW6SGXFL4iQvr31G01JC5Ytw==";

//Latest Live
// const COINBASE_KEY_NAME = "49c0e3d1-bff5-40c2-a83a-0317bc6dbf1b";
// const COINBASE_KEY_SECRET = "dmZSS6vukAVz5DS70Y9sa8QLIi3FlvXACL+1rWTr5HRw1pRRYNqwdvkCtjz0XZGTYjmJJyMAIAjJWuITnRMfeQ==";


Parse.Cloud.define("generateCoinbaseSessionToken", async (request) => {
  const { walletAddr,rechargeAmount,
    partnerUserRef } = request.params;
  await _sodium.ready;
  const sodium = _sodium;

  const method = "POST";
  const path = "/onramp/v1/token";
  const url = "api.developer.coinbase.com";
  const uri = `${method} ${url}${path}`;

  const payload = {
    iss: "cdp",
    sub: COINBASE_KEY_NAME,
    uri,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
  };

  const header = {
    typ: "JWT",
    alg: "EdDSA",
    kid: COINBASE_KEY_NAME,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const headerBase64 = base64url.encode(JSON.stringify(header));
  const payloadBase64 = base64url.encode(JSON.stringify(payload));
  const message = `${headerBase64}.${payloadBase64}`;
  const keyBuf = Buffer.from(COINBASE_KEY_SECRET, "base64");
  const signature = sodium.crypto_sign_detached(message, keyBuf);
  const signatureBase64 = base64url(Buffer.from(signature));
  const jwt = `${message}.${signatureBase64}`;

  const body = {
    addresses: [
      {
        address: walletAddr,
        blockchains: ["ethereum", "base"],
      },
    ],
    assets: ["USDC"],
    preset_crypto_amount: rechargeAmount, // ⬅ this is what you're missing
    partner_user_ref: partnerUserRef, // ✅ This enables tracking on Coinbase side
  };

  try {
    const response = await axios.post(
      `https://${url}${path}`,
      body,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (err) {
    throw new Error(
      err.response?.data?.message || err.message || "Token generation failed"
    );
  }
});

Parse.Cloud.define("getCoinbaseTransactions", async () => {
  await _sodium.ready;
  const sodium = _sodium;

  const method = "GET";
  const path = "/onramp/v1/buy/transactions";
  const url = "api.developer.coinbase.com";
  const uri = `${method} ${url}${path}`;

  const payload = {
    iss: "cdp",
    sub: COINBASE_KEY_NAME,
    uri,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
  };

  const header = {
    typ: "JWT",
    alg: "EdDSA",
    kid: COINBASE_KEY_NAME,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const headerBase64 = base64url.encode(JSON.stringify(header));
  const payloadBase64 = base64url.encode(JSON.stringify(payload));
  const message = `${headerBase64}.${payloadBase64}`;
  const keyBuf = Buffer.from(COINBASE_KEY_SECRET, "base64");
  const signature = sodium.crypto_sign_detached(message, keyBuf);
  const signatureBase64 = base64url(Buffer.from(signature));
  const jwt = `${message}.${signatureBase64}`;

  try {
    const response = await axios.get(
      `https://${url}${path}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    return response.data;
  } catch (err) {
    throw new Error(
      err.response?.data?.message || err.message || "Failed to fetch Coinbase transactions"
    );
  }
});

Parse.Cloud.define("getCoinbaseUserTransactionsByRef", async (request) => {
  const { partnerUserRef } = request.params;

  if (!partnerUserRef) {
    throw new Error("Missing required param: partnerUserRef");
  }

  await _sodium.ready;
  const sodium = _sodium;

  const method = "GET";
  const path = `/onramp/v1/buy/user/${partnerUserRef}/transactions`;
  const url = "api.developer.coinbase.com";
  const uri = `${method} ${url}${path}`;

  const payload = {
    iss: "cdp",
    sub: COINBASE_KEY_NAME,
    uri,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
  };

  const header = {
    typ: "JWT",
    alg: "EdDSA",
    kid: COINBASE_KEY_NAME,
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const headerBase64 = base64url.encode(JSON.stringify(header));
  const payloadBase64 = base64url.encode(JSON.stringify(payload));
  const message = `${headerBase64}.${payloadBase64}`;
  const keyBuf = Buffer.from(COINBASE_KEY_SECRET, "base64");
  const signature = sodium.crypto_sign_detached(message, keyBuf);
  const signatureBase64 = base64url(Buffer.from(signature));
  const jwt = `${message}.${signatureBase64}`;

  try {
    const response = await axios.get(`https://${url}${path}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    return response.data;
  } catch (err) {
    throw new Error(
      err.response?.data?.message ||
        err.message ||
        "Failed to fetch Coinbase user transactions"
    );
  }
});

Parse.Cloud.define("verifyCoinbaseTransactionByPartnerRef", async (request) => {
  const { partnerUserRef } = request.params;
  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const now = new Date();

  // Step 1: Check the currently pending transaction
  const pendingQuery = new Parse.Query(TransactionRecords);
  pendingQuery.equalTo("portal", "Coinbase");
  pendingQuery.equalTo("status", 1); // pending
  pendingQuery.equalTo("partnerUserRef", partnerUserRef);

  const pendingTx = await pendingQuery.first({ useMasterKey: true });

  if (pendingTx) {
    const transactionDate = pendingTx.get("transactionDate");
    const minutesSince = (now - transactionDate) / (1000 * 60);

    if (minutesSince > 30) {
      pendingTx.set("status", 9); // expired
      pendingTx.set("failed_reason", "Expired after 30 mins with no success");
      await pendingTx.save(null, { useMasterKey: true });
      return { status: "expired", partnerUserRef };
    }

    // Check live status from Coinbase
    try {
      const result = await Parse.Cloud.run("getCoinbaseUserTransactionsByRef", { partnerUserRef });
      const coinbaseTxs = result?.data || [];

      if (coinbaseTxs.length === 0) {
        return { status: "no_activity", message: "No transactions yet in Coinbase" };
      }

      const latestTx = coinbaseTxs[0];
      const coinbaseStatus = latestTx.status;

      if (coinbaseStatus === "ONRAMP_TRANSACTION_STATUS_FAILED") {
        pendingTx.set("status", 10); // failed
        pendingTx.set("failed_reason", latestTx.failure_reason || "Coinbase marked as failed");
        await pendingTx.save(null, { useMasterKey: true });
        return { status: "failed", reason: latestTx.failure_reason };
      }

      return {
        status: "pending_or_successful",
        coinbaseStatus,
        message: "No action taken. Transaction is still in progress or succeeded externally.",
      };
    } catch (err) {
      console.error("Coinbase fetch failed:", err.message);
      throw new Error("Unable to fetch Coinbase transaction status");
    }
  }

  // Step 2: No pending tx found — check if it expired in last 24 hours
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredQuery = new Parse.Query(TransactionRecords);
  expiredQuery.equalTo("portal", "Coinbase");
  expiredQuery.equalTo("status", 9); // expired
  expiredQuery.equalTo("partnerUserRef", partnerUserRef);
  expiredQuery.greaterThan("updatedAt", yesterday);

  const expiredTx = await expiredQuery.first({ useMasterKey: true });

  if (!expiredTx) {
    throw new Error("No matching Coinbase transaction found (pending or recently expired)");
  }

  // Retry Coinbase status check for expired tx
  try {
    const result = await Parse.Cloud.run("getCoinbaseUserTransactionsByRef", { partnerUserRef });
    const coinbaseTxs = result?.data || [];

    if (coinbaseTxs.length === 0) {
      return { status: "expired_no_activity", message: "Still no activity on Coinbase after expiration" };
    }

    const latestTx = coinbaseTxs[0];
    const coinbaseStatus = latestTx.status;

    if (coinbaseStatus === "ONRAMP_TRANSACTION_STATUS_FAILED") {
      expiredTx.set("status", 10); // failed
      expiredTx.set("failed_reason", latestTx.failure_reason || "Coinbase marked as failed");
      await expiredTx.save(null, { useMasterKey: true });
      return { status: "updated_to_failed_after_expiry", reason: latestTx.failure_reason };
    }

    if (coinbaseStatus === "ONRAMP_TRANSACTION_STATUS_SUCCESS") {
      expiredTx.set("status", 2); // success (assumed)
      expiredTx.unset("failed_reason"); // remove any previous failure reason
      await expiredTx.save(null, { useMasterKey: true });
      return { status: "updated_to_success_after_expiry" };
    }

    return {
      status: "expired_but_still_processing",
      coinbaseStatus,
      message: "Coinbase reports processing even after expiration",
    };
  } catch (err) {
    console.error("Coinbase fetch failed for expired tx:", err.message);
    throw new Error("Unable to verify expired Coinbase transaction");
  }
});



Parse.Cloud.define("markFailedCoinbaseTransactions", async (request) => {
  try {
    // Step 1: Fetch all Coinbase transactions
    const result = await Parse.Cloud.run("getCoinbaseTransactions");
    const transactions = result?.result?.transactions || [];

    const failedTxs = transactions.filter(
      (tx) => tx.status === "ONRAMP_TRANSACTION_STATUS_FAILED"
    );

    if (failedTxs.length === 0) {
      return { message: "No failed Coinbase transactions found." };
    }

    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const updatedRecords = [];

    for (const tx of failedTxs) {
      // You may use wallet_address or transaction_id to match. Assuming wallet_address.
      const txQuery = new Parse.Query(TransactionRecords);
      txQuery.equalTo("portal", "Coinbase");
      txQuery.equalTo("status", 1); // pending
      txQuery.equalTo("walletAddress", tx.wallet_address); // or use another matching field
      txQuery.descending("createdAt");

      const existingTx = await txQuery.first({ useMasterKey: true });

      if (existingTx) {
        existingTx.set("status", 10); // failed
        existingTx.set("remark", tx.failure_reason || "Marked failed by Coinbase");

        await existingTx.save(null, { useMasterKey: true });
        updatedRecords.push({
          id: existingTx.id,
          walletAddress: tx.wallet_address,
          reason: tx.failure_reason || "Unspecified",
        });
      }
    }

    return {
      updatedCount: updatedRecords.length,
      updatedRecords,
    };
  } catch (error) {
    console.error("Error in markFailedCoinbaseTransactions:", error);
    throw new Error("Failed to process Coinbase failed transactions");
  }
});
