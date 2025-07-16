const XLSX = require("xlsx");
const fs = require("fs");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");
const { getParentUserId, updatePotBalance } = require("./utility/utlis");
const { validateCreateUser, validateUpdateUser } = require("./validators/user.validator");
const { validatePositiveNumber } = require("./validators/number.validator");
const stripe = new Stripe(process.env.REACT_APP_STRIPE_KEY_PRIVATE);
const chatbotDescription = require("./utility/chatbotDesc");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


Parse.Cloud.define("createUser", async (request) => {
  const {
    username,
    name,
    email,
    balance,
    phoneNumber,
    password,
    userParentId,
    userParentName,
    roleName,
    userReferralCode,
    redeemService,
  } = request.params;

  if (!username || !email || !password || !userParentId || !userParentName) {
    throw new Parse.Error(
      400,
      "Missing required fields: username, email, password, userParentId, userParentName"
    );
  }

  try {
    if (!userReferralCode) {
      const validatorData = {
        username,
        name,
        email,
        phoneNumber,
        password,
      };
      const validatorResponse = validateCreateUser(validatorData);
      if (!validatorResponse.isValid) {
        throw new Parse.Error(400, validatorResponse.errors);
      }
    }
    const existingUsername = await new Parse.Query(Parse.User)
      .equalTo("username", username)
      .first({ useMasterKey: true });

    if (existingUsername) {
      throw new Parse.Error(400, "Username is already taken.");
    }
    const existingEmail = await new Parse.Query(Parse.User)
      .equalTo("email", email)
      .first({ useMasterKey: true });

    if (existingEmail) {
      throw new Parse.Error(400, "Email is already registered.");
    }

    if (phoneNumber) {
      const existingPhone = await new Parse.Query(Parse.User)
        .equalTo("phoneNumber", phoneNumber)
        .first({ useMasterKey: true });

      if (existingPhone) {
        throw new Parse.Error(400, "Phone number is already in use.");
      }
    }

    // Query the Role class to find the desired role
    const query = new Parse.Query(Parse.Role);
    query.equalTo("name", roleName);
    const role = await query.first({ useMasterKey: true });

    if (!role) {
      throw new Parse.Error(404, "Role not found");
    }
    
    // Create a new Parse User
    const user = new Parse.User();
    user.set("username", username);
    user.set("name", name);
    user.set("phoneNumber", phoneNumber);
    user.set("email", email);
    user.set("balance", 0);
    user.set("password", password);
    user.set("userParentId", userParentId);
    user.set("userParentName", userParentName);
    user.set("roleName", roleName);
    if(roleName === "Agent"){
      user.set("tier", "S");
    }
    user.set("userReferralCode", userReferralCode);
    if (redeemService) {
      user.set("redeemService", redeemService);
    } else {
      user.set("redeemService", 0);
    }
    // Save the user
    await user.signUp(null, { useMasterKey: true });

    // Add the user to the role
    const relation = role.relation("users");
    relation.add(user);
    await role.save(null, { useMasterKey: true });
    if (roleName === "Agent") {
      const RechargeMethod = Parse.Object.extend("RechargeMethod");
      const rechargeMethods = await new Parse.Query(RechargeMethod)
        .find({ useMasterKey: true });
    
      for (const method of rechargeMethods) {
        const methodName = method.get("name").toLowerCase();
        const settingsKey = `allowedAgentsFor_${methodName}`;
    
        const settingsQuery = new Parse.Query("Settings");
        settingsQuery.equalTo("type", settingsKey);
        let settingsObj = await settingsQuery.first({ useMasterKey: true });
    
        if (!settingsObj) {
          const Settings = Parse.Object.extend("Settings");
          settingsObj = new Settings();
          settingsObj.set("type", settingsKey);
          settingsObj.set("settings", []);
        }
    
        const currentAgents = settingsObj.get("settings") || [];
        if (!currentAgents.includes(user.id)) {
          currentAgents.push(user.id);
          settingsObj.set("settings", currentAgents);
          await settingsObj.save(null, { useMasterKey: true });
        }
      }
    }    

    return { code:200,success: true, message: "User created successfully!" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("updateUser", async (request) => {
  const { userId, username, name, email, balance, password } = request.params;

  try {
    const validatorData = {
      username,
      name,
      email,
      password,
    };
  
    const validatorResponse = validateUpdateUser(validatorData);
    if (!validatorResponse.isValid) {
      throw new Parse.Error(400, validatorResponse.errors);
    }
    // Find the user by ID
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", userId);
    const user = await userQuery.first({ useMasterKey: true });

    if (!user) {
      throw new Parse.Error(404, `User with ID ${userId} not found`);
    }

    // Update the user fields
    user.set("username", username);
    user.set("name", name);
    user.set("email", email);
    if (password) {
      user.set("password", password);
    }
    // user.set("balance", parseFloat(balance));

    // Save the user
    await user.save(null, { useMasterKey: true });

    return { success: true, message: "User updated successfully" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("deleteUser", async (request) => {
  const { userId } = request.params;

  if (!userId) {
    throw new Error("User ID is required to delete the user.");
  }

  try {
    // Query the user
    const query = new Parse.Query(Parse.User);
    query.equalTo("objectId", userId);
    const user = await query.first({ useMasterKey: true });

    if (!user) {
      throw new Error("User not found.");
    }
    const roleName = user.get("roleName");

    // Soft delete the user by setting isDeleted or deletedAt
    user.set("isDeleted", true);
    await user.save(null, { useMasterKey: true });

    // Force logout by deleting all sessions for this user
    const sessionQuery = new Parse.Query("_Session");
    sessionQuery.equalTo("user", user);
    const sessions = await sessionQuery.find({ useMasterKey: true });

    if (sessions.length > 0) {
      await Parse.Object.destroyAll(sessions, { useMasterKey: true });
    }
    // Delete the user
    // await user.destroy({ useMasterKey: true });


    if (roleName === "Master-Agent") {
      // 1. Find Agents under this Master Agent
      const agentQuery = new Parse.Query(Parse.User);
      agentQuery.equalTo("userParentId", user.id);
      agentQuery.equalTo("roleName", "Agent");
      agentQuery.notEqualTo("isDeleted", true);
      const agents = await agentQuery.findAll({ useMasterKey: true });
    
      // 2. Find Players under all these Agents
      const agentIds = agents.map((a) => a.id);
    
      let players = [];
      if (agentIds.length > 0) {
        const playerQuery = new Parse.Query(Parse.User);
        playerQuery.containedIn("userParentId", agentIds);
        playerQuery.equalTo("roleName", "Player");
        playerQuery.notEqualTo("isDeleted", true);
        players = await playerQuery.findAll({ useMasterKey: true });
      }
    
      // 3. Collect all users to mark as deleted
      const usersToSoftDelete = [...agents, ...players];
    
      // 4. Mark all as deleted
      for (const u of usersToSoftDelete) {
        u.set("isDeleted", true);
      }
    
      // 5. Save all in a single request
      if (usersToSoftDelete.length > 0) {
        await Parse.Object.saveAll(usersToSoftDelete, { useMasterKey: true });
      }
    
      // 6. Collect all sessions
      if (usersToSoftDelete.length > 0) {
        const sessionQuery = new Parse.Query("_Session");
        sessionQuery.containedIn("user", usersToSoftDelete);
        const sessions = await sessionQuery.find({ useMasterKey: true });
        if (sessions.length > 0) {
          await Parse.Object.destroyAll(sessions, { useMasterKey: true });
        }
      }
    }
    
    // If Agent: delete their Players
    if (roleName === "Agent") {
      const playerQuery = new Parse.Query(Parse.User);
      playerQuery.equalTo("userParentId", user.id);
      playerQuery.equalTo("roleName", "Player");
      playerQuery.notEqualTo("isDeleted", true);
      const players = await playerQuery.findAll({ useMasterKey: true });
    
      // Batch soft-delete
      for (const p of players) {
        p.set("isDeleted", true);
      }
      if (players.length > 0) {
        await Parse.Object.saveAll(players, { useMasterKey: true });
    
        // Batch destroy sessions
        const sessionQuery = new Parse.Query("_Session");
        sessionQuery.containedIn("user", players);
        const sessions = await sessionQuery.find({ useMasterKey: true });
        if (sessions.length > 0) {
          await Parse.Object.destroyAll(sessions, { useMasterKey: true });
        }
      }
    }
    
    // Fetch remaining users
    const remainingUsersQuery = new Parse.Query(Parse.User);
    const remainingUsers = await remainingUsersQuery.find({
      useMasterKey: true,
    });

    return {
      success: true,
      message: `User with ID ${userId} has been deleted.`,
      data: remainingUsers.map((user) => ({
        id: user.id,
        username: user.get("username"),
        email: user.get("email"),
        name: user.get("name"),
        balance: user.get("balance"),
      })),
    };
  } catch (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }
});

Parse.Cloud.define("getUserById", async (request) => {
  const { userId } = request.params;

  if (!userId) {
    throw new Parse.Error(400, "Missing required parameter: userId");
  }

  try {
    const query = new Parse.Query(Parse.User);
    query.select("username", "email", "name", "balance");
    query.equalTo("objectId", userId);

    const user = await query.first({ useMasterKey: true });

    if (!user) {
      throw new Parse.Error(404, `User with ID ${userId} not found`);
    }

    // Return user data
    return {
      id: user.id,
      username: user.get("username"),
      email: user.get("email"),
      name: user.get("name"),
      balance: user.get("balance"),
    };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("fetchAllUsers", async (request) => {
  try {
    const userQuery = new Parse.Query(Parse.User);
    userQuery.select(
      "username",
      "name",
      "email",
      "lastLoginIp",
      "balance",
      "createdAt",
      "roleName",
      "redeemService"
    );
    userQuery.equalTo("userReferralCode", null);
    const allUsers = await userQuery.find({ useMasterKey: true });
    return allUsers.map((user) => {
      return {
        id: user.id,
        username: user.get("username"),
        name: user.get("name"),
        email: user.get("email"),
        lastLoginIp: user.get("lastLoginIp"),
        balance: user.get("balance"),
        createdAt: user.get("createdAt"),
        roleName: user.get("roleName"),
        redeemService: user.get("redeemService"),
      };
    });
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("userTransaction", async (request) => {
  const axios = require("axios");

  const { id, type, username, balance, transactionAmount, remark } =
    request.params;

  try {
    // Find the user by ID
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", id);
    const user = await userQuery.first({ useMasterKey: true });

    if (!user) {
      throw new Parse.Error(404, `User with ID ${id} not found`);
    }

    let finalAmount;

    if (type === "redeem") {
      // Amount deduct form user balance
      finalAmount = balance - parseFloat(transactionAmount);
    }
    if (type === "recharge") {
      // Amount credit form user balance
      finalAmount = balance + parseFloat(transactionAmount);
    }

    // set the user field
    // user.set("balance", finalAmount);

    // set the transaction field
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const transactionDetails = new TransactionDetails();

    transactionDetails.set("type", type);
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", username);
    transactionDetails.set("userId", id);
    transactionDetails.set("transactionDate", new Date());
    // transactionDetails.set("beforeTransaction", balance);
    // transactionDetails.set("afterTransaction", finalAmount);
    transactionDetails.set("transactionAmount", parseFloat(transactionAmount));
    transactionDetails.set("remark", remark);

    // Save the transaction
    await transactionDetails.save(null, { useMasterKey: true });
    const transactionId = transactionDetails.id;

    console.log("@@@ transaction id @@@", transactionId);

    // Axios call to an external API
    const externalApiUrl =
      "https://aogglobal.org/AOGCRPT/controllers/api/DepositTransaction.php";
    const apiRequestBody = {
      playerId: id,
      orderId: transactionId,
      amt: parseFloat(transactionAmount),
    };

    try {
      const axiosResponse = await axios.post(externalApiUrl, apiRequestBody, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (axiosResponse.data.success) {
        // Server responded with an success
        console.log("*** Axios Success ***", axiosResponse.data);
        console.log("*** set 1 ***");

        // Update status to 1 on Axios success
        transactionDetails.set("status", 1);
        transactionDetails.set("referralLink", axiosResponse.data.redirect_url);
        transactionDetails.set(
          "transactionId",
          axiosResponse.data.transaction_id
        );
        await transactionDetails.save(null, { useMasterKey: true });

        return {
          success: true,
          message: "Transaction updated and validated successfully",
          apiResponse: axiosResponse.data,
        };
      }
    } catch (axiosError) {
      // Server responded with an error
      console.error("### Axios Error ###", axiosError.response.data);
      console.error("### set 0 ###");

      // Update status to 0 on Axios fail
      transactionDetails.set("status", 0);
      await transactionDetails.save(null, { useMasterKey: true });

      return {
        success: false,
        message: axiosError.response.data.message,
      };
    }

    return { success: true, message: "Transaction updated successfully" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("checkTransactionStatus", async (request) => {
  const axios = require("axios");

  try {
    const query = new Parse.Query("TransactionRecords");

    // Step: 1 Filter by status=1
    query.equalTo("status", 1);
    // Get the current time and subtract 10 minutes
    const now = new Date();
    //const tenMinutesAgo = new Date(now.getTime() - 70 * 60 * 1000);

    // Add a condition to fetch records updated within the last 10 minutes
    //query.greaterThan('updatedAt', tenMinutesAgo);

    // Sort the results in ascending order of updatedAt
    query.descending("updatedAt");
    const results = await query.find();

    if (results != null && results.length > 0) {
      console.log("Total Pending records " + results.length);
    }

    // Step 2: Map results to JSON for readability
    const data = results.map((record) => record.toJSON());

    // Step 3: Iterate over the mapped data
    for (const record of data) {
      // Step 4: Prepare the request body for the API
      const params = {
        playerId: record.userId,
        orderId: record.objectId,
        transactionId: record.transactionId,
      };

      // Step 5: Call the external API
      try {
        const response = await axios.get(
          "https://aogglobal.org/AOGCRPT/controllers/api/GetTransaction.php",
          { params }
        );
        console.log(
          `API response for playerId ${record.userId}:`,
          response.data
        );

        // Step 6: Update the record's status if API call succeeds
        if (response.data && response.data.success) {
          // Adjust this according to your API's response
          // Find the corresponding record from Parse
          const recordObject = results.find(
            (rec) => rec.id === record.objectId
          );

          if (recordObject) {
            if (response.data.transaction.status === "completed") {
              // Step 7: Update the Transaction status to 2
              recordObject.set("status", 2);
              await recordObject.save();

              // Step 8: Find the corresponding User record
              const userQuery = new Parse.Query("User");
              userQuery.equalTo("objectId", record.userId);
              const user = await userQuery.first({ useMasterKey: true });

              if (user) {
                // Step 9: Update the user's balance
                const currentBalance = user.get("balance");
                const updatedBalance =
                  currentBalance + record.transactionAmount;

                // const newBalance = user.get("balance") + record.transactionAmount;
                user.set("balance", updatedBalance);

                // Save the updated user record
                await user.save(null, { useMasterKey: true });
                console.log(
                  `User balance updated successfully for playerId: ${record.userId}`
                );
              }
            }
          }
        } else {
          console.error(
            `API call failed for playerId ${record.playerId}:`,
            response.data
          );
        }
      } catch (error) {
        console.error(
          `Error updating transaction for playerId ${record.userId}:`,
          error.message
        );
        return {
          success: false,
          message: error.message,
        };
      }
    }
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("redeemRedords", async (request) => {
  const {
    id,
    type,
    username,
    balance,
    transactionAmount,
    remark,
    percentageAmount,
    redeemServiceFee,
  } = request.params;

  
  try {
    const validatorResponse = validatePositiveNumber(transactionAmount);
    if (!validatorResponse.isValid) {
      throw new Parse.Error(400, validatorResponse.errors);
    }
    if (!username || !id) {
      return {
        status: "error",
        message: "User Information are not correct",
      };
    }
    if (isNaN(Number(transactionAmount)) || Number(transactionAmount) <= 0) {
      return {
        status: "error",
        message: "Amount should be a positive number greater than 0",
      };
    }    
    // Step 1: Fetch the user's wallet
    const Wallet = Parse.Object.extend("Wallet");
    const walletQuery = new Parse.Query(Wallet);
    walletQuery.equalTo("userID", id);

    const wallet = await walletQuery.first();

    if (!wallet) {
      throw new Error(`Wallet not found for user: ${username}`);
    }

    const currentBalance = wallet.get("balance");
    const updatedBalance = Math.floor(
      parseFloat(currentBalance) + parseFloat(percentageAmount)
    );

    wallet.set("balance", updatedBalance);
    await wallet.save(null);

    const parentUserId = await getParentUserId(id);

    if (parentUserId) {
      await updatePotBalance(parentUserId, transactionAmount,"redeem");
    }
    // Step 4: Save the transaction record
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const transactionDetails = new TransactionDetails();

    transactionDetails.set("type", type);
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", username);
    transactionDetails.set("userId", id);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("transactionAmount", parseFloat(transactionAmount));
    transactionDetails.set("remark", remark);
    transactionDetails.set("status", 8);
    transactionDetails.set("redeemServiceFee", parseFloat(redeemServiceFee));
    transactionDetails.set("percentageAmount", parseFloat(percentageAmount));
    transactionDetails.set("percentageFees", parseFloat(redeemServiceFee));
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", id);
    const user = await userQuery.first({ useMasterKey: true });
    transactionDetails.set("userParentId", user.get("userParentId")); // Store whether wallet was used

    await transactionDetails.save(null);

    // Step 5: Return success response
    return {
      status: "success",
      message: "Redeem successful",
      data: {
        transactionId: transactionDetails.id,
        updatedBalance,
      },
    };
  } catch (error) {
    // Handle different error types
    if (error.response) {
      return {
        status: "error",
        code: error.response.status,
        message: error.response.data.message,
      };
    }
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: error.message || "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("playerRedeemRedords", async (request) => {
  const {
    id,
    type,
    username,
    transactionAmount,
    redeemServiceFee,
    remark,
    paymentMode,
    paymentMethodType,
    isCashOut,
    walletId,
  } = request.params;

  try {
    const validatorResponse = validatePositiveNumber(transactionAmount);
    if (!validatorResponse.isValid) {
      throw new Parse.Error(400, validatorResponse.errors);
    }

    if (!username || !id) {
      return {
        status: "error",
        message: "User Information are not correct",
      };
    }
     if (isNaN(Number(transactionAmount)) || Number(transactionAmount) <= 0) {
      return {
        status: "error",
        message: "Amount should be a positive number greater than 0",
      };
    }
    // Check if the user has exceeded the redeem request limit for the day
    if (!isCashOut) {
      const TransactionDetails = Parse.Object.extend("TransactionRecords");
      const query = new Parse.Query(TransactionDetails);

      // Filter for today’s date and the user
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0); // Start of the day
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999); // End of the day

      query.equalTo("userId", id);
      query.greaterThanOrEqualTo("transactionDate", startOfDay);
      query.lessThanOrEqualTo("transactionDate", endOfDay);
      query.equalTo("type", "redeem"); // Only consider redeem transactions
      query.notEqualTo("isCashOut", true); // Exclude cashout transactions

      const redeemCount = await query.count();

      // Check if the limit is exceeded
      if (redeemCount >= 10) {
        return {
          status: "error",
          message:
            "You have exceeded the maximum of 10 redeem requests for today.",
        };
      }
    }
    // set the transaction field
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const transactionDetails = new TransactionDetails();

    transactionDetails.set("type", type);
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", username);
    transactionDetails.set("userId", id);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("transactionAmount", parseFloat(transactionAmount));
    transactionDetails.set("remark", remark);
    if (isCashOut) {
      transactionDetails.set("status", 11); // Cashout Request status
      transactionDetails.set("isCashOut", true);
    } else {
      transactionDetails.set("status", 6);
    }
    transactionDetails.set("redeemServiceFee", parseFloat(redeemServiceFee));
    transactionDetails.set("paymentMode", paymentMode);
    transactionDetails.set("paymentMethodType", paymentMethodType);
    transactionDetails.set("walletId", walletId);


    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", id);
    const user = await userQuery.first({ useMasterKey: true });
    transactionDetails.set("userParentId", user.get("userParentId")); // Store whether wallet was used

    if (isCashOut) {
      const Wallet = Parse.Object.extend("Wallet");
      const walletQuery = new Parse.Query(Wallet);
      walletQuery.equalTo("objectId", walletId);
      const wallet = await walletQuery.first();
      console.log(wallet, "wallet  ");
      if (wallet) {
        const currentBalance = wallet.get("balance") || 0;
        if(currentBalance < transactionAmount){
          return {
            status: "error",
            message: "Insufficient balance in wallet",
          };
        }
        wallet.set("balance", Math.floor(currentBalance - transactionAmount));
        await wallet.save(null);
      } else {
        throw new Error(`Wallet not found for user: ${username}`);
      }
      await sendEmailNotification(username, transactionAmount);
    }

    // Save the transaction
    await transactionDetails.save(null, { useMasterKey: true });

    // You can process the response here and return a response if needed
    return {
      status: "success",
      message: "Redeem successful",
    };
  } catch (error) {
    console.log(error, "error");
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("agentRejectRedeemRedords", async (request) => {
  const { orderId } = request.params;
  try {
    // Create a query to find the Transaction record by transactionId
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("objectId", orderId);

    // Fetch the record
    const transaction = await query.first();

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Set the status to "Coins Credited" (status: 3)
    transaction.set("status", 7);

    // Save the updated record
    await transaction.save();

    return { success: true, message: "Status updated to Reject Redeem" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("agentApproveRedeemRedords", async (request) => {
  const {
    id,
    userId,
    orderId,
    percentageAmount,
    transactionAmount,
    redeemFees,
    redeemServiceFee,
    redeemRemarks,
  } = request.params;

  try {
    // Create a query to find the Transaction record by transactionId
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("objectId", orderId);
    let transaction = await query.first({ useMasterKey: true });

    transaction.set("status", 8);
    transaction.set("percentageAmount", parseFloat(percentageAmount));
    transaction.set("percentageFees", parseFloat(redeemFees));
    if (redeemServiceFee) {
      transaction.set("redeemServiceFee", parseFloat(redeemServiceFee));
    }
    if (redeemRemarks) {
      transaction.set("redeemRemarks", redeemRemarks);
    }

    const parentUserId = await getParentUserId(userId);

    if (parentUserId) {
      const result = await updatePotBalance(parentUserId, transactionAmount, "redeem");
    
      if (!result.success) {
        console.error("Pot balance update failed:", result.message);
        return {
          status: "error",
          message: result.message,
        };
      }
    }
    const Wallet = Parse.Object.extend("Wallet");
    const walletQuery = new Parse.Query(Wallet);
    walletQuery.equalTo("userID", userId);
    const wallet = await walletQuery.first();

    if (wallet) {
      const currentBalance = wallet.get("balance") || 0;
      const netAmount = Math.floor(
        parseFloat(currentBalance) + parseFloat(percentageAmount)
      );
      wallet.set("balance", netAmount);
      await wallet.save(null);
      console.log(
        `Wallet updated for userId ${userId} with balance ${
          currentBalance + percentageAmount
        }`
      );
    } else {
      console.log(`Wallet not found for userId ${userId}.`);
    }
    // Save the transaction
    await transaction.save(null, { useMasterKey: true });
    return {
      status: "success",
      message: "Redeem Request Under Review",
      data: transaction,
    };
  } catch (error) {
    console.log(error, "error from");
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("coinsCredit", async (request) => {
  const { id } = request.params;

  if (!id) {
    throw new Error("Transaction ID is required.");
  }

  try {
    // Step 1: Fetch the transaction record
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("objectId", id);
    query.include("userId"); // Include the user relation

    const transaction = await query.first({ useMasterKey: true });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Set the status to "Coins Credited" (status: 3)
    transaction.set("status", 3);

    // Save the updated record
    await transaction.save();

    return { success: true, message: "Status updated to Coins Credited" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});


Parse.Cloud.define("caseInsensitiveLogin", async (request) => {
  const { email, password } = request.params;

  if (!email) {
    throw new Error("Email/Phone and password are required.");
  }

  // Create individual queries for email and phone
  const emailQuery = new Parse.Query(Parse.User);
  emailQuery.matches("email", `^${email}$`, "i");

  const phoneQuery = new Parse.Query(Parse.User);
  phoneQuery.matches("phoneNumber", `^${email}$`, "i");

  // Combine email and phone queries using Parse.Query.or
  const combinedQuery = Parse.Query.or(emailQuery, phoneQuery);

  try {
    // Find the user
    const user = await combinedQuery.first({ useMasterKey: true });

    if (!user) {
      throw new Error("User does not exist!");
    }
    // Perform the login using the found username
    const loggedInUser = await Parse.User.logIn(user.get("username"), password);

    // Fetch the session token for the logged-in user
    const sessionToken = loggedInUser.getSessionToken();

    // Return the user object and session token to the client
    return {
      sessionToken,
      user: loggedInUser,
    };
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
});

Parse.Cloud.define("checkpresence", async (request) => {
  const { emailPhone } = request.params;
  try {
    // Create individual queries for email and phone
    const emailQuery = new Parse.Query(Parse.User);
    emailQuery.matches("email", `^${emailPhone}$`, "i");

    const phoneQuery = new Parse.Query(Parse.User);
    phoneQuery.matches("phoneNumber", `^${emailPhone}$`, "i");

    // Combine email and phone queries using Parse.Query.or
    const combinedQuery = Parse.Query.or(emailQuery, phoneQuery);

    // Find the user
    const user = await combinedQuery.first({ useMasterKey: true });

    if (!user) {
      throw new Error("User does not exist!");
    }
    if (user.get("isDeleted", true)) {
      throw new Error("This user account has been deleted.");
    }
    // Return the user details (you can adjust this as needed)
    return {
      fromAgentExcel: user.get("fromAgentExcel"),
      username: user.get("username"),
      name: user.get("name"),
    };
  } catch (error) {
    throw new Error(error.message);
  }
});

Parse.Cloud.define("excelUserUpdate", async (request) => {
  const { emailPhone, email, username, name, password } = request.params;
  try {
    // Create individual queries for email and phone
    const emailQuery = new Parse.Query(Parse.User);
    emailQuery.matches("email", `^${emailPhone}$`, "i");

    const phoneQuery = new Parse.Query(Parse.User);
    phoneQuery.matches("phoneNumber", `^${emailPhone}$`, "i");

    // Combine email and phone queries using Parse.Query.or
    const combinedQuery = Parse.Query.or(emailQuery, phoneQuery);

    // Find the user
    const user = await combinedQuery.first({ useMasterKey: true });

    if (!user) {
      throw new Error("User does not exist!");
    }

    // Check if the new email is already taken by another user
    if (email) {
      const uniqueEmailQuery = new Parse.Query(Parse.User);
      uniqueEmailQuery.equalTo("email", email);
      // Exclude the current user
      uniqueEmailQuery.notEqualTo("objectId", user.id);

      const existingUserWithEmail = await uniqueEmailQuery.first({
        useMasterKey: true,
      });
      if (existingUserWithEmail) {
        throw new Error("Email already exist!");
      }
    }

    // Check if the new username is already taken by another user
    if (username) {
      const uniqueUsernameQuery = new Parse.Query(Parse.User);
      uniqueUsernameQuery.equalTo("username", username);
      // Exclude the current user
      uniqueUsernameQuery.notEqualTo("objectId", user.id);

      const existingUserWithUsername = await uniqueUsernameQuery.first({
        useMasterKey: true,
      });
      if (existingUserWithUsername) {
        throw new Error("Username already exist!");
      }
    }

    // Update the user fields
    user.set("email", email);
    user.set("username", username);
    user.set("name", name);
    user.set("fromAgentExcel", false);
    user.set("userReferralCode", "");
    user.setPassword(password);

    // Save the user
    await user.save(null, { useMasterKey: true });

    return {
      success: true,
      message: "User updated successfully",
      data: user.get("email"),
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
});

Parse.Cloud.define("getUsersByRole", async (request) => {
  const { roleName: roleNames, currentusr } = request.params;

  if (!Array.isArray(roleNames) || roleNames.length === 0) {
    throw new Parse.Error(400, "Role names array is required and must not be empty");
  }

  try {
    const usersMap = new Map();

    const userQuery = new Parse.Query(Parse.User);
    userQuery.containedIn("roleName", roleNames);
    if (currentusr) {
      userQuery.equalTo("userParentId", currentusr);
    }

    const users = await userQuery.findAll({ useMasterKey: true });

    users.forEach((user) => {
      const userId = user.id;
      if (!usersMap.has(userId)) {
        usersMap.set(userId, {
          id: userId,
          name: user.get("name"),
          role: user.get("roleName"),
        });
      } else {
        usersMap.get(userId).roles.push(user.get("roleName"));
      }
    });

    return Array.from(usersMap.values());
  } catch (error) {
    return {
      status: "error",
      code: error.code || 500,
      message: error.message || "An unexpected error occurred.",
    };
  }
});



Parse.Cloud.define("referralUserCheck", async (request) => {
  const { userReferralCode } = request.params;
  try {
    if (!userReferralCode) {
      throw new Parse.Error(400, "Referral code is required");
    }

    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("userReferralCode", userReferralCode);
    const user = await userQuery.first({ useMasterKey: true });

    if (user) {
      return {
        status: "success",
        message: "Referral code found",
      };
    } else {
      return {
        status: "error",
        code: 404,
        message: "Referral code not found",
      };
    }
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("referralUserUpdate", async (request) => {
  const { userReferralCode, username, name, phoneNumber, email, password } =
    request.params;

    
    try {
    const validatorData = {
      username,
      name,
      phoneNumber,
      email,
      password,
    };
  
    const validatorResponse = validateCreateUser(validatorData);
    if (!validatorResponse.isValid) {
      throw new Parse.Error(400, validatorResponse.errors);
    }
    // Check if userReferralCode is provided
    if (!userReferralCode) {
      console.log("in referral code");

      throw new Parse.Error(400, "Missing parameter: userReferralCode");
    }

    // Query the User class for the matching referral code
    const query = new Parse.Query(Parse.User);
    query.equalTo("userReferralCode", userReferralCode);

    // Execute the query
    const user = await query.first({ useMasterKey: true });

    if (!user) {
      return {
        status: "error",
        code: 404,
        message: "Referral code Expired",
      };
    }

    // Check if the new email is already taken by another user
    if (email) {
      const uniqueEmailQuery = new Parse.Query(Parse.User);
      uniqueEmailQuery.equalTo("email", email);
      // Exclude the current user
      uniqueEmailQuery.notEqualTo("objectId", user.id);

      const existingUserWithEmail = await uniqueEmailQuery.first({
        useMasterKey: true,
      });
      if (existingUserWithEmail) {
        throw new Error("Email already exist!");
      }
    }

    // Check if the new username is already taken by another user
    if (username) {
      const uniqueUsernameQuery = new Parse.Query(Parse.User);
      uniqueUsernameQuery.equalTo("username", username);
      // Exclude the current user
      uniqueUsernameQuery.notEqualTo("objectId", user.id);

      const existingUserWithUsername = await uniqueUsernameQuery.first({
        useMasterKey: true,
      });
      if (existingUserWithUsername) {
        throw new Error("Username already exist!");
      }
    }

    // Check if the new phone number is already taken by another user
    if (phoneNumber) {
      const uniquePhoneQuery = new Parse.Query(Parse.User);
      uniquePhoneQuery.equalTo("phoneNumber", phoneNumber);
      uniquePhoneQuery.notEqualTo("objectId", user.id); // Exclude the current user

      const existingUserWithPhone = await uniquePhoneQuery.first({
        useMasterKey: true,
      });
      if (existingUserWithPhone) {
        throw new Error("Phone number already exist!");
      }
    }
    // Update the user fields
    user.set("username", username);
    user.set("name", name);
    user.set("phoneNumber", phoneNumber);
    user.set("email", email);
    user.setPassword(password);
    user.set("userReferralCode", "");

    // Save the updated user
    await user.save(null, { useMasterKey: true });

    return {
      status: "success",
      message: "User Created successfully.",
      data: user,
    };
  } catch (error) {
    throw new Error(`${error.message}`);
  }
});

Parse.Cloud.define("redeemServiceFee", async (request) => {
  const {
    userId,
    redeemService,
    redeemServiceEnabled,
    redeemServiceZeroAllowed,
    changeAllAgentOnly,
  } = request.params;

  if (!userId) {
    throw new Parse.Error(400, "Missing required parameter: userId");
  }

  try {
    // Step 1: Find the user by ID
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", userId);
    const user = await userQuery.first({ useMasterKey: true });
    const isMasterAgent = user.get("roleName") === "Master-Agent"; // Check if roleName is "Master-Agent"

    // Step 3: Update user or child users based on role check and `redeemServiceZeroAllowed`
    if (isMasterAgent) {
      // Find users whose `userParentId` is the current user's objectId
      const childUserQuery = new Parse.Query(Parse.User);
      childUserQuery.equalTo("userParentId", user.id);
      childUserQuery.equalTo("roleName", "Agent");
      const childUsers = await childUserQuery.find({ useMasterKey: true });

      // Update child users' data
      for (const childUser of childUsers) {
        childUser.set("redeemService", redeemService);
        childUser.set("redeemServiceEnabled", redeemServiceEnabled);
        childUser.set("isReedeemZeroAllowed", redeemServiceZeroAllowed);
        await childUser.save(null, { useMasterKey: true });
      }
      user.set("redeemService", redeemService);
      user.set("redeemServiceEnabled", redeemServiceEnabled);
      user.set("isReedeemZeroAllowed", redeemServiceZeroAllowed);
    } else {
      user.set("redeemService", redeemService);
      user.set("redeemServiceEnabled", redeemServiceEnabled);
      user.set("isReedeemZeroAllowed", redeemServiceZeroAllowed);
    }
    await user.save(null, { useMasterKey: true });

    return { success: true, message: "User Redeem Fees Updated successfully" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("redeemServiceFeeAgentAll", async (request) => {
  const { userId, redeemService } = request.params;

  if (!userId) {
    throw new Parse.Error(400, "Missing required parameter: userId");
  }

  try {
    // Step 1: Find the user by ID
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", userId);
    const user = await userQuery.first({ useMasterKey: true });
    const isMasterAgent = user.get("roleName") === "Master-Agent"; // Check if roleName is "Master-Agent"

    // Step 3: Update user or child users based on role check and `redeemServiceZeroAllowed`
    if (isMasterAgent) {
      // Find users whose `userParentId` is the current user's objectId
      const childUserQuery = new Parse.Query(Parse.User);
      childUserQuery.equalTo("userParentId", user.id);
      childUserQuery.equalTo("roleName", "Agent");
      const childUsers = await childUserQuery.find({ useMasterKey: true });

      // Update child users' data
      for (const childUser of childUsers) {
        childUser.set("redeemService", redeemService);
        await childUser.save(null, { useMasterKey: true });
      }
    }

    return { success: true, message: "User Redeem Fees Updated successfully" };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});
Parse.Cloud.define("redeemParentServiceFee", async (request) => {
  const { userId } = request.params;
  if (!userId) {
    throw new Parse.Error(400, "Missing required parameter: userId");
  }

  try {
    const query = new Parse.Query(Parse.User);
    query.select("redeemService");
    query.select("redeemServiceEnabled");
    query.select("rechargeLimit");
    query.select("isReedeemZeroAllowed");
    query.select("potBalance");
    query.select("rechargeDisabled")
    query.equalTo("objectId", userId);

    const user = await query.first({ useMasterKey: true });

    if (!user) {
      throw new Parse.Error(404, `User with ID ${userId} not found`);
    }
    // Return user data
    return {
      id: user.id,
      redeemService: user.get("redeemService"),
      redeemServiceEnabled: user.get("redeemServiceEnabled"),
      rechargeLimit: user.get("rechargeLimit"),
      isReedeemZeroAllowed: user.get("isReedeemZeroAllowed"),
      potBalance:user.get("potBalance"),
      rechargeDisabled:user.get("rechargeDisabled") || false
    };
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("summaryFilter", async (request) => {
  const { userId, startDate, endDate } = request.params;

  try {
    if (startDate && endDate) {
      const validatorResponse = validateDates(startDate, endDate);
      if (!validatorResponse.isValid) {
        throw new Parse.Error(400, validatorResponse.errors);
      }
    }
    const roleQuery = new Parse.Query(Parse.User);
    roleQuery.select("roleName");
    roleQuery.equalTo("objectId", userId);

    const role = await roleQuery.first({ useMasterKey: true });
    const roleName = role.get("roleName");

    const query = new Parse.Query(Parse.User);
    query.equalTo("userReferralCode", "");

    if (roleName === "Super-User") {
      // Total Users and Agents Count
      const userCount = await query.count({ useMasterKey: true });
      query.equalTo("roleName", "Agent");
      const agentCount = await query.count({ useMasterKey: true });

      // Parse date strings into Date objects (if provided)
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // Total Recharge Amount (status: 2 or status: 3)
      const rechargeQuery = new Parse.Query("TransactionRecords");
      rechargeQuery.containedIn("status", [2, 3]);
      if (start) rechargeQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) rechargeQuery.lessThanOrEqualTo("createdAt", end);
      const rechargeTransactions = await rechargeQuery.find();
      const totalRechargeAmount = rechargeTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Redeem Amount (status: 4)
      const redeemQuery = new Parse.Query("TransactionRecords");
      redeemQuery.equalTo("status", 4);
      if (start) redeemQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) redeemQuery.lessThanOrEqualTo("createdAt", end);
      const redeemTransactions = await redeemQuery.find();
      const totalRedeemAmount = redeemTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Pending Recharge Amount (status: 1)
      const pendingRechargeQuery = new Parse.Query("TransactionRecords");
      pendingRechargeQuery.equalTo("status", 1);
      if (start) pendingRechargeQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) pendingRechargeQuery.lessThanOrEqualTo("createdAt", end);
      const pendingRechargeTransactions = await pendingRechargeQuery.find();
      const totalPendingRechargeAmount = pendingRechargeTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Failed Redeem Amount (status: 5)
      const failedRedeemQuery = new Parse.Query("TransactionRecords");
      failedRedeemQuery.equalTo("status", 5);
      if (start) failedRedeemQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) failedRedeemQuery.lessThanOrEqualTo("createdAt", end);
      const failedRedeemTransactions = await failedRedeemQuery.find();
      const totalFailRedeemAmount = failedRedeemTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      return {
        status: "success",
        data: {
          totalUsersCount: userCount,
          totalAgentCount: agentCount,
          totalRechargeAmount: totalRechargeAmount,
          totalRedeemAmount: totalRedeemAmount,
          totalPendingRechargeAmount: totalPendingRechargeAmount,
          totalFailRedeemAmount: totalFailRedeemAmount,
        },
      };
    } else if (roleName === "Agent") {
      // Total Users and Agents Count
      query.equalTo("userParentId", userId);
      const userCount = await query.count({ useMasterKey: true });
      const users = await query.find({ useMasterKey: true });
      const userIds = users.map((user) => user?.id);

      // Parse date strings into Date objects (if provided)
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // Total Recharge Amount (status: 2 or status: 3)
      const rechargeQuery = new Parse.Query("TransactionRecords");
      rechargeQuery.containedIn("userId", userIds);
      rechargeQuery.containedIn("status", [2, 3]);
      if (start) rechargeQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) rechargeQuery.lessThanOrEqualTo("createdAt", end);
      const rechargeTransactions = await rechargeQuery.find();
      const totalRechargeAmount = rechargeTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Redeem Amount (status: 4)
      const redeemQuery = new Parse.Query("TransactionRecords");
      redeemQuery.containedIn("userId", userIds);
      redeemQuery.equalTo("status", 4);
      if (start) redeemQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) redeemQuery.lessThanOrEqualTo("createdAt", end);
      const redeemTransactions = await redeemQuery.find();
      const totalRedeemAmount = redeemTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Pending Recharge Amount (status: 1)
      const pendingRechargeQuery = new Parse.Query("TransactionRecords");
      pendingRechargeQuery.containedIn("userId", userIds);
      pendingRechargeQuery.equalTo("status", 1);
      if (start) pendingRechargeQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) pendingRechargeQuery.lessThanOrEqualTo("createdAt", end);
      const pendingRechargeTransactions = await pendingRechargeQuery.find();
      const totalPendingRechargeAmount = pendingRechargeTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Failed Redeem Amount (status: 5)
      const failedRedeemQuery = new Parse.Query("TransactionRecords");
      failedRedeemQuery.containedIn("userId", userIds);
      failedRedeemQuery.equalTo("status", 5);
      if (start) failedRedeemQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) failedRedeemQuery.lessThanOrEqualTo("createdAt", end);
      const failedRedeemTransactions = await failedRedeemQuery.find();
      const totalFailRedeemAmount = failedRedeemTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      return {
        status: "success",
        data: {
          totalUsersCount: userCount,
          totalAgentCount: 1,
          totalRechargeAmount: totalRechargeAmount,
          totalRedeemAmount: totalRedeemAmount,
          totalPendingRechargeAmount: totalPendingRechargeAmount,
          totalFailRedeemAmount: totalFailRedeemAmount,
        },
      };
    } else if (roleName === "Player") {
      // Parse date strings into Date objects (if provided)
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // Total Recharge Amount (status: 2 or status: 3)
      const rechargeQuery = new Parse.Query("TransactionRecords");
      rechargeQuery.equalTo("userId", userId);
      rechargeQuery.containedIn("status", [2, 3]);
      if (start) rechargeQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) rechargeQuery.lessThanOrEqualTo("createdAt", end);
      const rechargeTransactions = await rechargeQuery.find();
      const totalRechargeAmount = rechargeTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Redeem Amount (status: 4)
      const redeemQuery = new Parse.Query("TransactionRecords");
      redeemQuery.equalTo("userId", userId);
      redeemQuery.equalTo("status", 4);
      if (start) redeemQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) redeemQuery.lessThanOrEqualTo("createdAt", end);
      const redeemTransactions = await redeemQuery.find();
      const totalRedeemAmount = redeemTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Pending Recharge Amount (status: 1)
      const pendingRechargeQuery = new Parse.Query("TransactionRecords");
      pendingRechargeQuery.equalTo("userId", userId);
      pendingRechargeQuery.equalTo("status", 1);
      if (start) pendingRechargeQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) pendingRechargeQuery.lessThanOrEqualTo("createdAt", end);
      const pendingRechargeTransactions = await pendingRechargeQuery.find();
      const totalPendingRechargeAmount = pendingRechargeTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );

      // Total Failed Redeem Amount (status: 5)
      const failedRedeemQuery = new Parse.Query("TransactionRecords");
      failedRedeemQuery.equalTo("userId", userId);
      failedRedeemQuery.equalTo("status", 5);
      if (start) failedRedeemQuery.greaterThanOrEqualTo("createdAt", start);
      if (end) failedRedeemQuery.lessThanOrEqualTo("createdAt", end);
      const failedRedeemTransactions = await failedRedeemQuery.find();
      const totalFailRedeemAmount = failedRedeemTransactions.reduce(
        (sum, transaction) => sum + (transaction.get("transactionAmount") || 0),
        0
      );
      return {
        status: "success",
        data: {
          totalUsersCount: 1,
          totalAgentCount: 0,
          totalRechargeAmount: totalRechargeAmount,
          totalRedeemAmount: totalRedeemAmount,
          totalPendingRechargeAmount: totalPendingRechargeAmount,
          totalFailRedeemAmount: totalFailRedeemAmount,
        },
      };
    }
  } catch (error) {}
});

Parse.Cloud.define("readExcelFile", async (request) => {
  const XLSX = require("xlsx");
  const fs = require("fs");

  const BATCH_SIZE = 100; // Number of records per batch
  const RETRY_LIMIT = 3; // Number of retry attempts in case of failure
  const RETRY_DELAY = 2000; // Delay between retries in milliseconds

  try {
    // Define the path to your local .xlsx file
    const filePath = "./downloads/userdata.xlsx";

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist");
    }

    function generateRandomString(length) {
      const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let result = "";
      for (let i = 0; i < length; i++) {
        result += characters.charAt(
          Math.floor(Math.random() * characters.length)
        );
      }
      return result;
    }

    const rawData = {
      userParentId: "bBc5XtgDQF",
      userParentName: "Dhyan",
      fromAgentExcel: true,
      password: "123456",
      roleName: "Player",
    };

    // Function to clean the phone number and remove non-numeric characters
    function cleanPhoneNumber(phoneNumber) {
      return String(phoneNumber).replace(/[^\d]/g, ""); // Remove all non-digit characters
    }

    // Read the file
    const workbook = XLSX.readFile(filePath);

    // Get the first sheet name
    const sheetName = workbook.SheetNames[0];

    // Get the data from the first sheet
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Convert phone numbers to the cleaned format and filter for 10 digits
    const validPhoneNumbers = sheetData
      .map((item) => ({
        phoneNumber: cleanPhoneNumber(item.phoneNumber),
      })) // Clean phone numbers
      .filter((item) => item.phoneNumber.length === 10); // Only keep 10-digit numbers

    // Merge rawData with valid data
    const mergedData = validPhoneNumbers.map((item) => ({
      ...item,
      ...rawData,
      phoneNumber: String(item.phoneNumber),
      username: generateRandomString(6),
      userReferralCode: generateRandomString(6),
    }));

    // Query the database for existing phone numbers
    const existingPhoneNumbersQuery = new Parse.Query(Parse.User);
    existingPhoneNumbersQuery.exists("phoneNumber");
    existingPhoneNumbersQuery.limit(10000);
    const existingUsers = await existingPhoneNumbersQuery.find({
      useMasterKey: true,
    });

    // Extract the phone numbers from the existing users
    const existingPhoneNumbers = existingUsers.map((user) =>
      user.get("phoneNumber")
    );

    // Filter out records with duplicate phone numbers
    const filteredData = mergedData.filter(
      (item) => !existingPhoneNumbers.includes(item.phoneNumber)
    );

    // Create Parse Objects for each merged entry
    const parseObjects = filteredData.map((data) => {
      const user = new Parse.User();

      // Set the fields on the Parse object
      user.set("userParentId", data.userParentId);
      user.set("userParentName", data.userParentName);
      user.set("fromAgentExcel", data.fromAgentExcel);
      user.setPassword("password", data.password);
      user.set("phoneNumber", data.phoneNumber);
      user.set("username", data.username);
      user.set("roleName", data.roleName);
      user.set("userReferralCode", data.userReferralCode);

      return user;
    });

    // Function to perform batch insertion with retry logic
    async function saveInBatches(objects, batchSize, retryLimit) {
      let startIndex = 0;
      const totalObjects = objects.length;

      while (startIndex < totalObjects) {
        const batch = objects.slice(startIndex, startIndex + batchSize);
        let attempt = 0;
        let success = false;

        while (attempt < retryLimit && !success) {
          try {
            // Save all users in the batch
            const savedUsers = await Parse.Object.saveAll(batch);

            // After saving users, get the role and add the users to the role
            const roleQuery = new Parse.Query(Parse.Role);
            roleQuery.equalTo("name", "Player");
            const role = await roleQuery.first({ useMasterKey: true });

            if (!role) {
              throw new Error("Role not found");
            }

            // Create a relation between the users and the role
            const relation = role.relation("users");
            savedUsers.forEach((user) => {
              relation.add(user);
            });

            // Save the updated role with the relation to the users
            await role.save(null, { useMasterKey: true });

            console.log(
              `Batch from ${startIndex + 1} to ${
                startIndex + batch.length
              } inserted successfully and users added to the 'agent' role.`
            );
            success = true;
          } catch (error) {
            console.error(
              `Error inserting batch from ${startIndex + 1} to ${
                startIndex + batch.length
              }: ${error.message}`
            );
            attempt++;

            if (attempt < retryLimit) {
              // If retrying, wait before the next attempt
              console.log(`Retrying batch in ${RETRY_DELAY / 1000} seconds...`);
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
            } else {
              throw new Error(
                `Failed to insert batch after ${retryLimit} attempts.`
              );
            }
          }
        }

        startIndex += batchSize;
      }
    }

    // Save the data in batches
    await saveInBatches(parseObjects, BATCH_SIZE, RETRY_LIMIT);

    // Return success
    return {
      success: true,
      message: `${parseObjects.length} records inserted successfully`,
    };
  } catch (error) {
    throw new Parse.Error(500, `Error reading Excel file: ${error.message}`);
  }
});

Parse.Cloud.define("exportAndEmailPreviousDayTransactions", async (request) => {
  try {
    // Step 1: Define the start and end date for the previous day
    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1
    );
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Step 2: Query the TransactionRecords for transactions of type "recharge" within the previous day
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("type", "recharge"); // Only transactions of type "recharge"
    query.greaterThanOrEqualTo("transactionDate", startDate);
    query.lessThan("transactionDate", endDate);
    query.exists("transactionIdFromStripe"); // Only include records with transactionIdFromStripe defined

    const transactions = await query.find({ useMasterKey: true });

    if (transactions.length === 0) {
      return {
        status: "success",
        message: "No transactions found for the previous day.",
      };
    }

    // Step 3: Fetch Stripe checkout session data for each transaction
    const stripeData = [];
    for (const transaction of transactions) {
      const transactionIdFromStripe = transaction.get(
        "transactionIdFromStripe"
      ); // Adjust field if needed
      try {
        const checkoutSession = await stripe.checkout.sessions.retrieve(
          transactionIdFromStripe
        );
        stripeData.push({
          stripeStatus: checkoutSession.status,
          stripeAmount: checkoutSession.amount_total / 100, // Convert to standard currency format
          stripeCurrency: checkoutSession.currency,
          stripePaymentMethod: checkoutSession.payment_method_types.join(", "),
          stripeCreated: new Date(checkoutSession.created * 1000), // Convert timestamp to date
        });
      } catch (error) {
        console.error(
          `Error fetching Stripe data for transaction ID: ${transactionIdFromStripe}`
        );
        stripeData.push({
          stripeStatus: "Error fetching data",
          stripeAmount: null,
          stripeCurrency: null,
          stripePaymentMethod: null,
          stripeCreated: null,
        });
      }
    }

    // Step 4: Prepare data for Excel export
    const exportData = transactions.map((transaction, index) => {
      const transactionDate = transaction.get("transactionDate");
      return {
        TransactionID: transaction.id,
        UserID: transaction.get("userId"),
        Username: transaction.get("username"),
        transactionIdFromStripe: transaction.get("transactionIdFromStripe"),
        Amount: transaction.get("transactionAmount"),
        Remark: transaction.get("remark"),
        Status: transaction.get("status"),
        TransactionDate: transactionDate
          ? transactionDate.toISOString()
          : "N/A", // ISO format includes date and time
        StripeStatus: stripeData[index].stripeStatus,
      };
    });

    // Step 5: Create an Excel workbook and sheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Append the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");

    // Step 6: Write the workbook to a file
    const filePath = `./Previous_Day_Transactions_${
      startDate.toISOString().split("T")[0]
    }.xlsx`;
    XLSX.writeFile(workbook, filePath);

    // Step 7: Send the Excel file via email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL, // Replace with your Gmail address
        pass: process.env.PASSWORD, // Replace with your Gmail app password
      },
    });

    const mailOptions = {
      from: process.env.EMAIL, // Replace with your Gmail address
      to: ["viraj@bilions.co", "malhar@bilions.co", "niket@bilions.co"], // Replace with recipient emails
      subject: "Previous Day's Transactions Report",
      text: "Please find attached the report for the previous day's transactions.",
      attachments: [
        {
          filename: `Previous_Day_Transactions_${
            startDate.toISOString().split("T")[0]
          }.xlsx`,
          path: filePath,
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    // Step 8: Return success response
    return {
      status: "success",
      message: "Previous day's transactions exported and emailed successfully.",
    };
  } catch (error) {
    console.error("Error exporting and emailing transactions:", error.message);
    throw new Parse.Error(
      500,
      `Error exporting and emailing transactions: ${error.message}`
    );
  }
});

Parse.Cloud.define("cleanupReferralLink", async (request) => {
  try {
    const query = new Parse.Query(Parse.User);
    // Add a constraint to fetch users with a referral value
    query.exists("userReferralCode");

    // Calculate the timestamp for 24 hours ago
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    query.greaterThanOrEqualTo("createdAt", last24Hours);

    query.descending("createdAt");

    const user = await query.find({ useMasterKey: true });

    if (!user) {
      throw new Error("User not found.");
    }

    // Iterate through users and delete each one
    for (const users of user) {
      console.log("Deleting User:", users.get("username"));
      await users.destroy({ useMasterKey: true });
    }

    console.log("Users deleted successfully.");
    return { message: `${user.length} users deleted.` };
  } catch (error) {}
});

Parse.Cloud.beforeSave("Test", () => {
  throw new Parse.Error(9001, "Saving test objects is not available.");
});

async function sendEmailNotification(username, transactionAmount) {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL, // Replace with your Gmail address
        pass: process.env.PASSWORD, // Replace with your Gmail app password
      },
    });

    // Enhanced HTML content
    const htmlContent = `
     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
       <div style="background-color: #4CAF50; color: white; padding: 16px; text-align: center;">
         <h2 style="margin: 0;">Cashout Request Notification</h2>
       </div>
       <div style="padding: 16px;">
         <p style="font-size: 16px;">Dear Team,</p>
         <p style="font-size: 16px;">A new <strong>cashout request</strong> has been initiated. Below are the details:</p>
         <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
           <tr>
             <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">User:</td>
             <td style="padding: 8px; border: 1px solid #ddd;">${username}</td>
           </tr>
           <tr>
             <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Amount:</td>
             <td style="padding: 8px; border: 1px solid #ddd;">$${transactionAmount}</td>
           </tr>
         </table>
         <p style="margin-top: 16px; font-size: 16px;">Please review and take necessary action.</p>
       </div>
       <div style="background-color: #f1f1f1; padding: 16px; text-align: center;">
         <p style="font-size: 14px; color: #555;">This is an automated notification. Please do not reply.</p>
       </div>
     </div>
   `;
    // Email options
    const mailOptions = {
      from: process.env.EMAIL, // Replace with your Gmail address
      to: ["viraj@bilions.co", "malhar@bilions.co", "niket@bilions.co"], // Replace with recipient emails
      subject: "Cashout Request Notification",
      html: htmlContent, // Use HTML content
    };

    // Send email
    await transporter.sendMail(mailOptions);
    console.log("Emails sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

const crypto = require('crypto');
const axios = require('axios');

const generateSignature = (method, path, body = '') => {
  const dataToHash = `${method}${path}${process.env.REACT_APP_Xremit_API_SECRET}${body}`;
  return crypto.createHash('sha256').update(dataToHash).digest('hex');
};

Parse.Cloud.define("fetchGiftCards", async (request) => {
  const searchTerm = request.params.searchTerm || "";
  const currentPage = request.params.currentPage || 1;
  const perPage = request.params.perPage || 50; // Default if not passed

  const method = "GET";
  const path = `/brands/country/USA?currentPage=${currentPage}&perPage=${perPage}&textSearch=${encodeURIComponent(searchTerm)}`;
  const signature = generateSignature(method, path);

  const apiUrl = `${process.env.REACT_APP_Xremit_API_URL}${path}`;
  const headers = {
    "API-Key": process.env.REACT_APP_Xremit_API,
    signature: signature,
  };

  try {
    const response = await axios.get(apiUrl, { headers });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("Response Status:", error.response.status);
      console.error("Response Headers:", error.response.headers);
      console.error("Response Data:", error.response.data);
    } else {
      console.error("Request Error:", error.message);
    }
    throw new Parse.Error(500, "Failed to load gift cards.");
  }
});

Parse.Cloud.define("purchaseGiftCard", async (request) => {
  const {
    orderId,
    price,
    productId,
    productImage,
    productName,
    externalUserId,
    externalUserFirstName,
    externalUserLastName,
    externalUserEmail,
  } = request.params;

  const method = "POST";
  const path = `/purchaseimmediate`;
  const bodyData = JSON.stringify({
    orderId,
    price,
    productId,
    externalUserId,
    externalUserFirstName,
    externalUserLastName,
    externalUserEmail,
  });

  const signature = generateSignature(method, path, bodyData);

  const apiUrl = `${process.env.REACT_APP_Xremit_API_URL}${path}`;
  const headers = {
    "API-Key": process.env.REACT_APP_Xremit_API,
    signature: signature,
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(apiUrl, bodyData, { headers });
  
    if (response.data) {
      const GiftCard = Parse.Object.extend("GiftCardHistory");
      const giftCardEntry = new GiftCard();
  
      giftCardEntry.set("userId", externalUserId);
      giftCardEntry.set("productId", productId.toString());
      giftCardEntry.set("productName", productName.toString());
      giftCardEntry.set("productImage", productImage)
      giftCardEntry.set("price", price);
      giftCardEntry.set("orderId", orderId);
      giftCardEntry.set("apiResponse", response.data); // Store full API response if needed
      giftCardEntry.set("status", response.data.status); // Store full API response if needed

      await giftCardEntry.save(null, { useMasterKey: true });

      const userQuery = new Parse.Query(Parse.User);
      const user = await userQuery.get(externalUserId, { useMasterKey: true });

      // 🧾 Create Transaction Record
      const Transaction = Parse.Object.extend("TransactionRecords");
      const txn = new Transaction();

      txn.set("status", 12);
      txn.set("userId", user.id);
      txn.set("username", user.get("username"));
      txn.set("userParentId", user.get("userParentId") || "");
      txn.set("type", "redeem");
      txn.set("transactionAmount", parseFloat(price));
      txn.set("gameId", "786");
      txn.set("transactionDate", new Date());
      txn.set("transactionIdFromStripe", orderId);
      txn.set("isCashOut", true);
      txn.set("paymentMode", "GiftCard");
      

      await txn.save(null, { useMasterKey: true });

      const Wallet = Parse.Object.extend("Wallet");
      const walletQuery = new Parse.Query(Wallet);
      const wallet = await walletQuery
        .equalTo("userID", externalUserId)
        .first({ useMasterKey: true });

      if (wallet) {
        const currentBalance = wallet.get("balance") || 0; // Get current balance
        const newBalance = currentBalance - price; // Deduct price from balance

        if (newBalance < 0) {
          return { error: "Insufficient balance.", status: "Failed" };
        }

        wallet.set("balance", newBalance); // Update wallet balance
        await wallet.save(null, { useMasterKey: true });
      } else {
        return { error: "Wallet not found.", status: "Failed" };
      }
    }
  
    // Returning response data and status
    return { result: response.data, status: "success" };
  }catch (error) {
    const errorMsg =
      error?.response?.data?.error ||
      error?.message?.data?.error ||
      "Failed Purchasing gift card";

    console.error("Request Error:", errorMsg);

    if (errorMsg === "Not enough balance in the account to request this order") {
      const nodemailer = require("nodemailer");
    
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });
    
      const emailContent = `
        <div style="font-family: Arial, sans-serif; background-color: #ffffff; color: #000000; padding: 20px; border: 1px solid #ddd;">
          <h2 style="color: #000000; border-bottom: 2px solid #000; padding-bottom: 5px;"> Gift Card Purchase Failed</h2>
          <p><strong>User:</strong> ${externalUserFirstName} ${externalUserLastName} <br/>
          <a href="mailto:${externalUserEmail}" style="color: #000000;">${externalUserEmail}</a></p>
          <p><strong>Order ID:</strong> <span style="color: #333;">${orderId}</span></p>
          <p><strong>Amount:</strong> <span style="color: #333;">$${price}</span></p>
          <p><strong>Reason:</strong> <span style="color: red;">Not enough balance in the account to request this order</span></p>
          <hr style="margin: 20px 0; border-top: 1px solid #000000;" />
          <p style="font-size: 14px; color: #666;">
            This is an automated alert from the system. Please take necessary action.
          </p>
        </div>
      `;
    
      const mailOptions = {
        from: process.env.EMAIL,
        to: ["viraj@bilions.co", "malhar@bilions.co", "niket@bilions.co"],
        subject: "Gift Card Purchase Failed – Insufficient Balance",
        html: emailContent,
      };
    
      try {
        await transporter.sendMail(mailOptions);
        console.log("Alert email sent.");
      } catch (emailError) {
        console.error("Failed to send alert email:", emailError);
      }
    
      try {
        const userQuery = new Parse.Query(Parse.User);
        const user = await userQuery.get(externalUserId, { useMasterKey: true });
    
        // 1. Log failed transaction
        const Transaction = Parse.Object.extend("TransactionRecords");
        const txn = new Transaction();
        txn.set("status", 13); // custom code for failure
        txn.set("userId", user.id);
        txn.set("username", user.get("username"));
        txn.set("userParentId", user.get("userParentId") || "");
        txn.set("type", "redeem");
        txn.set("transactionAmount", parseFloat(price));
        txn.set("gameId", "786");
        txn.set("transactionDate", new Date());
        txn.set("transactionIdFromStripe", orderId);
        txn.set("isCashOut", true);
        txn.set("paymentMode", "GiftCard");
        txn.set("remark", "Gift card purchase failed due to insufficient balance");
        await txn.save(null, { useMasterKey: true });
    
        // 2. Log failed gift card request
        const GiftCard = Parse.Object.extend("GiftCardHistory");
        const giftCardEntry = new GiftCard();
        giftCardEntry.set("userId", externalUserId);
        giftCardEntry.set("productId", productId.toString());
        giftCardEntry.set("productImage", productImage);
        giftCardEntry.set("price", price);
        giftCardEntry.set("orderId", orderId);
        giftCardEntry.set("apiResponse", { error: errorMsg });
        giftCardEntry.set("status", "failed");
        await giftCardEntry.save(null, { useMasterKey: true });
      } catch (saveError) {
        console.error("Failed to log failed transaction/giftCard:", saveError);
      }
    }
    

    return { error: errorMsg, status: "Failed" };
  }
  
})

Parse.Cloud.define("purchaseGiftCardExternal", async (request) => {
  const {
    orderId,
    price,
    productId,
    productImage,
    externalUserId,
    externalUserFirstName,
    externalUserLastName,
    externalUserEmail,
  } = request.params;

  const method = "POST";
  const path = `/purchaseimmediate`;
  const bodyData = JSON.stringify({
    orderId,
    price,
    productId,
    externalUserId,
    externalUserFirstName,
    externalUserLastName,
    externalUserEmail,
    platform
  });

  const signature = generateSignature(method, path, bodyData);

  const apiUrl = `${process.env.REACT_APP_Xremit_API_URL}${path}`;
  const headers = {
    "API-Key": process.env.REACT_APP_Xremit_API,
    signature: signature,
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(apiUrl, bodyData, { headers });
  
    if (response.data) {
      const Transaction = Parse.Object.extend("Transactions");
      const txn = new Transaction();

      txn.set("status", 12);
      txn.set("userId", externalUserId);
      txn.set("type", "redeem");
      txn.set("transactionAmount", parseFloat(price));
      txn.set("transactionDate", new Date());
      txn.set("transactionIdFromStripe", orderId);
      txn.set("paymentMode", "GiftCard");
      txn.set("platform", platform)

      await txn.save(null, { useMasterKey: true });

    }
  
    // Returning response data and status
    return { result: response.data, status: "success" };
  } catch (error) {
    // Log the error and return a specific error message for easier debugging
    console.error("Request Error:", error.response.data.error || error.message.data.error);
    return { error: error.response.data.error || error.message.data.error || "Failed Purchasing gift card " , status: "Failed" };

    //throw new Parse.Error(500, `Failed to complete purchase: ${error.response.data.error || error.message.data.error }`);
  }
  
})

Parse.Cloud.define("xRemitGiftCardCallback", async (request) => {
  const callbackData = request.params; // This contains the POST data sent by xRemit

  try {
    const GiftCardHistory = Parse.Object.extend("GiftCardHistory");
    const giftCardEntry = new GiftCardHistory();

    giftCardEntry.set("orderId", callbackData.orderId);
    giftCardEntry.set("userId", callbackData.externalUserId);
    giftCardEntry.set("productId", callbackData.productId);
    giftCardEntry.set("productName", callbackData.productName);
    giftCardEntry.set("price", callbackData.faceValue);
    giftCardEntry.set("apiResponse", callbackData);

    await giftCardEntry.save(null, { useMasterKey: true });

    return { status: "success" };
  } catch (error) {
    console.error("Error saving callback data:", error);
    throw new Parse.Error(500, "Failed to save callback gift card data.");
  }
});
Parse.Cloud.define("sendCheckbookPayment", async (request) => {
  const { amount, email, name, description } = request.params;

  if (!amount || !email || !name || !description) {
    throw new Error("Missing required fields.");
  }

  const user = request.user;
  if (!user) {
    throw new Error("User not authenticated.");
  }

  const number = `${Date.now()}`;

  try {
    const payload = {
      amount: parseFloat(amount),
      deposit_options: ["PRINT"],
      description,
      name,
      number,
      recipient: email,
    };
    console.log("Sending Checkbook payload:", payload);

    // 🔁 Call Checkbook API
    const response = await fetch("https://api.checkbook.io/v3/check/digital", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "a5e3acd961a04d5aaba30475f84f5c20:roRCkg6IkwuVhj2an2LQrzKppn93iw",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Payment API failed.");
    }

    // 🧾 Create Transaction Record
    const Transaction = Parse.Object.extend("TransactionRecords");
    const txn = new Transaction();

    txn.set("status", 12);
    txn.set("userId", user.id);
    txn.set("username", user.get("username"));
    txn.set("userParentId", user.get("userParentId") || "");
    txn.set("type", "redeem");
    txn.set("transactionAmount", parseFloat(amount));
    txn.set("gameId", "786");
    txn.set("transactionDate", new Date());
    txn.set("transactionIdFromStripe", number);
    txn.set("checkbookResponse", data);
    txn.set("recipientName", name);
    txn.set("paymentDescription", description);
    txn.set("isCashOut", true);

    await txn.save(null, { useMasterKey: true });

    // 💰 Update Wallet
    const Wallet = Parse.Object.extend("Wallet");
    const walletQuery = new Parse.Query(Wallet);
    walletQuery.equalTo("userID", user.id);
    const wallet = await walletQuery.first({ useMasterKey: true });

    if (!wallet) {
      throw new Error("Wallet not found.");
    }

    const currentBalance = wallet.get("balance") || 0;
    const newBalance = currentBalance - parseFloat(amount);

    if (newBalance < 0) {
      throw new Error("Insufficient wallet balance.");
    }

    wallet.set("balance", newBalance);
    await wallet.save(null, { useMasterKey: true });

    return {
      success: true,
      message: "Check sent successfully.",
      checkbookResponse: data,
    };
  } catch (error) {
    console.error("Cloud Function Error:", error);
     return {
      success: false,
      message: error.message || "Something went wrong." 
    };
  }
});

Parse.Cloud.define("countRecentLoggedInPlayers", async (request) => {
  try {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    // Step 1: Query recent _Session entries
    const sessionQuery = new Parse.Query("_Session");
    sessionQuery.greaterThanOrEqualTo("updatedAt", twoMonthsAgo);
    sessionQuery.include("user");
    sessionQuery.limit(100000); // increase or paginate as needed

    const sessions = await sessionQuery.find({ useMasterKey: true });

    const userMap = new Map();

    for (const session of sessions) {
      const user = session.get("user");

      if (
        user &&
        user.get("roleName") === "Player" &&
        !user.get("walletAddr")
      ) {
        userMap.set(user.id, user.get("username"));
      }
    }

    // Prepare result
    return {
      count: userMap.size,
      users: Array.from(userMap.values()),
    };

  } catch (error) {
    throw new Error("Error counting recently logged-in players: " + error.message);
  }
});


Parse.Cloud.define("chatbot", async (request) => {
  try {
    const { message, conversationHistory = [],role = "Player" } = request.params;

    // STEP 1: Define your website's information

    const websiteInfo = chatbotDescription(role);

    // STEP 2: Build the complete conversation history
    const systemMessage = {
      role: "system",
      content: `You are a helpful AI assistant for our website. ONLY answer questions related to the website and its services.
      If asked about anything not related to the website, politely redirect the user to ask about the website instead.
      
      Website Information:
      ${websiteInfo}
      
      Maintain a conversational tone and remember details from earlier in the conversation.
      If the user sends a short or partial message, interpret it in the context of the previous messages.`,
    };

    // Format the conversation history for the API
    const formattedHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.text,
    }));

    // Add the current message
    const messages = [
      systemMessage,
      ...formattedHistory,
      { role: "user", content: message },
    ];

    // STEP 3: Check if the conversation (including context) is relevant to the website
    const relevanceCheck = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a filter that determines if a conversation is related to a specific website or is about general knowledge. Consider the entire conversation history and respond with ONLY 'RELEVANT' or 'NOT_RELEVANT'.",
        },
        {
          role: "user",
          content: `Website information: ${websiteInfo}\n\nConversation: ${JSON.stringify(
            messages
          )}\n\nIs this conversation related to the website?`,
        },
      ],
      max_tokens: 10,
      temperature: 0.1,
    });

    const isRelevant =
      relevanceCheck.choices[0].message.content.includes("RELEVANT");

    // STEP 4: If not relevant, return a polite redirection
    if (!isRelevant) {
      const redirectMessage =
        "I'm specialized in answering questions about our website and services only. For this question, I'd recommend using a general search engine. Is there anything specific about our website or services I can help you with?";

      return {
        success: true,
        data: redirectMessage,
      };
    }

    // STEP 5: If relevant, answer the question with conversation context
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 150,
      temperature: 0.7,
    });

    const reply = response.choices[0].message.content;
    return {
      success: true,
      data: reply,
    };
  } catch (error) {
    console.error("Cloud Function Error:", error);
    return {
      success: false,
      message: error.message || "Something went wrong.",
    };
  }
});
