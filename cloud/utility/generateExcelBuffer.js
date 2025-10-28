const XLSX = require("xlsx");

async function generateExcelBuffer() {
  const today = new Date();

  let startDate, endDate;

  if (today.getDate() <= 15) {
    startDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), 1, 0, 0, 0)
    );
    endDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), 15, 23, 59, 59)
    );
  } else {
    startDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), 16, 0, 0, 0)
    );
    endDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
    );
  }

  const summaries = await fetchAllAgentSummaries(startDate, endDate);

  const ws = XLSX.utils.json_to_sheet(summaries);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Agent Summary");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function fetchAllAgentSummaries(startDate, endDate) {
  // Date filter
  const dateMatch = {};
  if (startDate) dateMatch.$gte = new Date(startDate);
  if (endDate) {
    const endObj = new Date(endDate);
    endObj.setDate(endObj.getDate() + 1);
    dateMatch.$lt = endObj;
  }

  // Aggregate on TransactionRecords grouped by userParentId
  const pipeline = [
    {
      $match: {
        ...(Object.keys(dateMatch).length && { createdAt: dateMatch }),
      },
    },
    {
      $group: {
        _id: "$userParentId", // agentId
        totalRecharge: {
          $sum: {
            $cond: [{ $in: ["$status", [2, 3]] }, "$transactionAmount", 0],
          },
        },
        totalRedeem: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", "redeem"] },
                  { $in: ["$status", [4, 8]] },
                  { $gt: ["$transactionAmount", 0] },
                ],
              },
              "$transactionAmount",
              0,
            ],
          },
        },
        totalRedeemFee: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", "redeem"] },
                  { $in: ["$status", [4, 8]] },
                  { $gt: ["$transactionAmount", 0] },
                  { $ifNull: ["$redeemServiceFee", false] },
                ],
              },
              {
                $ceil: {
                  $multiply: [
                    "$transactionAmount",
                    { $divide: ["$redeemServiceFee", 100] },
                  ],
                },
              },
              0,
            ],
          },
        },
      },
    },
  ];

  const trxSummary = await new Parse.Query("TransactionRecords").aggregate(
    pipeline,
    { useMasterKey: true }
  );

  // Get DrawerAgent totals grouped by agent
  const drawerPipeline = [
    {
      $match: {
        ...(Object.keys(dateMatch).length && { createdAt: dateMatch }),
      },
    },
    {
      $group: {
        _id: "$userId", // agentId
        totalPaid: { $sum: "$amount" },
      },
    },
  ];
  const drawerSummary = await new Parse.Query("DrawerAgent").aggregate(
    drawerPipeline,
    { useMasterKey: true }
  );

  // Convert drawer summary to lookup map
  const drawerMap = drawerSummary.reduce((map, d) => {
    map[d.objectId] = d.totalPaid;
    return map;
  }, {});

  // Collect all agentIds
  const agentIds = trxSummary.map((s) => s.objectId);

  // Fetch agent + master info in one query
  const agentQuery = new Parse.Query(Parse.User);
  agentQuery.containedIn("objectId", agentIds);
  agentQuery.include("userParentId"); // master agent
  const agents = await agentQuery.findAll({ useMasterKey: true });

  const agentMap = {};
  agents.forEach((a) => {
    agentMap[a.id] = {
      agentName: a.get("username") || "N/A",
      masterName: a.get("userParentName") || "N/A",
      commissionRate: a.get("commissionRate") || 12,
    };
  });

  // Merge summaries
  const results = trxSummary.map((s) => {
    const recharge = s.totalRecharge || 0;
    const redeem = s.totalRedeem || 0;
    const conversion =
      (recharge * (agentMap[s.objectId]?.commissionRate || 12)) / 100;
    const paid = drawerMap[s.objectId] || 0;

    return {
      "Agent Name": agentMap[s.objectId]?.agentName || "Unknown",
      "Master Agent": agentMap[s.objectId]?.masterName || "Unknown",
      "Total Recharges": recharge.toFixed(2),
      "Total Redeems": redeem.toFixed(2),
      "Total Conversion": conversion.toFixed(2),
      "Total Paid": paid.toFixed(2),
    };
  });

  return results;
}

module.exports = { generateExcelBuffer , fetchAllAgentSummaries};
