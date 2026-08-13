const router = require("express").Router();
const controller = require("../controllers/policyController");
const validate = require("../validators/validate");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { policySchema, policyUpdateSchema } = require("../validators/schemas");

// Every policy route requires a valid JWT (see src/middleware/auth.js).
router.use(requireAuth);

// Issuing/editing/cancelling policies is admin-managed; regular users get
// read-only access via the GET routes further down.
const adminOnly = requireRole("admin");

/**
 * @openapi
 * components:
 *   schemas:
 *     Policy:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         policyNumber: { type: string, example: "POL-2026-0001" }
 *         policyholderId: { type: string }
 *         type: { type: string, enum: [Life, Health, Vehicle, Property] }
 *         coverageAmount: { type: number }
 *         premiumAmount: { type: number }
 *         startDate: { type: string, format: date }
 *         endDate: { type: string, format: date }
 *         status: { type: string, enum: [Active, Expired, Cancelled] }
 *     PolicyInput:
 *       type: object
 *       required: [policyNumber, policyholderId, type, coverageAmount, premiumAmount, startDate, endDate]
 *       properties:
 *         policyNumber: { type: string }
 *         policyholderId: { type: string }
 *         type: { type: string, enum: [Life, Health, Vehicle, Property] }
 *         coverageAmount: { type: number }
 *         premiumAmount: { type: number }
 *         startDate: { type: string, format: date }
 *         endDate: { type: string, format: date }
 *         status: { type: string, enum: [Active, Expired, Cancelled] }
 *
 * /api/policies:
 *   get:
 *     summary: List policies (optionally filtered by policyholder)
 *     tags: [Policies]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: policyholderId
 *         schema: { type: string }
 *         required: false
 *     responses:
 *       200: { description: Array of policies }
 *       401: { description: Missing/invalid JWT }
 *   post:
 *     summary: Create a policy
 *     tags: [Policies]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PolicyInput' }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 */
router.post("/", adminOnly, validate(policySchema), controller.create);
router.get("/", controller.findAll);

/**
 * @openapi
 * /api/policies/{id}:
 *   get:
 *     summary: Get a policy by id
 *     tags: [Policies]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Policy found }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 *   put:
 *     summary: Update a policy
 *     tags: [Policies]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PolicyInput' }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a policy
 *     tags: [Policies]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 */
router.get("/:id", controller.findOne);
router.put("/:id", adminOnly, validate(policyUpdateSchema), controller.update);
router.delete("/:id", adminOnly, controller.remove);

module.exports = router;
