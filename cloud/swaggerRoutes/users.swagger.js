/**
 * @swagger
 * /createUser:
 *   post:
 *     summary: Creates a new user
 *     description: Registers a new user in Parse Server.
 *     tags: [Users]
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
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 example: "securepassword123"
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *               userParentId:
 *                 type: string
 *                 example: "parent123"
 *               userParentName:
 *                 type: string
 *                 example: "Parent Name"
 *               roleName:
 *                 type: string
 *                 example: "admin"
 *               userReferralCode:
 *                 type: string
 *                 example: "REF12345"
 *               redeemService:
 *                 type: number
 *                 example: 0
 *     responses:
 *       200:
 *         description: User created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User created successfully!"
 *       400:
 *         description: Bad Request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing required fields: username, email, password, userParentId, userParentName"
 *                 code:
 *                   type: number
 *                   example: 400
 *       404:
 *         description: Not found.
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
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "Not found."
 *       403:
 *         description: Forbidden.
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
 * /updateUser:
 *   post:
 *     summary: Updates an existing user
 *     description: Updates user details such as username, name, email, and password.
 *     tags: [Users]
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
 *               userId:
 *                 type: string
 *                 example: "abc123xyz"
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 example: "newsecurepassword"
 *     responses:
 *       200:
 *         description: User updated successfully.
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
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "User updated successfully" 
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
 *                       example: "User with ID not found"                 
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
 * /getUserById:
 *   post:
 *     summary: Retrieves user details by ID
 *     description: Fetches user details including username, email, name, and balance using the user ID.
 *     tags: [Users]
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
 *               userId:
 *                 type: string
 *                 example: "abc123xyz"
 *                 description: The ID of the user to retrieve.
 *     responses:
 *       200:
 *         description: Successfully retrieved user details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "abc123xyz"
 *                     username:
 *                       type: string
 *                       example: "john_doe"
 *                     email:
 *                       type: string
 *                       example: "john.doe@example.com"
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     balance:
 *                       type: number
 *                       example: 10.5
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
 * /deleteUser:
 *   post:
 *     summary: Soft deletes a user and removes all active sessions
 *     description: Marks a user as deleted by setting an "isDeleted" flag and removes all active sessions.
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application Id of the authenticated user.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user to be deleted.
 *     responses:
 *       200:
 *         description: User deleted successfully.
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
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "User with ID EeslfHYo6o has been deleted."
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "KlPLuOTxSs"
 *                           username:
 *                             type: string
 *                             example: "Jack"
 *                           email:
 *                             type: string
 *                             format: email
 *                             example: "jack@jack.com"
 *                           name:
 *                             type: string
 *                             example: "Jack"
 *                           balance:
 *                             type: number
 *                             example: 0
 *       400:
 *         description: missing userId.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                   example: 141
 *                 error:
 *                   type: string
 *                   example: "User ID is required to delete the user."
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
 *                 error:
 *                   type: string
 *                   example: "User not found."
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to delete user: Internal server error."
 */

/**
 * @swagger
 * /fetchAllUsers:
 *   post:
 *     summary: Retrieve all users
 *     description: Fetches a list of all users who do not have a referral code.
 *     tags: [Users]
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
 *         description: Successfully retrieved all users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "abc123xyz"
 *                       username:
 *                         type: string
 *                         example: "john_doe"
 *                       email:
 *                         type: string
 *                         example: "john.doe@example.com"
 *                       name:
 *                         type: string
 *                         example: "John Doe"
 *                       balance:
 *                         type: number
 *                         example: 10.5
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
 * /excelUserUpdate:
 *   post:
 *     summary: Updates user details based on email or phone number.
 *     description: Updates an existing user's email, username, name, and password, ensuring uniqueness for email and username.
 *     tags: [Users]
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
 *               - emailPhone
 *             properties:
 *               emailPhone:
 *                 type: string
 *                 example: "user@example.com"
 *                 description: The email or phone number of the user to be updated.
 *               email:
 *                 type: string
 *                 example: "newemail@example.com"
 *                 description: The new email address (must be unique).
 *               username:
 *                 type: string
 *                 example: "newUsername"
 *                 description: The new username (must be unique).
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *                 description: The updated full name of the user.
 *               password:
 *                 type: string
 *                 example: "newSecurePassword"
 *                 description: The new password for the user.
 *     responses:
 *       200:
 *         description: User updated successfully.
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
 *                   example: "User updated successfully"
 *                 data:
 *                   type: string
 *                   example: "newemail@example.com"
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
 *       400:
 *         description: User not found.
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
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "User does not exist!"
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
 * /getUsersByRole:
 *   post:
 *     summary: Retrieve users by role names.
 *     description: Fetches users associated with one or more specified roles.
 *     tags: [Users]
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
 *               - roleName
 *             properties:
 *               roleName:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Admin", "Player"]
 *                 description: An array of role names to fetch users for.
 *     responses:
 *       200:
 *         description: Successfully retrieved users by role.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "xYz123ABC"
 *                   name:
 *                     type: string
 *                     example: "John Doe"
 *                   role:
 *                     type: string
 *                     example: "Admin"
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
 *                   example: "Role names array is required and must not be empty"
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
 *         description: No roles found matching the provided names.
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
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "No matching roles found"
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
 * /referralUserCheck:
 *   post:
 *     summary: Check if a referral code exists.
 *     description: Verifies if a given user referral code exists in the system.
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application ID for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userReferralCode
 *             properties:
 *               userReferralCode:
 *                 type: string
 *                 example: "REF12345"
 *                 description: The referral code to check.
 *     responses:
 *       200:
 *         description: Referral code found.
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
 *                   example: "Referral code found"
 *       400:
 *         description: Missing referral code in request.
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
 *                   example: "Referral code is required"
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
 *         description: Referral code not found.
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
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "Referral code not found"
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
 * /referralUserUpdate:
 *   post:
 *     summary: Update user details using a referral code.
 *     description: Updates user details like username, name, phone number, email, and password if the referral code is valid.
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application ID for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userReferralCode
 *             properties:
 *               userReferralCode:
 *                 type: string
 *                 example: "REF12345"
 *                 description: The referral code used to update user details.
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *                 description: The new username for the user.
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *                 description: The full name of the user.
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *                 description: The new phone number for the user.
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *                 description: The new email for the user.
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "securePassword123"
 *                 description: The new password for the user.
 *     responses:
 *       200:
 *         description: User updated successfully.
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
 *                   example: "User Created successfully."
 *                 data:
 *                   type: object
 *                   description: The updated user object.
 *       400:
 *         description: Missing referral code or invalid parameters.
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
 *                   example: "Missing parameter: userReferralCode"
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
 *         description: Referral code expired or user not found.
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
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "Referral code Expired"
 *       409:
 *         description: Email, username, or phone number already exists.
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
 *                   example: 409
 *                 message:
 *                   type: string
 *                   example: "Email already exist!"
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
 * /redeemServiceFee:
 *   post:
 *     summary: Update the redeem service fee for a user.
 *     description: Updates the redeem service fee and related settings for a user. If the user is a Master-Agent, the settings will be applied to child agents as well.
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application ID for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "abc123"
 *                 description: The unique ID of the user whose redeem service fee is being updated.
 *               redeemService:
 *                 type: number
 *                 example: 5.0
 *                 description: The redeem service fee to be set.
 *               redeemServiceEnabled:
 *                 type: boolean
 *                 example: true
 *                 description: Whether the redeem service is enabled for the user.
 *               redeemServiceZeroAllowed:
 *                 type: boolean
 *                 example: false
 *                 description: Whether a zero redeem service fee is allowed.
 *     responses:
 *       200:
 *         description: Redeem service fee updated successfully.
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
 *                   example: "User Redeem Fees Updated successfully"
 *       400:
 *         description: Missing required parameters.
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
 *                   example: "Missing required parameter: userId"
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
 * /redeemServiceFeeAgentAll:
 *   post:
 *     summary: Update the redeem service fee for all agents under a Master-Agent.
 *     description: Updates the redeem service fee for all child agents if the user is a Master-Agent.
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application ID for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - redeemService
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "abc123"
 *                 description: The unique ID of the Master-Agent whose child agents' redeem service fees will be updated.
 *               redeemService:
 *                 type: number
 *                 example: 5.0
 *                 description: The redeem service fee to be set for child agents.
 *     responses:
 *       200:
 *         description: Redeem service fee updated successfully for child agents.
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
 *                   example: "User Redeem Fees Updated successfully"
 *       400:
 *         description: Missing required parameters.
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
 *                   example: "Missing required parameter: userId"
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
 * /redeemParentServiceFee:
 *   post:
 *     summary: Retrieve a user's redeem service fee details.
 *     description: Fetches the redeem service fee details for a given user by their ID.
 *     tags: [Users]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Parse-Application-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The Application ID for authentication.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "abc123"
 *                 description: The unique ID of the user whose redeem service details need to be retrieved.
 *     responses:
 *       200:
 *         description: Successfully retrieved the user's redeem service fee details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "abc123"
 *                 redeemService:
 *                   type: number
 *                   example: 5.0
 *                 redeemServiceEnabled:
 *                   type: boolean
 *                   example: true
 *                 rechargeLimit:
 *                   type: number
 *                   example: 1000
 *                 isReedeemZeroAllowed:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: Missing required parameters.
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
 *                   example: "Missing required parameter: userId"
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
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 code:
 *                   type: number
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "User with ID abc123 not found"
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



