const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Claims Management System API",
      version: "1.1.0",
      description:
        "Policyholder, Policy, and Claim management API for the Lumiq Numiqers Application Epic. " +
        "Story 3 adds JWT-based security in front of the Story 2 (MongoDB-backed) API. " +
        "Story 4 adds self-service registration alongside the seeded admin login. " +
        "All endpoints under /api are protected except /api/auth/login, /api/auth/register, and /health.",
    },
    servers: [
      { url: "http://localhost:8080", description: "Via Nginx API Gateway (recommended)" },
      { url: "http://localhost:5000", description: "Direct to Node/Express (bypasses gateway)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Auth", description: "Login and JWT issuance" },
      { name: "Policyholders", description: "CRUD for policyholders" },
      { name: "Policies", description: "CRUD for insurance policies" },
      { name: "Claims", description: "CRUD for claims filed against policies" },
    ],
  },
  // Where swagger-jsdoc looks for @openapi annotations.
  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJsdoc(options);
