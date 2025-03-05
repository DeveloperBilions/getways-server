/**
 * @swagger
 * /caseInsensitiveLogin:
 *   post:
 *     summary: Logs in a user using case-insensitive email or phone number.
 *     description: Authenticates a user using their email or phone number (case-insensitive) and password.
 *     tags: [Authentication]
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
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *                 description: The email or phone number of the user.
 *               password:
 *                 type: string
 *                 example: "SecurePass123!"
 *                 description: The user's password.
 *     responses:
 *       200:
 *         description: User successfully logged in.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     sessionToken:
 *                       type: string
 *                       example: "r:4ce807d5a5b9f0cf87fe9b4b6ede588b"
 *                     user:
 *                       type: object
 *                       properties:
 *                         username:
 *                           type: string
 *                           example: "alpha"
 *                         name:
 *                           type: string
 *                           example: "Alpha"
 *                         phoneNumber:
 *                           type: string
 *                           example: "+912589632147"
 *                         email:
 *                           type: string
 *                           example: "alpha@gmail.com"
 *                         balance:
 *                           type: number
 *                           example: 0
 *                         userParentId:
 *                           type: string
 *                           example: "AeRyp8O33I"
 *                         userParentName:
 *                           type: string
 *                           example: "Shiv"
 *                         roleName:
 *                           type: string
 *                           example: "Player"
 *                         redeemService:
 *                           type: number
 *                           example: 0
 *                         userType:
 *                           type: number
 *                           example: 1
 *                         fromAgentExcel:
 *                           type: boolean
 *                           example: false
 *                         isDeleted:
 *                           type: boolean
 *                           example: false
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-02-26T05:26:39.304Z"
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-02-26T05:26:39.304Z"
 *                         sessionToken:
 *                           type: string
 *                           example: "r:4ce807d5a5b9f0cf87fe9b4b6ede588b"
 *                         objectId:
 *                           type: string
 *                           example: "rEnHpghFQo"
 *                         className:
 *                           type: string
 *                           example: "_User"
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
 *                   example: "Login failed: User does not exist!"
 *       401:
 *         description: Unauthorized. Incorrect login credentials.
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
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: "Login failed: Invalid credentials."
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
