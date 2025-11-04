const crypto = require("crypto");
const axios = require("axios");
const moment = require("moment-timezone");
const { updatePotBalance } = require('./utility/utlis');
const { logTransactionChange } = require("./TransactionLogs/logs");
const CLIENT_ID = process.env.CELLPAY_CLIENT_ID
const SECRET = process.env.CELLPAY_SECRET
const BASE_URL =
  process.env.CELLPAY_BASE_URL

Parse.Cloud.define("cellpayRefill", async (request) => {
  try {
    const { mobileNumber, amount, vp_username, vp_email } = request.params;

    // Get current date in CST (America/Chicago) timezone, format m-d-Y
    const dateCST = moment().tz("America/Chicago").format("MM-DD-YYYY");

    // Compute md5 hash of SECRET + date
    const apiKey = crypto
      .createHash("md5")
      .update(SECRET + dateCST)
      .digest("hex");

    // Prepare headers
    const headers = {
      CLIENTID: CLIENT_ID,
      APIKEY: apiKey,
      "Content-Type": "application/json",
    };

    // Example payload (adjust as per CellPay API doc)
    const payload = {
        "phone":mobileNumber,            	
        "carrierId":333424,             
        "planId":"trc20usdt",	
        "amount":amount,                 
        "vp_username":vp_username,      
        "vp_email":vp_email,  
        "successURL" : process.env.FRONTEND_URL,
        "cancelURL" :  process.env.FRONTEND_URL,         
        "reference_id":Date.now()        
    };


    // Send POST request
    const response = await axios.post(
      "https://cellpayconnect.us/extras/rest-api/transactions/refill",
      payload,
      { headers }
    );

    return response.data;
  } catch (error) {
    console.error("CellPay Refill Error:", error.response?.data || error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.response?.data || error.message
    );
  }
});

Parse.Cloud.define("cellpayBtcTxnStatus", async () => {
    try {
      const query = new Parse.Query("TransactionRecords");
      query.equalTo("status", 1); // Pending only
      query.notEqualTo("portal", "GetPay");
      query.limit(10000);
  
      const pendingTransactions = await query.find({ useMasterKey: true });
      if (!pendingTransactions.length) {
        return { message: "No pending transactions found" };
      }
  
      // 🔹 Compute CST date + API key
      const dateCST = moment().tz("America/Chicago").format("MM-DD-YYYY");
      const apiKey = crypto
        .createHash("md5")
        .update(SECRET + dateCST)
        .digest("hex");
  
      const headers = {
        CLIENTID: CLIENT_ID,
        APIKEY: apiKey,
      };
  
      const results = [];
  
      for (const txn of pendingTransactions) {
        try {
          const address = txn.get("transactionIdFromStripe");
          const amount = txn.get("transactionAmount");
          const parentId= txn.get("userParentId");

          if (!address) continue;
  
          const url = `${BASE_URL}/btcTxnStatus/${address}`;
          const response = await axios.get(url, { headers });
          const data = response.data;
  
          const status = data?.status?.toLowerCase();
  
          if (status === "complete") {
            const originalTxn = txn.clone();
            txn.set("status", 2); 
            await updatePotBalance(parentId, amount, "recharge");
            await logTransactionChange({
              originalTxn,
              updatedTxn: txn,
              sourceFunction: "cellpayBtcTxnStatus (btc-complete)",
            });
          }
  
          await txn.save(null, { useMasterKey: true });
  
          results.push({
            address,
            newStatus: txn.get("status"),
            statusFromAPI: status,
          });
        } catch (innerError) {
          console.error("Error processing txn:", innerError.message);
        }
      }
  
      return {
        message: `Processed ${results.length} transaction(s).`,
        results,
      };
    } catch (error) {
      console.error("BTC Txn Status Error:", error.response?.data || error.message);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        error.response?.data || error.message
      );
    }
});