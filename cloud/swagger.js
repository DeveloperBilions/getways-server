const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
      description: "API Documentation for my Parse Server app",
    },
    servers: [
      {
        url: process.env.SWAGGER_URL
      },
    ],
  },
  apis: ["./cloud/swaggerRoutes/*.js", "./cloud/functions.js"], // Add paths to files containing API docs
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("Swagger API documentation is available at /api-docs");
}

module.exports = setupSwagger;
