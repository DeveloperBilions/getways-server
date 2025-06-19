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

Parse.Cloud.define("exportAllWertTransactions", async () => {
  const batchSize = 20;          // Wert returns max 20 rows / call
  let  offset     = 0;
  let  pageCount  = 0;
  const allOrders = [];

  // ── create /exports folder ───────────────────────────
  const exportDir = path.join(__dirname, "exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  // ── paginate until API returns 0 rows ────────────────
  while (true) {
    const url = new URL("https://partner.wert.io/api/external/orders");
    url.searchParams.append("limit",  batchSize);
    url.searchParams.append("offset", offset);
    url.searchParams.append("order_by", "asc");

    const res = await fetch(url.toString(), {
      method : "GET",
      headers: {
        "X-API-KEY"   : process.env.WERT_APP_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) throw new Error(`Wert API error (page ${pageCount}): ${res.statusText}`);

    const { data = [] } = await res.json();
    if (data.length === 0) break;        // ✅ no more pages

    allOrders.push(...data);
    offset    += data.length;            // advance by *actual* amount
    pageCount += 1;
  }

  // ── write Excel ──────────────────────────────────────
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(allOrders), "Wert Transactions");

  const fileName = `Wert_Transactions_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, fileName);
  xlsx.writeFile(wb, filePath);

  return {
    status   : "success",
    message  : `Exported ${allOrders.length} transactions (pages: ${pageCount}).`,
    path     : filePath,
    rowCount : allOrders.length,
  };
});

  
Parse.Cloud.define("exportAgentTransactionSummary", async () => {
  const batchLimit = 100000;

  // ── Step 1: Fetch all agents ──────────────────────────────
  const agents = await new Parse.Query(Parse.User)
    .equalTo("roleName", "Agent")
    .limit(batchLimit)
    .find({ useMasterKey: true });

  const allSummaries = [];

  // ── Step 2: Iterate over agents ───────────────────────────
  for (const agent of agents) {
    const userId = agent.id;
    const username = agent.get("username");

    // Get list of player userIds under this agent
    const playerList = await fetchPlayerList(userId); // This must be defined elsewhere

    // Aggregate transaction stats
    const result = await new Parse.Query("TransactionRecords").aggregate([
      { $match: { userId: { $in: playerList } } },
      {
        $facet: {
          totalRechargeAmount: [
            { $match: { status: { $in: [2, 3] } } },
            { $group: { _id: null, total: { $sum: "$transactionAmount" } } },
          ],
          totalRedeemAmount: [
            {
              $match: {
                type: "redeem",
                status: { $in: [4, 8] },
                transactionAmount: { $gt: 0, $type: "number" },
              },
            },
            { $group: { _id: null, total: { $sum: "$transactionAmount" } } },
          ],
          totalRedeemServiceFee: [
            {
              $match: {
                type: "redeem",
                status: { $in: [4, 8] },
                transactionAmount: { $gt: 0, $type: "number" },
                redeemServiceFee: { $exists: true, $type: "number" },
              },
            },
            {
              $project: {
                feeAmount: {
                  $ceil: {
                    $multiply: [
                      "$transactionAmount",
                      { $divide: ["$redeemServiceFee", 100] },
                    ]
                  }
                }                
              },
            },
            { $group: { _id: null, total: { $sum: "$feeAmount" } } },
          ],
        },
      },
    ], { useMasterKey: true });

    const stats = result[0] || {};

    // Aggregate drawer agent payouts
    const drawer = await new Parse.Query("DrawerAgent").aggregate([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ], { useMasterKey: true });

    // Push to data array
    allSummaries.push({
      agentId: userId,
      username,
      totalRecharge: stats.totalRechargeAmount?.[0]?.total || 0,
      totalRedeem: stats.totalRedeemAmount?.[0]?.total || 0,
      totalAccountPaid: drawer?.[0]?.total || 0,
      totalRedeemFee: stats.totalRedeemServiceFee?.[0]?.total || 0,
    });
  }

  // ── Step 3: Write to Excel ────────────────────────────────
  const sheet = xlsx.utils.json_to_sheet(allSummaries, {
    header: [
      "agentId",
      "username",
      "totalRecharge",
      "totalRedeem",
      "totalAccountPaid",
      "totalRedeemFee",
    ],
  });

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheet, "Agent Summary");

  // Ensure export folder exists
  const exportDir = path.join(__dirname, "exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const fileName = `Agent_Summary_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, fileName);
  xlsx.writeFile(wb, filePath);

  return {
    status: "success",
    message: `Exported ${allSummaries.length} agents.`,
    path: filePath,
    rowCount: allSummaries.length,
  };
});

  
async function fetchPlayerList  (userid)  {
  try {
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("roleName", "Player");
    userQuery.equalTo("userParentId", userid);
    userQuery.select("objectId");
    userQuery.limit(100000);
    const players = await userQuery.find({ useMasterKey: true });
    return players.map(player => player.id);
  } catch (error) {
    console.error("Error fetching player list:", error);
    throw error;
  }
}; 