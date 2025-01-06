const express = require("express");
const jwt = require("jsonwebtoken");
const { ParseServer } = require("parse-server");
const ParseDashboard = require("parse-dashboard");
const cors = require("cors");
const cron = require("node-cron");
require("dotenv").config();
const app = express();

// Add CORS middleware
app.use(cors());
app.use(express.json());

// Parse Server initialization
async function startParseServer() {
  const parseServer = new ParseServer({
    databaseURI: process.env.DB_URL,
    cloud: "./cloud/main.js",
    serverURL: process.env.SERVER_URL,
    appId: process.env.APP_ID,
    masterKey: process.env.MASTER_KEY,
    encodeParseObjectInCloudFunction: false,
  });

  // Start Parse Server
  await parseServer.start();

  // Mount Parse Server at '/parse' URL prefix
  app.use("/parse", parseServer.app);

  // Configure Parse Dashboard (optional)
  const dashboard = new ParseDashboard({
    apps: [
      {
        serverURL: process.env.SERVER_URL,
        appId: process.env.APP_ID,
        masterKey: process.env.MASTER_KEY,
        appName: process.env.APP_NAME,
      },
    ],
    users: [
      {
        user: "admin",
        pass: "password",
      },
    ],
    // Allow insecure HTTP (for development only)
    allowInsecureHTTP: false,
  });

  // Mount Parse Dashboard at '/dashboard' URL prefix (optional)
  app.use("/dashboard", dashboard);

  // Start the server
  const port = 1337;
  app.listen(port, function () {
    console.log(
      `##### parse-server running on ${process.env.SERVER_URL} #####`
    );
  });

  //auth flow for AOG API
  app.post("/requestToken", (req, res) => {
    const user = { id: req.body.userid };

    const ACCESS_TOKEN_SECRET =
      "e11c6aa82db982f9fa9215e244a43a4f3e436ef4b4576766845976ab526accfed74e21ceb19265f88635c04a0222593eaca3b696ed2be5a38854f1869bfdad8e";

    const accessToken = jwt.sign(user, ACCESS_TOKEN_SECRET);
    res.json({ accessToken: accessToken });
  });

  function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.sendStatus(401);

    const ACCESS_TOKEN_SECRET =
      "e11c6aa82db982f9fa9215e244a43a4f3e436ef4b4576766845976ab526accfed74e21ceb19265f88635c04a0222593eaca3b696ed2be5a38854f1869bfdad8e";

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  }

  app.get("/posts", authenticateToken, (req, res) => {
    const posts = [
      { userid: "Em0FNBjBHc", title: "Post 1" },
      { userid: "Fm0FNBjBHc", title: "Post 2" },
    ];
    res.json(posts);
  });

  async function callReadExcelFile() {
    try {
      console.log("Calling readExcelFile cloud function...");

      // Call the cloud function directly
      const response = await Parse.Cloud.run("readExcelFile");

      console.log("Cloud function response:", response);
    } catch (error) {
      console.error("Error calling cloud function:", error.message);
    }
  }

  // Call the function
  // callReadExcelFile();

  setInterval(async () => {
    try {
      console.log("Running cloud function every 10 minutes...");

      await Parse.Cloud.run("checkTransactionStatusStripe");
    } catch (error) {
      console.error("Error running cloud function:", error);
    }
  }, 30000); // Stop just before the minute ends
}

// Call the async function to start Parse Server
startParseServer().catch((err) =>
  console.error("Error starting Parse Server:", err)
);
