Parse.Cloud.define("createUser", async (request) => {
  const {
    username,
    name,
    email,
    balance,
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
    user.set("email", email);
    user.set("balance", 0);
    user.set("password", password);
    user.set("userParentId", userParentId);
    user.set("userParentName", userParentName);
    user.set("roleName", roleName);
    user.set("userReferralCode", userReferralCode);

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

    // Delete the user
    await user.destroy({ useMasterKey: true });

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

    const results = await query.find();

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
  const axios = require("axios");

  const {
    id,
    type,
    username,
    balance,
    transactionAmount,
    remark,
    percentageAmount,
  } = request.params;

  try {
    let body = JSON.stringify({
      playerId: id,
      amt: parseFloat(percentageAmount),
    });

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://aogglobal.org/AOGCRPT/controllers/api/WithdrawTransaction.php",
      headers: {
        "Content-Type": "application/json",
      },
      data: body,
    };

    // Make the API call using Axios
    const response = await axios.request(config);

    if (response?.data.success) {
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
      transactionDetails.set(
        "transactionAmount",
        parseFloat(transactionAmount)
      );
      transactionDetails.set("remark", remark);
      transactionDetails.set("status", 4);
      // Save the transaction
      await transactionDetails.save(null, { useMasterKey: true });

      // You can process the response here and return a response if needed
      return {
        status: "success",
        message: "Redeem successful",
        data: response.data,
      };
    } else {
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
      transactionDetails.set(
        "transactionAmount",
        parseFloat(transactionAmount)
      );
      transactionDetails.set("remark", remark);
      transactionDetails.set("status", 5);
      transactionDetails.set("responseMessage", response.data.message);
      // Save the transaction
      await transactionDetails.save(null, { useMasterKey: true });

      return {
        status: "error",
        message: response.data.message,
      };
    }
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
        message: "An unexpected error occurred.",
      };
    }
  }
});

Parse.Cloud.define("coinsCredit", async (request) => {
  const { transactionId } = request.params;

  try {
    // Create a query to find the Transaction record by transactionId
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("transactionId", transactionId);

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

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  // Search for the user with a case-insensitive email
  const query = new Parse.Query(Parse.User);
  query.matches("email", `^${email}$`, "i");

  try {
    const user = await query.first({ useMasterKey: true }); // Use master key for secure operations
    if (!user) {
      throw new Error("Invalid email or password.");
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

Parse.Cloud.define("checkUserType", async (request) => {
  const { email } = request.params;
  try {
    const query = new Parse.Query(Parse.User);
    //query.equalTo("email", email);
    // Use a case-insensitive regular expression
    query.matches("email", `^${email}$`, "i");
    const user = await query.first({ useMasterKey: true });

    if (!user) {
      throw new Parse.Error(404, "User not found.");
    }
    // Return the userType
    return { userType: user.get("userType") };
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
  const { userReferralCode, username, name, email, password } = request.params;

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
      console.log("in user fetch");

      return {
        status: "error",
        code: 404,
        message: "Referral code Expired",
      };
    }

    // Update the user fields
    user.set("username", username);
    user.set("name", name);
    user.set("email", email);
    user.setPassword(password);
    user.set("userReferralCode", null);

    // Save the updated user
    await user.save(null, { useMasterKey: true });

    return {
      status: "success",
      message: "User Created successfully.",
      data: user,
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

    // Step 2: Find the user by userParentId
    const usersQuery = new Parse.Query(Parse.User);
    usersQuery.equalTo("userParentId", userId);
    const usersChild = await usersQuery.find({ useMasterKey: true });

    // Step 3: Update redeemService for all users in usersChild array
    for (const childUser of usersChild) {
      childUser.set("redeemService", redeemService);
    }

    // Save all updated users in a batch
    await Parse.Object.saveAll(usersChild, { useMasterKey: true });

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

Parse.Cloud.beforeSave("Test", () => {
  throw new Parse.Error(9001, "Saving test objects is not available.");
});
