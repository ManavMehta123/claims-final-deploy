const router = require("express").Router();
const controller = require("../controllers/predictionController");
const validate = require("../validators/validate");
const requireAuth = require("../middleware/auth");
const { claimPredictionSchema } = require("../validators/schemas");

// NOTE: For development and debugging we temporarily allow unauthenticated
// access to the prediction endpoints so you can exercise the ML/LLM
// services without needing a valid JWT. Re-enable `router.use(requireAuth)`
// before deploying to production.
// router.use(requireAuth);

/**
 * @openapi
 * components:
 *   schemas:
 *     ClaimPredictionInput:
 *       type: object
 *       required: [Insurance_company, Cost_of_vehicle, Min_coverage, Max_coverage, Expiry_date]
 *       properties:
 *         Insurance_company: { type: string, example: "B" }
 *         Cost_of_vehicle: { type: number, example: 46500 }
 *         Min_coverage: { type: number, example: 1150 }
 *         Max_coverage: { type: number, example: 11800 }
 *         Expiry_date: { type: string, format: date, example: "2027-03-15" }
 *     ClaimPredictionOutput:
 *       type: object
 *       properties:
 *         Condition: { type: integer, description: "1 if a claim is predicted, 0 otherwise" }
 *         claim_probability: { type: number }
 *         Amount: { type: number, description: "Predicted claim amount" }
 *
 * /api/predict-claim:
 *   post:
 *     summary: Predict whether a claim will occur and its likely amount
 *     tags: [Prediction]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClaimPredictionInput' }
 *     responses:
 *       200:
 *         description: Prediction result
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClaimPredictionOutput' }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 *       503: { description: ML service unavailable }
 */
router.post("/", validate(claimPredictionSchema), controller.predict);

/**
 * @openapi
 * /api/predict-claim/llm:
 *   post:
 *     summary: Predict claim outcome using Gemini LLM and image/context evidence
 *     tags: [Prediction]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClaimPredictionInput' }
 *     responses:
 *       200:
 *         description: LLM prediction result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 decision: { type: string, example: "Approved" }
 *                 claim_probability: { type: number, example: 0.86 }
 *                 amount: { type: number, example: 6200 }
 *                 reason: { type: string, example: "Image evidence supports the claim and the requested amount is typical for this vehicle type." }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 *       503: { description: Gemini not configured or unavailable }
 */
router.post("/llm", validate(claimPredictionSchema), controller.predictLLM);

module.exports = router;
