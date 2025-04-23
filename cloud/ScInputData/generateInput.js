const Web3 = require("web3");
const web3 = new Web3(); // No provider needed for encoding
const { signSmartContractData } = require("@wert-io/widget-sc-signer");
const privateKey = "0x2bcb9fc6533713d0705a9f15850a027ec26955d96c22ae02075f3544e6842f74";

Parse.Cloud.define("generateScInputData", async (req) => {
    const { path, recipient, amountIn, amountOutMinimum } = req.params;
  
    if (!path || !recipient || !amountIn || !amountOutMinimum) {
      throw new Error("Missing required parameters");
    }
  
    const exactInputABI = {
      name: "exactInput",
      type: "function",
      inputs: [
        {
          type: "tuple",
          name: "params",
          components: [
            { type: "bytes", name: "path" },
            { type: "address", name: "recipient" },
            { type: "uint256", name: "amountIn" },
            { type: "uint256", name: "amountOutMinimum" },
          ],
        },
      ],
    };
  
    const sc_input_data = web3.eth.abi.encodeFunctionCall(exactInputABI, [
      {
        path,
        recipient,
        amountIn,
        amountOutMinimum,
      },
    ]);
  
    // Prepare signing payload
    const signPayload = {
      address: recipient,
      commodity: "USDT",
      commodity_amount: (parseFloat(amountIn) / Math.pow(10, 18)).toString()
      , // you can change to actual readable token amount if needed
      network: "bsc",
      sc_address: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
      sc_input_data,
    };
  
    // Sign the smart contract data
    const signedData = signSmartContractData(signPayload, privateKey);
  
    return {
      sc_input_data,
      signedData,
    };
  });

  Parse.Cloud.define("getAOGTransactions", async (request) => {
    const { userId, page = 1, limit = 10 } = request.params;
  
    if (!userId) {
      throw new Error("userId is required");
    }
  
    const AOGTransaction = Parse.Object.extend("AOGTransaction");
  
    const query = new Parse.Query(AOGTransaction);
    query.equalTo("userId", userId);
    query.descending("createdAt");
    query.skip((page - 1) * limit);
    query.limit(limit);
  
    try {
      // Fetch total count separately
      const countQuery = new Parse.Query(AOGTransaction);
      countQuery.equalTo("userId", userId);
      const totalCount = await countQuery.count({ useMasterKey: true });
  
      const results = await query.find({ useMasterKey: true });
  
      const formatted = results.map((txn) => ({
        clickId: txn.get("clickId"),
        walletAddress: txn.get("walletAddress"),
        amount: txn.get("amount"),
        status: txn.get("status"),
        date: txn.get("date"),
      }));
  
      return {
        success: true,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        transactions: formatted,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  Parse.Cloud.define("checkRecentPendingWertTransactionsAOG", async () => {
    const THIRTY_MINUTES_AGO = new Date(Date.now() - 30 * 60 * 1000);
  
    try {
      const query = new Parse.Query("AOGTransaction");
      query.equalTo("status", "Pending"); // Only pending records
      query.limit(10000);
      query.greaterThanOrEqualTo("updatedAt", THIRTY_MINUTES_AGO);
      query.descending("updatedAt");
  
      const pendingTransactions = await query.find({ useMasterKey: true });
      const results = [];
  
      for (const txn of pendingTransactions) {
        const orderId = txn.get("clickId");
  
        if (!orderId) {
          results.push({ id: txn.id, skipped: true, reason: "Missing transactionIdFromStripe" });
          continue;
        }
  
        try {
          const url = new URL("https://partner.wert.io/api/external/orders");
          url.searchParams.append("search_by", orderId);
          //url.searchParams.append("click_id", "txn-1745323957607");
  
          const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
              "X-API-KEY": process.env.WERT_APP_KEY,
              "Content-Type": "application/json",
            },
          });
  
          if (!response.ok) {
            throw new Error(`Wert API error: ${response.statusText}`);
          }
  
          const { data } = await response.json();
          const order = data?.[0];
  
          if (!order) {
            //results.push({ id: txn.id, updated: false, reason: "Order not found in Wert" });
            ///continue;
          }
  
          const wertStatus = order?.status || "N/A";
          let newStatus = txn.get("status"); // default to existing if no match
          console.log(wertStatus,"wertStatus",order)
          // 🧠 Map Wert  statuses to your internal codes
          switch (wertStatus) {
            case "success":
              newStatus = 2; // success
              break;
            case "failed":
            case "cancelled":
              newStatus = 10; // failed
              break;
            case "pending":
            case "progress":
            case "created":
              newStatus = 1; // still pending
              break;
            default:
              newStatus = 9; // expired or unknown
              break;
          }
  
          // Only update if status has changed
          if (txn.get("status") !== newStatus) {
            txn.set("status", wertStatus);
            await txn.save(null, { useMasterKey: true });
  
            results.push({ id: txn.id, updated: true, newStatus, wertStatus });
          } else {
            results.push({ id: txn.id, updated: false, wertStatus });
          }
        } catch (err) {
          console.error(`❌ Error processing txn ${txn.id}:`, err.message);
          results.push({ id: txn.id, error: err.message });
        }
      }
  
      return {
        processed: pendingTransactions.length,
        results,
      };
    } catch (err) {
      console.error("❌ Error in checkRecentPendingWertTransactions:", err.message);
      throw new Error("Failed to sync Wert transactions");
    }
  });