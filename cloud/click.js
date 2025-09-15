// cloud/main.js
import axios from "axios";

Parse.Cloud.define(
  "createCheckoutSession",
  async (request) => {
    const { amount } = request.params || {};

    if (!request.user) {
      throw new Parse.Error(
        Parse.Error.SESSION_MISSING,
        "Authentication required."
      );
    }

    if (typeof amount === "string") {
      amount = parseFloat(amount);
    }
    
    // 🔹 Validate
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_JSON,
        "Invalid amount: must be a positive number."
      );
    }

    const objectId = request.user.id;
    const username = request.user.get("username") || "User";
    const customerId = String(objectId).trim();

    const customerName = String(username).trim();

    // Type & presence checks
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("Invalid amount: must be a positive integer.");
    }
    if (!customerId) {
      throw new Error("Missing customer id.");
    }
    if (!customerName) {
      throw new Error("Missing customer name.");
    }
    try {
      const resp = await axios.post(
        `${process.env.CLKK_API_URL}api/partner/checkout/sessions`,
        {
          amount: amount,
          success_url: "https://skynbliss.co/playerDashboard",
          cancel_url: "https://skynbliss.co/playerDashboard",
          customer: {
            id: customerId,
            name: customerName,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CLKK_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      return resp.data;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;

      console.error("createCheckoutSession error:", {
        status,
        body,
        message: err.message,
      });

      // Throw a clean error to client
      throw new Parse.Error(
        status || Parse.Error.INTERNAL_SERVER_ERROR,
        body?.message || "Failed to create checkout session"
      );
    }
  },
  { requireUser: true }
); // extra guard; blocks unauthenticated calls

Parse.Cloud.define("expireOldCLKKTransactions", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const query = new Parse.Query(TransactionRecords);

  // 30 minutes ago
  const now = new Date();
  const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);
  console.log(halfHourAgo, "halfHourAgohalfHourAgo");
  query.equalTo("portal", "CLK");
  query.equalTo("status", 1); // Pending
  query.lessThan("createdAt", halfHourAgo);
  query.limit(1000); // Max batch size

  try {
    const results = await query.find({ useMasterKey: true });

    if (results.length === 0) {
      return `No old CLKK transactions to update.`;
    }

    for (const txn of results) {
      txn.set("status", 9); // Mark as expired/failed
    }

    await Parse.Object.saveAll(results, { useMasterKey: true });

    return `Updated ${results.length} transactions to status 9.`;
  } catch (error) {
    console.error("❌ Error updating transactions:", error);
    throw new Error("Failed to update expired CLKK transactions.");
  }
});
const API_KEY = process.env.CLKK_API_KEY;
const BASE_URL = `https://api.staging.clkk-api.io/api/partner`;

Parse.Cloud.define("checkClkkPayments", async (request) => {

  const Transaction = Parse.Object.extend("TransactionRecords");
  const query = new Parse.Query(Transaction);

  query.equalTo("status", 11); // pending
  query.exists("transactionIdFromStripe"); // must have txn id
  query.contains("paymentMode", "CLKK-"); // ensure CLKK cashout
  query.limit(50); // process in batches

  try {
    const txns = await query.find({ useMasterKey: true });
    console.log(`🔎 Found ${txns.length} pending transactions`);

    for (const txn of txns) {
      const paymentId = txn.get("transactionIdFromStripe");

      try {
        // 1. Fetch payment status from CLKK API
        const res = await axios.get(`${BASE_URL}/payments/${paymentId}`, {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
        });

        const payment = res.data;
        console.log(`Txn ${paymentId} → CLKK Status: ${payment.status}`);

        // 2. If completed, update transaction
        if (payment.status && payment.status.toUpperCase() === "COMPLETED") {
          txn.set("status", 12); // mark as completed
          await txn.save(null, { useMasterKey: true });
          console.log(`✅ Updated txn ${txn.id} to status 12`);
        }
      } catch (err) {
        console.error(`❌ Error fetching payment ${paymentId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Cron job failed:", err.message);
  }
});

Parse.Cloud.define("createClkkPayout", async (request) => {
  const { recipientId, method, amount, description, orderId, userId } =
    request.params;

  if (
    !recipientId ||
    !method ||
    !amount ||
    !description ||
    !orderId ||
    !userId
  ) {
    throw new Error("Missing required fields");
  }

  const CLKK = Parse.Object.extend("CLKK");
  const clkkQuery = new Parse.Query(CLKK);
  clkkQuery.equalTo("apiResponse.recipientId", recipientId);
  const clkkRecord = await clkkQuery.first({ useMasterKey: true });

  if (!clkkRecord) throw new Error("Recipient not found in CLKK table");

  const existingMethods = clkkRecord.get("methods") || [];
  const userEmail = clkkRecord.get("email");
  const userPhone = clkkRecord.get("phone");
  const addPaymentMethodIfMissing = async () => {
    if (existingMethods.includes(method.toUpperCase())) return;

    let setupBody = {};
    if (method === "paypal") {
      setupBody = {
        method: "PAYPAL",
        email: userEmail,
        metadata: { notes: "Primary PayPal account" },
      };
    } else if (method === "venmo") {
      setupBody = {
        method: "VENMO",
        phone: userPhone,
        metadata: { notes: "Venmo account for quick payments" },
      };
    } else {
      throw new Error("Unsupported method");
    }

    const methodRes = await axios.post(
      `${BASE_URL}/recipients/${recipientId}/payment-methods`,
      setupBody,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
      console.log(methodRes,"methodResmethodResmethodResmethodResmethodRes")
    if (!methodRes.data) {
      throw new Error("Failed to add payment method");
    }

    // Update methods array in CLKK table
    clkkRecord.set("methods", [...existingMethods, method.toUpperCase()]);
    await clkkRecord.save(null, { useMasterKey: true });

    return methodRes.data;
  };

  await addPaymentMethodIfMissing();

  let payoutURL = "",
    payoutBody = {};
  if (method === "venmo") {
    payoutURL = `${BASE_URL}/payouts/venmo`;
    payoutBody = {
      recipientId,
      amount,
      description,
      metadata: { orderId },
    };
  } else if (method === "paypal") {
    payoutURL = `${BASE_URL}/payouts/paypal`;
    payoutBody = {
      recipientId,
      amount,
      description,
      metadata: { invoiceId: orderId },
    };
  } else {
    throw new Error("Invalid payout method. Use 'venmo' or 'paypal'");
  }
  const payoutRes = await axios.post(payoutURL, payoutBody, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  console.log(payoutRes, "payoutResultpayoutResult");

  const payoutResult = payoutRes.data;
  console.log(payoutResult, "payoutResultpayoutResult");
  if (!payoutResult) throw new Error("Payout failed");

  const userQuery = new Parse.Query(Parse.User);
  const user = await userQuery.get(userId, { useMasterKey: true });
  if (!user) throw new Error("User not found");

  const Transaction = Parse.Object.extend("TransactionRecords");
  const txn = new Transaction();

  txn.set("status", 11);
  txn.set("userId", user.id);
  txn.set("username", user.get("username"));
  txn.set("userParentId", user.get("userParentId") || "");
  txn.set("type", "redeem");
  txn.set("transactionAmount", parseFloat(amount));
  txn.set("gameId", "786"); // static placeholder
  txn.set("transactionDate", new Date());
  txn.set("transactionIdFromStripe", payoutResult?.transactionId);
  txn.set("isCashOut", true);
  txn.set("paymentMode", `CLKK-${method.toUpperCase()}`);

  await txn.save(null, { useMasterKey: true });

  // -------------------------------
  // 6. Update Wallet balance
  // -------------------------------
  const Wallet = Parse.Object.extend("Wallet");
  const walletQuery = new Parse.Query(Wallet);
  const wallet = await walletQuery
    .equalTo("userID", user.id)
    .first({ useMasterKey: true });

  if (!wallet) throw new Error("Wallet not found");

  const currentBalance = wallet.get("balance") || 0;
  const newBalance = currentBalance - parseFloat(amount);

  if (newBalance < 0) {
    return { error: "Insufficient balance.", status: "Failed" };
  }

  wallet.set("balance", newBalance);
  await wallet.save(null, { useMasterKey: true });

  return {
    payout: payoutResult,
    transactionId: txn.id,
    newBalance,
  };
});

Parse.Cloud.define("saveClkkRecipient", async (request) => {
  const { name, email, phone, metadata } = request.params;
  try {
    const response = await fetch(
      `${BASE_URL}/recipients`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`, // ⚠️ Move to env
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          phone: phone.toString(),
          metadata,
        }),
              }
    );
    const data = await response.json();
    console.log(data,"datadata", response)

    if (!response.ok) throw new Error(data.message || "Failed");

    const CLKK = Parse.Object.extend("CLKK");
    const obj = new CLKK();

    // Save recipient details
    obj.set("name", name);
    obj.set("email", email);
    obj.set("phone", phone);
    obj.set("metadata", metadata);
    obj.set("apiResponse", data);

    // Save user info (if logged in)
    if (request.user) {
      obj.set("user", request.user); // pointer to _User
      obj.set("userId", request.user.id); // raw userId string (optional)
    }

    await obj.save(null, { useMasterKey: true });

    return data;
  } catch (err) {
    throw new Error("CLKK Save Error: " + err.message);
  }
});

Parse.Cloud.define("initiateClkkCardSetup", async (request) => {
  const { recipientId, name, email, phone, vendorId, amount, description } =
    request.params;

  if (!recipientId || !name || !email || !phone) {
    throw new Error("Missing required fields for card setup");
  }

  const response = await fetch(`${BASE_URL}/recipients/setup-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      success_url: `https://skynbliss.co/clkk-cashout?amount=${amount}&description=${description}&recipient_id=${recipientId}`,
      cancel_url: "https://skynbliss.co/cancel",
      recipient: { recipient_id: recipientId, name, email, phone },
      recipient_id: recipientId,
      allowed_methods: ["card"],
      expires_in_seconds: 86400,
      partner_reference: vendorId,
    }),
  });

  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "Card setup session failed");

  return result; // includes public_url
});

Parse.Cloud.define("pushClkkCardPayment", async (request) => {
  const { recipientId, amount, description, orderId } = request.params;

  if (!recipientId || !amount || !description) {
    throw new Error("Missing required fields for payment");
  }
  try {
    // ----------------------------------------
    // 1. Trigger CLKK Push-to-Card API
    // ----------------------------------------
    const res = await axios.post(
      `${BASE_URL}/payments/push-to-card`,
      {
        recipientId,
        amount: parseFloat(amount),
        currency: "USD",
        description,
        metadata: {
          order_id: orderId || `ORDER-${Date.now()}`,
          commission_period: new Date().toISOString().slice(0, 7),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const payment = res?.data?.data;
    console.log(payment,"paymentpayment")
    if (!payment) throw new Error("CLKK push-to-card response invalid");

    // ----------------------------------------
    // 2. Fetch user and wallet
    // ----------------------------------------
    const user = request.user;
    if (!user) throw new Error("Unauthorized: user not logged in");

      let wallet= null;
    if (user) {
      const Wallet = Parse.Object.extend("Wallet");
      const walletQuery = new Parse.Query(Wallet);
      wallet = await walletQuery
        .equalTo("userID", user.id)
        .first({ useMasterKey: true });
    }

    if (!user) throw new Error("User not found");
    if (!wallet) throw new Error("Wallet not found");

    // ----------------------------------------
    // 3. Deduct from wallet balance
    // ----------------------------------------
    const currentBalance = wallet.get("balance") || 0;
    const newBalance = currentBalance - parseFloat(amount);

    if (newBalance < 0) {
      throw new Error("Insufficient balance for cashout");
    }

    wallet.set("balance", newBalance);
    await wallet.save(null, { useMasterKey: true });

    // ----------------------------------------
    // 4. Create TransactionRecords entry
    // ----------------------------------------
    const Transaction = Parse.Object.extend("TransactionRecords");
    const txn = new Transaction();

    txn.set("status", 11); // pending
    txn.set("userId", user.id);
    txn.set("username", user.get("username"));
    txn.set("userParentId", user.get("userParentId"));
    txn.set("type", "redeem");
    txn.set("transactionAmount", parseFloat(amount));
    txn.set("gameId", "786");
    txn.set("transactionDate", new Date());
    txn.set("transactionIdFromStripe", payment.transactionId); // CLKK txn id
    txn.set("isCashOut", true);
    txn.set("paymentMode", "CLKK-CARD");

    await txn.save(null, { useMasterKey: true });

    // ----------------------------------------
    // 5. Return final response
    // ----------------------------------------
    return {
      message:
        "Push-to-card initiated, wallet updated, and transaction recorded",
      clkkPayment: payment,
      transactionId: txn.id,
      newWalletBalance: newBalance,
    };
  } catch (err) {
    throw new Error(
      err.response?.data?.message || err.message || "Push-to-card failed"
    );
  }
});

Parse.Cloud.define("verifyClkkCard", async (request) => {
  const { recipientId } = request.params;
  try {
    const res = await axios.get(
      `${BASE_URL}/recipients/${recipientId}/payment-methods`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    const cardMethod = res.data?.data?.paymentMethods?.find(
      (m) => m.type === "CARD" && m.configured
    );

    return { configuredCard: cardMethod || null };
  } catch (err) {
    throw new Error(err.response?.data?.message || "Card verification failed");
  }
});
