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