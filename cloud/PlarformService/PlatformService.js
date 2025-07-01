const crypto = require("crypto");
const axios = require("axios");

//9cc60ec647d866e35fb57dd296adf37016b602299f90e17f2683eb65236d9580
// /cloud/main.js (or wherever you keep cloud code)
Parse.Cloud.define("createPlatform", async (request) => {
  const { platformName, callbackUrl } = request.params;
  if (!platformName || !callbackUrl) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "platformName and callbackUrl are required."
    );
  }

  // 1️⃣  Generate a new 32-byte secret as 64-char hex
  const secretToken = crypto.randomBytes(32).toString("hex");

  // 2️⃣  Encrypt it with AES-256-CBC
  const encryptionKey = process.env.ENCRYPTION_KEY; // 32-byte key
  if (!encryptionKey || encryptionKey.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes.");
  }

  const iv = crypto.randomBytes(16); // 128-bit IV
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(encryptionKey),
    iv
  );
  let encrypted = cipher.update(secretToken, "utf8", "hex");
  encrypted += cipher.final("hex");
  const encryptedAccessKey = iv.toString("hex") + ":" + encrypted;

  // 3️⃣  Persist the new Platform row
  const Platform = Parse.Object.extend("Platform");
  const platform = new Platform();
  platform.set("platformName", platformName);
  platform.set("callbackUrl", callbackUrl);
  platform.set("encryptedAccessKey", encryptedAccessKey);
  await platform.save(null, { useMasterKey: true });

  // 4️⃣  Return the plaintext token once so the caller can store it
  return {
    status: "success",
    id: platform.id,
    secretToken, // only shown NOW; never retrievable later
  };
});

Parse.Cloud.define("verifyAccessToken", async (request) => {
  const { platformName, token } = request.params;
  if (!platformName || !token) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "platformName and token are required."
    );
  }

  // 1️⃣  Fetch the platform row
  const Platform = Parse.Object.extend("Platform");
  const query = new Parse.Query(Platform);
  query.equalTo("platformName", platformName);
  const platform = await query.first({ useMasterKey: true });

  if (!platform) throw new Parse.Error(404, "Unknown platform");

  // 2️⃣  Decrypt the stored secret
  const [ivHex, encrypted] = platform.get("encryptedAccessKey").split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(process.env.ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  // 3️⃣  Compare secrets
  if (decrypted !== token) {
    throw new Parse.Error(403, "Invalid token");
  }

  return { valid: true };
});

Parse.Cloud.define("getPlatformTransactions", async (request) => {
  const {
    platformName,
    token,
    page = 1,
    pageSize = 25,
    userId,
    status,
    type,
  } = request.params;

  // basic validation
  if (!platformName || !token) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "platformName and token are required."
    );
  }
  const limit = Math.min(parseInt(pageSize, 10) || 25, 100); // cap at 100
  const skip = (Math.max(parseInt(page, 10), 1) - 1) * limit; // zero-based

  // 1. Validate token by internally invoking verifyAccessToken
  await Parse.Cloud.run(
    "verifyAccessToken",
    { platformName, token },
    { useMasterKey: true }
  );

  // 2. Build the Transactions query
  const Transactions = Parse.Object.extend("Transactions");
  const q = new Parse.Query(Transactions)
    .equalTo("platform", platformName)
    .limit(limit)
    .skip(skip)
    .descending("createdAt");

  if (userId) q.equalTo("userId", userId);
  if (typeof status !== "undefined") q.equalTo("status", status);
  if (type) q.equalTo("type", type);

  // 3. Get count and page data in parallel
  const [results, total] = await Promise.all([
    q.find({ useMasterKey: true }),
    q.count({ useMasterKey: true }),
  ]);

  // 4. Return clean JSON
  return {
    page: Number(page),
    pageSize: limit,
    total,
    results: results.map((obj) => ({
      id: obj.id,
      transactionAmount: obj.get("transactionAmount"),
      portal: obj.get("portal"),
      platform: obj.get("platform"),
      userId: obj.get("userId"),
      status: obj.get("status"),
      type: obj.get("type"),
      transactionDate: obj.get("transactionDate"),
      transactionIdFromStripe: obj.get("transactionIdFromStripe"),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    })),
  };
});

Parse.Cloud.afterSave("Transactions", async (request) => {
  const tx = request.object;
  const original = request.original; // undefined on create
  const status = tx.get("status");

//   if (status !== 2) return;
//   if (original && original.get("status") === 2) return;

  const platformName = tx.get("platform");
  if (!platformName) return; // nothing to notify

  const Platform = Parse.Object.extend("Platform");
  const pQuery = new Parse.Query(Platform);
  pQuery.equalTo("platformName", platformName);
  const platformObj = await pQuery.first({ useMasterKey: true });
  if (!platformObj) return;

  const callbackUrl = platformObj.get("callbackUrl");
  if (!callbackUrl) return; // no webhook configured

  const [ivHex, encrypted] = platformObj.get("encryptedAccessKey").split(":");
  const iv = Buffer.from(ivHex, "hex");

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(process.env.ENCRYPTION_KEY),
    iv
  );
  let secret = decipher.update(encrypted, "hex", "utf8");
  secret += decipher.final("utf8");

  const payload = {
    id: tx.id,
    transactionAmount: tx.get("transactionAmount"),
    portal: tx.get("portal"),
    platform: platformName,
    userId: tx.get("userId"),
    status,
    type: tx.get("type"),
    transactionDate: tx.get("transactionDate"),
    transactionIdFromStripe: tx.get("transactionIdFromStripe"),
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };

  // 4️⃣  Optional: sign the body with HMAC-SHA256 so the receiver can verify
  const hmac = crypto.createHmac("sha256", secret);
  const signature = hmac.update(JSON.stringify(payload)).digest("hex");

  // 5️⃣  Fire webhook (best-effort; errors are logged but don’t abort save)
  try {
    await axios.post(callbackUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
        },
      });
    console.log(`Webhook sent to ${callbackUrl} for tx ${tx.id}`);
  } catch (err) {
    console.error(`Webhook failed for tx ${tx.id}:`, err);
    // DON’T throw – we don’t want to roll back the save
  }
});

// Parse.Cloud.define("transactionUpdate", async (request) => {
//     const q = new Parse.Query("Transactions");
// q.equalTo("userId", "2589956");       // or 2589956
// q.notEqualTo("status", 2);            // skip the ones already done

// const rows = await q.find();
// rows.forEach(tx => tx.set("status", 2));

// await Parse.Object.saveAll(rows);
// });