const axios = require('axios');
const qs = require('querystring');
const { getParentUserId, updatePotBalance } = require('../utility/utlis');
const https = require('follow-redirects').https;

Parse.Cloud.define("createPayarcOrder", async (request) => {
  try {
    const postData = qs.stringify({
        amount: request.params.amount.toString(),
        surcharge_percent: request.params.surcharge_percent.toString()
      });

    const response = await axios.post(
      'https://api.payarc.net/v1/orders/',
      postData,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${process.env.PAYARC_API_KEY}`,
        },
        maxRedirects: 20
      }
    );

    return response.data;  // Send Payarc response back to client
  } catch (error) {
    console.error("Payarc API Error:", error.response?.data || error.message);
    throw new Error("Failed to create Payarc order");
  }
});

Parse.Cloud.define("verifyRechargeForPayarc", async (request) => {
  const log = request.log;
  const TransactionRecords = Parse.Object.extend("TransactionRecords");

  const query = new Parse.Query(TransactionRecords);
  query.equalTo("status", 1); // Pending
  query.equalTo("portal", "Payarc");

  const pendingTxs = await query.findAll({ useMasterKey: true });

  let verifiedCount = 0;
  let expiredCount = 0;

  for (const tx of pendingTxs) {
    const orderId = tx.get("transactionIdFromStripe"); // stores Payarc order ID
    const txDate = tx.get("createdAt");
    const userId = tx.get("userId");

    if (!orderId) continue;

    try {
      const res = await axios.get(
        `https://api.payarc.net/v1/orders/${orderId}/charge`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYARC_API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      console.log(res?.data?.data,"❌statusss❌")
      const status = res?.data?.status?.toLowerCase();

      if (status === "completed") {
        const amount = res?.data?.amount || tx.get("transactionAmount");

        tx.set("status", 2); // completed
        tx.set("transactionAmount", amount);
        await tx.save(null, { useMasterKey: true });

        const parentUserId = await getParentUserId(userId);
        await updatePotBalance(parentUserId, amount, "recharge");

        verifiedCount++;
      } else {
        const now = new Date();
        const ageMinutes = (now - txDate) / 60000;
        if (ageMinutes > 45) {
          tx.set("status", 9); // expired
          await tx.save(null, { useMasterKey: true });
          expiredCount++;
        }
      }
    } catch (err) {
      log.error(`❌ Order ID ${orderId} failed to verify: ${err}`);
      const now = new Date();
        const ageMinutes = (now - txDate) / 60000;
        if (ageMinutes > 45) {
          tx.set("status", 9); // expired
          await tx.save(null, { useMasterKey: true });
          expiredCount++;
        }
    }
  }

  log.info(`✅ Verified ${verifiedCount} Payarc recharges.`);
  log.info(`🕒 Marked ${expiredCount} as expired.`);
});


Parse.Cloud.define("createPayarcCharge", async (request) => {
    const { token_id, amount, currency = "usd", description = "Recharge" } = request.params;
  
    const PAYARC_API_KEY = process.env.PAYARC_API_KEY; // ✅ Secure this in your .env or server config
  
    try {
      const response = await axios.post(
        "https://api.payarc.net/v1/charges",
        qs.stringify({
          amount: String(amount),
          currency,
          statement_description: description,
          token_id,
          capture: '1'
        }),
        {
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Bearer ${PAYARC_API_KEY}`
          },
          maxRedirects: 20
        }
      );
        console.log( " ✅ ✅ ✅ ",response.data)
      return response.data; // ✅ Forward the charge response to client
    } catch (error) {
      console.error("PayArc charge error:", error.response?.data || error.message);
      throw new Parse.Error(500, "PayArc charge failed: " + (error.response?.data?.message || error.message));
    }
  });
  