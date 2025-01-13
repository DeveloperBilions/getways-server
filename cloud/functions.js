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
  } = request.params;

  if (!username || !email || !password) {
    throw new Parse.Error(
      400,
      "Missing required fields: username, email, or password"
    );
  }

  try {
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
    user.set("userReferralCode", userReferralCode);
    user.set("redeemService", 0);

    // Save the user
    await user.signUp(null, { useMasterKey: true });

    // Query the Role class to find the desired role
    const query = new Parse.Query(Parse.Role);
    query.equalTo("name", roleName);
    const role = await query.first({ useMasterKey: true });

    if (!role) {
      throw new Parse.Error(404, "Role not found");
    }

    // Add the user to the role
    const relation = role.relation("users");
    relation.add(user);
    await role.save(null, { useMasterKey: true });

    return { success: true, message: "User created successfully!" };
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
  const { userId, username, name, email, balance } = request.params;

  try {
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

    // Soft delete the user by setting isDeleted or deletedAt
    user.set("isDeleted", true);
    await user.save(null, { useMasterKey: true });

    // Delete the user
    // await user.destroy({ useMasterKey: true });

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
    console.log(
      transactionAmount,
      percentageAmount,
      redeemServiceFee,
      "djshjwhej"
    );
    // Step 1: Fetch the user's wallet
    const Wallet = Parse.Object.extend("Wallet");
    const walletQuery = new Parse.Query(Wallet);
    walletQuery.equalTo("userID", id);

    const wallet = await walletQuery.first();

    if (!wallet) {
      throw new Error(`Wallet not found for user ID: ${id}`);
    }

    const currentBalance = wallet.get("balance");
    const updatedBalance = Math.floor(
      parseFloat(currentBalance) + parseFloat(percentageAmount)
    );

    wallet.set("balance", updatedBalance);
    await wallet.save(null);

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
    transactionDetails.set("status", 4);
    transactionDetails.set("redeemServiceFee", parseFloat(redeemServiceFee));
    transactionDetails.set("percentageAmount", parseFloat(percentageAmount));
    transactionDetails.set("percentageFees", parseFloat(redeemServiceFee));

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
    transactionDetails.set("redeemServiceFee", redeemServiceFee);
    transactionDetails.set("paymentMode", paymentMode);
    transactionDetails.set("paymentMethodType", paymentMethodType);
    transactionDetails.set("walletId", walletId);

    if (isCashOut) {
      const Wallet = Parse.Object.extend("Wallet");
      const walletQuery = new Parse.Query(Wallet);
      walletQuery.equalTo("objectId", walletId);
      const wallet = await walletQuery.first();
      console.log(wallet, "wallet  ");
      if (wallet) {
        const currentBalance = wallet.get("balance") || 0;
        wallet.set("balance", currentBalance - transactionAmount);
        await wallet.save(null);
      } else {
        console.log(`Wallet not found for userId ${walletId}.`);
      }
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
      transaction.set("redeemServiceFee", parseFloat(redeemRemarks));
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
  const { transactionIdFromStripe } = request.params;

  try {
    // Create a query to find the Transaction record by transactionId
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("transactionIdFromStripe", transactionIdFromStripe);

    // Fetch the record
    const transaction = await query.first();

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
  const { roleName } = request.params;
  if (!roleName) {
    throw new Parse.Error(400, "Role name is required");
  }

  try {
    // Query the Role class for the role with the specified name
    const roleQuery = new Parse.Query(Parse.Role);
    roleQuery.equalTo("name", roleName);
    const role = await roleQuery.first({ useMasterKey: true });

    if (!role) {
      throw new Parse.Error(404, `Role '${roleName}' not found`);
    }

    // Fetch users related to the role
    const userRelation = role.relation("users");
    const usersQuery = userRelation.query();
    const users = await usersQuery.find({ useMasterKey: true });

    // Format and return the list of users
    return users.map((user) => ({
      id: user.id,
      name: user.get("name"),
      role: roleName,
    }));
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
  const { userId, redeemService } = request.params;

  if (!userId) {
    throw new Parse.Error(400, "Missing required parameter: userId");
  }

  try {
    // Step 1: Find the user by ID
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", userId);
    const user = await userQuery.first({ useMasterKey: true });

    user.set("redeemService", redeemService);
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

Parse.Cloud.define("redeemParentServiceFee", async (request) => {
  const { userId } = request.params;
  if (!userId) {
    throw new Parse.Error(400, "Missing required parameter: userId");
  }

  try {
    const query = new Parse.Query(Parse.User);
    query.select("redeemService");
    query.equalTo("objectId", userId);

    const user = await query.first({ useMasterKey: true });

    if (!user) {
      throw new Parse.Error(404, `User with ID ${userId} not found`);
    }

    // Return user data
    return {
      id: user.id,
      redeemService: user.get("redeemService"),
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

    // Function to check if the phone number is valid (10 digits)
    function isValidPhoneNumber(phoneNumber) {
      const regex = /^\d{10}$/; // Matches exactly 10 digits
      return regex.test(phoneNumber);
    }

    // Read the file
    const workbook = XLSX.readFile(filePath);

    // Get the first sheet name
    const sheetName = workbook.SheetNames[0];

    // Get the data from the first sheet
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Filter the data to include only records with valid 10-digit phone numbers
    const validData = sheetData.filter((item) =>
      isValidPhoneNumber(item.phoneNumber)
    );

    // Merge rawData with valid data
    const mergedData = validData.map((item) => ({
      ...item,
      ...rawData,
      phoneNumber: String(item.phoneNumber),
      username: generateRandomString(6),
    }));

    // Create Parse Objects for each merged entry
    const parseObjects = mergedData.map((data) => {
      const user = new Parse.User();

      // Set the fields on the Parse object
      user.set("userParentId", data.userParentId);
      user.set("userParentName", data.userParentName);
      user.set("fromAgentExcel", data.fromAgentExcel);
      user.setPassword("password", data.password);
      user.set("phoneNumber", data.phoneNumber);
      user.set("username", data.username);
      user.set("roleName", data.roleName);

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
