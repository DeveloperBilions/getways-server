/**
 * @swagger
 * /userTransaction:
 *   post:
 *     summary: Processes a user transaction (redeem or recharge)
 *     description: Handles transactions where users can redeem or recharge their balance and logs the transaction.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id of the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "abc123xyz"
 *                 description: The ID of the user performing the transaction.
 *               type:
 *                 type: string
 *                 enum: [redeem, recharge]
 *                 example: "redeem"
 *                 description: The type of transaction.
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *               balance:
 *                 type: number
 *                 example: 500.00
 *                 description: The current balance of the user.
 *               transactionAmount:
 *                 type: number
 *                 example: 100.50
 *                 description: The amount to be transacted.
 *               remark:
 *                 type: string
 *                 example: "Redeeming balance for game credits"
 *     responses:
 *       200:
 *         description: Transaction processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Transaction updated and validated successfully"
 *                 apiResponse:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     transaction_id:
 *                       type: number
 *                       example: 3453
 *                     redirect_url:
 *                       type: string
 *                       example: "https://paymentgateway.com/redirect"
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "error"
 *                     code:
 *                       type: number
 *                       example: 404
 *                     message:
 *                       type: string
 *                       example: "User with ID abc123xyz not found"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /checkTransactionStatus:
 *   post:
 *     summary: Checks and updates transaction statuses
 *     description: Fetches pending transactions, calls an external API to verify their status, and updates user balances accordingly.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id of the authenticated user.
 *     responses:
 *       200:
 *         description: Successfully checked and updated transaction statuses.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Transaction status checked and updated successfully."
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       404:
 *         description: No pending transactions found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *                       example: "Request failed with status code 404"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /redeemRedords:
 *   post:
 *     summary: Redeem transaction records and update user balances.
 *     description: Processes a redeem request, updates the user's wallet balance, logs the transaction, and updates parent user balances if applicable.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - username
 *               - transactionAmount
 *               - percentageAmount
 *               - redeemServiceFee
 *             properties:
 *               id:
 *                 type: string
 *                 example: "12345"
 *                 description: User ID of the account initiating the redeem.
 *               type:
 *                 type: string
 *                 example: "redeem"
 *                 description: Type of transaction.
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *                 description: Username of the user.
 *               transactionAmount:
 *                 type: number
 *                 example: 100
 *                 description: Amount to be redeemed.
 *               remark:
 *                 type: string
 *                 example: "Redeem transaction"
 *                 description: Additional remarks for the transaction.
 *               percentageAmount:
 *                 type: number
 *                 example: 5
 *                 description: The percentage-based amount added to balance.
 *               redeemServiceFee:
 *                 type: number
 *                 example: 2
 *                 description: Service fee deducted from the redeem transaction.
 *     responses:
 *       200:
 *         description: Redeem transaction processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     message:
 *                       type: string
 *                       example: "Redeem successful"
 *                     data:
 *                       type: object
 *                       properties:
 *                         transactionId:
 *                           type: string
 *                           example: "tx_987654"
 *                         updatedBalance:
 *                           type: number
 *                           example: 505.50
 *       400:
 *         description: Invalid request parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "error"
 *                     code:
 *                       type: number
 *                       example: 400
 *                     message:
 *                       type: string
 *                       example: "User Information are not correct"
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       404:
 *         description: User wallet not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "error"
 *                     code:
 *                       type: number
 *                       example: 404
 *                     message:
 *                       type: string
 *                       example: "Wallet not found for user."
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /playerRedeemRedords:
 *   post:
 *     summary: Processes a player redeem request.
 *     description: Handles redeem requests, validates daily limits, updates wallet balance, and logs transactions.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - username
 *               - transactionAmount
 *               - redeemServiceFee
 *             properties:
 *               id:
 *                 type: string
 *                 example: "12345"
 *                 description: User ID initiating the redeem.
 *               type:
 *                 type: string
 *                 example: "redeem"
 *                 description: Type of transaction.
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *                 description: Username of the player.
 *               transactionAmount:
 *                 type: number
 *                 example: 100
 *                 description: Amount to be redeemed.
 *               redeemServiceFee:
 *                 type: number
 *                 example: 2
 *                 description: Service fee deducted from the redeem transaction.
 *               remark:
 *                 type: string
 *                 example: "Redeem transaction"
 *                 description: Additional remarks for the transaction.
 *               paymentMode:
 *                 type: string
 *                 example: "Bank Transfer"
 *                 description: Mode of payment.
 *               paymentMethodType:
 *                 type: string
 *                 example: "Wire Transfer"
 *                 description: Type of payment method.
 *               isCashOut:
 *                 type: boolean
 *                 example: false
 *                 description: Indicates if the transaction is a cash-out.
 *               walletId:
 *                 type: string
 *                 example: "wallet_789"
 *                 description: Wallet ID from which the amount will be deducted.
 *     responses:
 *       200:
 *         description: Redeem transaction processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     message:
 *                       type: string
 *                       example: "Redeem successful"
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "error"
 *                     code:
 *                       type: number
 *                       example: 429
 *                     message:
 *                       type: string
 *                       example: "You have exceeded the maximum of 10 redeem requests for today."
 *       400:
 *         description: Invalid request parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "User Information are not correct"
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /agentRejectRedeemRedords:
 *   post:
 *     summary: Rejects a redeem request.
 *     description: Updates the status of a redeem transaction to "Rejected".
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: "txn_12345"
 *                 description: The transaction ID of the redeem request to reject.
 *     responses:
 *       200:
 *         description: Redeem request successfully rejected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Status updated to Reject Redeem"
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /agentApproveRedeemRedords:
 *   post:
 *     summary: Approves a redeem request
 *     description: Updates the transaction status, processes percentage fees, and updates the user's wallet balance.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id of the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - orderId
 *               - percentageAmount
 *               - transactionAmount
 *               - redeemFees
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "67890"
 *               orderId:
 *                 type: string
 *                 example: "abcdef"
 *               percentageAmount:
 *                 type: number
 *                 example: 50.5
 *               transactionAmount:
 *                 type: number
 *                 example: 100
 *               redeemFees:
 *                 type: number
 *                 example: 5
 *               redeemServiceFee:
 *                 type: number
 *                 example: 2
 *               redeemRemarks:
 *                 type: string
 *                 example: "Approved by admin"
 *     responses:
 *       200:
 *         description: Redeem request approved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "success"
 *                     message:
 *                       type: string
 *                       example: "Redeem Request Under Review"
 *                     data:
 *                       type: object
 *                       properties:
 *                         transactionDate:
 *                           type: object
 *                           properties:
 *                             __type:
 *                               type: string
 *                               example: "Date"
 *                             iso:
 *                               type: string
 *                               format: date-time
 *                               example: "2025-03-04T12:20:41.452Z"
 *                         type:
 *                           type: string
 *                           example: "redeem"
 *                         gameId:
 *                           type: string
 *                           example: "786"
 *                         userId:
 *                           type: string
 *                           example: "EeslfHYo6o"
 *                         transactionAmount:
 *                           type: number
 *                           example: 100.5
 *                         remark:
 *                           type: string
 *                           example: "Redeeming balance for game credits"
 *                         redeemServiceFee:
 *                           type: number
 *                           example: 2
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-03-04T12:20:41.452Z"
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-03-05T12:30:10.666Z"
 *                         referralLink:
 *                           type: string
 *                           example: "https://aogcoin.club/Merchant/payaog.php?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
 *                         status:
 *                           type: number
 *                           example: 8
 *                         transactionId:
 *                           type: number
 *                           example: 1227
 *                         percentageAmount:
 *                           type: number
 *                           example: 50.5
 *                         percentageFees:
 *                           type: number
 *                           example: 5
 *                         redeemRemarks:
 *                           type: string
 *                           example: "Approved by admin"
 *                         objectId:
 *                           type: string
 *                           example: "xzs9qRfIN5"
 *                         __type:
 *                           type: string
 *                           example: "Object"
 *                         className:
 *                           type: string
 *                           example: "TransactionRecords"
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /coinsCredit:
 *   post:
 *     summary: Updates transaction status to "Coins Credited"
 *     description: Updates the status of a transaction to indicate that coins have been credited.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id of the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 example: "abc123"
 *     responses:
 *       200:
 *         description: Transaction successfully updated to "Coins Credited".
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Status updated to Coins Credited"
 *       400:
 *         description: Invalid request parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                   example: 141
 *                 message:
 *                   type: string
 *                   example: "Transaction ID is required."
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @swagger
 * /exportAndEmailPreviousDayTransactions:
 *   post:
 *     summary: Export and email previous day's transactions
 *     description: Retrieves recharge transactions from the previous day, fetches Stripe session data, generates an Excel report, and emails it to the specified recipients.
 *     tags: [Transactions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application ID for authentication.
 *     responses:
 *       200:
 *         description: Successfully exported and emailed the transaction report.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Previous day's transactions exported and emailed successfully."
 *       204:
 *         description: No transactions found for the previous day.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "No transactions found for the previous day."
 *       403:
 *         description: Forbidden. The user does not have permission to update this user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "Error exporting and emailing transactions: <error_message>"
 */
