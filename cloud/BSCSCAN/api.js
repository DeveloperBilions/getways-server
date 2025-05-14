const axios = require("axios");
const { getParentUserId, updatePotBalance } = require("../utility/utlis");

const getLatestUSDCTransaction = async (walletAddress) => {
  const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

  const url = `https://api.etherscan.io/api`;
  const params = {
    module: "account",
    action: "tokentx",
    address: walletAddress,
    contractaddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    sort: "desc",
    apikey: ETHERSCAN_API_KEY,
  };

  try {
    const response = await axios.get(url, { params });
    const txs = response.data.result;
    const latestIncomingTx = txs.find(
      (tx) => tx.to.toLowerCase() === walletAddress.toLowerCase()
    );
    if (latestIncomingTx) {
      const valueInUSDC = parseFloat(latestIncomingTx.value) / 1e6;
      const timestamp = new Date(
        parseInt(latestIncomingTx.timeStamp) * 1000
      ).toISOString();

      return {
        confirmed: true,
        amountUSDC: valueInUSDC,
        txHash: latestIncomingTx.hash,
        timestamp,
        txs:latestIncomingTx
      };
    } else {
      return {
        confirmed: false,
        message: "No incoming USDC transaction found",
      };
    }
  } catch (err) {
    console.error("Error fetching from Etherscan:", err.message);
    return { confirmed: false, error: err.message };
  }
};

Parse.Cloud.define("verifyCryptoRecharge", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");

  const txQuery = new Parse.Query(TransactionRecords);
  txQuery.equalTo("status", 1);
  txQuery.equalTo("portal", "Stripe");
  txQuery.limit(100000);
  txQuery.descending("transactionDate"); // Sort by latest first
  const pendingTxs = await txQuery.find({ useMasterKey: true });

  let verifiedCount = 0;
  for (const tx of pendingTxs) {
    const userId = tx.get("userId");
    const txAmount = parseFloat(tx.get("transactionAmount"));
    const txDate = tx.get("transactionDate");

    if (!userId || !txAmount) continue;

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(userId, { useMasterKey: true });
    const walletAddr = user.get("walletAddr");
    if (!walletAddr) continue;

    try {
      const result = await getLatestUSDCTransaction(walletAddr);
      if (result.confirmed) {
        const usdcTimestamp = result.timestamp
          ? new Date(result.timestamp)
          : null;
        const transactionHash = result.txHash;

        const timeDiffInMinutes = usdcTimestamp
          ? Math.abs((txDate.getTime() - usdcTimestamp.getTime()) / 60000)
          : null;

        // Check if this txHash was already recorded
        const existingHashQuery = new Parse.Query(TransactionRecords);
        existingHashQuery.equalTo("transactionHash", transactionHash);
        const alreadyExists = await existingHashQuery.first({
          useMasterKey: true,
        });
        if (alreadyExists) {
          console.log(`Transaction hash already verified: ${transactionHash}`);
          continue;
        }

        // if (
        //   timeDiffInMinutes !== null &&
        //   timeDiffInMinutes >= 10 &&
        //   timeDiffInMinutes <= 15
        // ) {
        tx.set("transactionAmount", result?.amountUSDC);
        tx.set("status", 2);
        tx.set("transactionHash", transactionHash);
        await tx.save(null, { useMasterKey: true });
        const parentUserId = await getParentUserId(userId)
        await updatePotBalance(parentUserId, result?.amountUSDC,"recharge");
        
        verifiedCount++;
        //}
      }else {
        const now = new Date();
        const txAgeInMinutes = (now.getTime() - txDate.getTime()) / 60000;

        if (txAgeInMinutes > 15) {
          tx.set("status", 9); // Expired
          await tx.save(null, { useMasterKey: true });
          continue;
        }
      }
    } catch (err) {
      console.error(`Error verifying tx for user ${userId}:`, err.message);
    }
  }

  return { message: `Verified ${verifiedCount} USDC transactions.` };
});


Parse.Cloud.define("verifyCryptoRechargeForCoinBase", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");

  const txQuery = new Parse.Query(TransactionRecords);
  txQuery.equalTo("status", 1);
  txQuery.equalTo("portal", "Coinbase");
  txQuery.limit(100000);
  txQuery.descending("transactionDate"); // Sort by latest first
  const pendingTxs = await txQuery.find({ useMasterKey: true });

  let verifiedCount = 0;
  for (const tx of pendingTxs) {
    const userId = tx.get("userId");
    const txAmount = parseFloat(tx.get("transactionAmount"));
    const txDate = tx.get("transactionDate");

    if (!userId || !txAmount) continue;

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(userId, { useMasterKey: true });
    const walletAddr = user.get("walletAddr");
    if (!walletAddr) continue;

    try {
      const result = await getLatestUSDCTransactionFromEtherV2(walletAddr);
      if (result.confirmed) {
        const usdcTimestamp = result.timestamp
          ? new Date(result.timestamp)
          : null;
        const transactionHash = result.txHash;

        const timeDiffInMinutes = usdcTimestamp
          ? Math.abs((txDate.getTime() - usdcTimestamp.getTime()) / 60000)
          : null;

        // Check if this txHash was already recorded
        const existingHashQuery = new Parse.Query(TransactionRecords);
        existingHashQuery.equalTo("transactionHash", transactionHash);
        const alreadyExists = await existingHashQuery.first({
          useMasterKey: true,
        });
        if (alreadyExists) {
          console.log(`Transaction hash already verified: ${transactionHash}`);
          continue;
        }

        // if (
        //   timeDiffInMinutes !== null &&
        //   timeDiffInMinutes >= 10 &&
        //   timeDiffInMinutes <= 15
        // ) {
        tx.set("transactionAmount", result?.amountUSDC);
        tx.set("status", 2);
        tx.set("transactionHash", transactionHash);
        await tx.save(null, { useMasterKey: true });
        const parentUserId = await getParentUserId(userId)
        await updatePotBalance(parentUserId, result?.amountUSDC,"recharge");
        
        verifiedCount++;
        //}
      }
      // else {
      //   const now = new Date();
      //   const txAgeInMinutes = (now.getTime() - txDate.getTime()) / 60000;

      //   if (txAgeInMinutes > 15) {
      //     tx.set("status", 9); // Expired
      //     await tx.save(null, { useMasterKey: true });
      //     continue;
      //   }
      // }
    } catch (err) {
      console.error(`Error verifying tx for user ${userId}:`, err.message);
    }
  }

  return { message: `Verified ${verifiedCount} USDC transactions.` };
});

const getLatestUSDCTransactionFromEtherV2 = async (walletAddress) => {

  const url = `https://api.etherscan.io/v2/api`;
  const params = {
    module: "account",
    action: "tokentx",
    address: walletAddress,
    // contractaddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    sort: "desc",
    chainid:8453,
    apikey: process.env.ETHERSCAN_API_KEY,
  };

  try {
    const response = await axios.get(url, { params });
    const txs = response.data.result;
    const latestIncomingTx = txs.find(
      (tx) => tx.to.toLowerCase() === walletAddress.toLowerCase() && tx.tokenSymbol === 'USDC'
    );
    if (latestIncomingTx) {
      const valueInUSDC = parseFloat(latestIncomingTx.value) / 1e6;
      const timestamp = new Date(
        parseInt(latestIncomingTx.timeStamp) * 1000
      ).toISOString();
      return {
        confirmed: true,
        amountUSDC: valueInUSDC,
        txHash: latestIncomingTx.hash,
        timestamp,
        txs:latestIncomingTx
      };
    } else {
      return {
        confirmed: false,
        message: "No incoming USDC transaction found",
      };
    }
  } catch (err) {
    console.error("Error fetching from Etherscan:", err.message);
    return { confirmed: false, error: err.message };
  }
};


// Parse.Cloud.define("getUserUSDCBalances", async (request) => {
//   const limit = request.params.limit || 1000;
//   const skip = request.params.skip || 0;

//   const query = await new Parse.Query(Parse.User)
//   .exists("walletAddr")
//   .limit(10000);

//   const users = await query.find({ useMasterKey: true });
//   const results = [];

//   for (const user of users) {
//     const walletAddr = user.get("walletAddr");
//     const userId = user.id;

//     try {
//       const balance = await getUSDCBalance(walletAddr);
//       results.push({
//         userId,
//         walletAddr,
//         usdcBalance: balance,
//       });
//     } catch (err) {
//       console.error(`Failed to get USDC balance for ${walletAddr}:`, err.message);
//       results.push({
//         userId,
//         walletAddr,
//         error: err.message,
//       });
//     }
//   }

//   return results;
// });

// const getUSDCBalance = async (walletAddress) => {
//   const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Ethereum USDC
//   const url = `https://api.basescan.org/api`;
// const params = {
//   module: "account",
//   action: "balance",
//   address: walletAddress,
//   tag:"latest",
//   apikey: process.env.BASESCAN_API_KEY,
// };

//   try {
//     const response = await axios.get(url, { params });
//     const rawBalance = response.data.result;
//     return parseFloat(rawBalance) / 1e6; // USDC has 6 decimals
//   } catch (err) {
//     throw new Error("Failed to fetch USDC balance");
//   }
// };



Parse.Cloud.define("getUserBaseBalances", async (request) => {
  const limit = request.params.limit || 1000;
  const skip = request.params.skip || 0;

  const query = new Parse.Query(Parse.User);
  query.exists("walletAddr");
  query.limit(limit);
  query.skip(skip);

  const users = await query.find({ useMasterKey: true });

  const addressToUserMap = {};
  const addresses = [];

  for (const user of users) {
    const wallet = user.get("walletAddr");
    if (wallet) {
      const lowerWallet = wallet.toLowerCase();
      addressToUserMap[lowerWallet] = user.id;
      addresses.push(lowerWallet);
    }
  }

  const chunks = chunkArray(addresses, 20); // BaseScan limit = 20 per request
  const results = [];

  for (const batch of chunks) {
    try {
      const response = await axios.get("https://api.basescan.org/api", {
        params: {
          module: "account",
          action: "balancemulti",
          address: batch.join(","),
          tag: "latest",
          apikey: process.env.bscScan_API,
        },
      });

      const balances = response?.data?.result || [];
      console.log(balances,"balances")
      for (const entry of balances) {
        const wallet = entry.account?.toLowerCase();
        const userId = addressToUserMap[wallet];
        const balance = parseFloat(entry.balance) / 1e18;

        results.push({ userId, walletAddr: wallet, baseBalance: balance });
      }
    } catch (err) {
      console.error("Error calling balancemulti:", err.message);
    }
  }

  return results;
});

// Utility to chunk large arrays into batches of 20
function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
