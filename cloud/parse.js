const axios = require("axios");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

Parse.Cloud.define("exportUSDCBalancesToExcel", async () => {
  const ETHERSCAN_API_KEY = "F7TE3VRA95UZ8RN4V7V3F94RAQD7968B5X";
  const USDC_CONTRACT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const LINK_CONTRACT = "0x57d90b64a1a57749b0f932f1a3395792e12e7055";
  const API_URL = "https://api.etherscan.io/api";

  const exportDir = path.join(__dirname, "exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const User = Parse.Object.extend("_User");
  const userQuery = new Parse.Query(User);
  userQuery.exists("walletAddr");
  userQuery.limit(1000);

  const users = await userQuery.find({ useMasterKey: true });
  const TransactionRecords = Parse.Object.extend("TransactionRecords");

  const resultData = [];

  for (const user of users) {
    const walletAddr = user.get("walletAddr");
    const userId = user.id;
    const username = user.get("username");

    let usdcAmount = "0.000000";
    let linkAmount = "0.000000";
    let totalCoinbaseRecharge = "0.00";

    // Fetch USDC balance
    try {
      const url = `${API_URL}?module=account&action=tokenbalance&contractaddress=${USDC_CONTRACT}&address=${walletAddr}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
      const response = await axios.get(url);
      const result = response.data?.result;
      if (result) {
        usdcAmount = (parseFloat(result) / 1e6).toFixed(6); // USDC has 6 decimals
      }
    } catch (err) {
      console.error(`USDC error for ${walletAddr}:`, err.message);
    }

    // Fetch LINK balance
    try {
      const url = `${API_URL}?module=account&action=tokenbalance&contractaddress=${LINK_CONTRACT}&address=${walletAddr}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
      const response = await axios.get(url);
      const result = response.data?.result;
      if (result) {
        linkAmount = (parseFloat(result) / 1e18).toFixed(6); // LINK has 18 decimals
      }
    } catch (err) {
      console.error(`LINK error for ${walletAddr}:`, err.message);
    }

    // Aggregate total recharge (status 2 or 3, amount > 0, portal: Coinbase)
    try {
      const aggregateResult = await TransactionRecords.aggregate([
        {
          $match: {
            userId: userId,
            portal: "Coinbase",
            status: { $in: [2, 3] },
            transactionAmount: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$transactionAmount" },
          },
        },
      ], { useMasterKey: true });

      totalCoinbaseRecharge =
        aggregateResult.length > 0
          ? parseFloat(aggregateResult[0].totalAmount).toFixed(2)
          : "0.00";
    } catch (err) {
      console.error(`Aggregate error for user ${userId}:`, err.message);
    }

    resultData.push({
      userId,
      username,
      walletAddr,
      usdcAmount,
      linkAmount,
      totalCoinbaseRecharge,
    });
  }

  // Write to Excel
  const ws = xlsx.utils.json_to_sheet(resultData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "USDC Report");

  const fileName = `USDC_Balances_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, fileName);
  xlsx.writeFile(wb, filePath);

  return {
    status: "success",
    message: "Excel file saved on server",
    path: filePath,
    rowCount: resultData.length,
  };
});

  
  
  
  