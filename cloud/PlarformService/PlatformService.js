const crypto = require("crypto");
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

  const iv = crypto.randomBytes(16);                 // 128-bit IV
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
    secretToken // only shown NOW; never retrievable later
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
    const [ivHex, encrypted] = platform
      .get("encryptedAccessKey")
      .split(":");
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

  