const router = require("express").Router();
const controller = require("../controllers/policyholderController");
const validate = require("../validators/validate");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { policyholderSchema, policyholderUpdateSchema } = require("../validators/schemas");

// Every policyholder route requires a valid JWT (see src/middleware/auth.js).
router.use(requireAuth);

// Entering and maintaining policyholder details is the regular user's job.
// Deleting a policyholder record is kept admin-only since policies/claims
// may reference it. Both roles get read access via the GET routes below.
const adminOnly = requireRole("admin");
const userOnly = requireRole("user");

/**
 * @openapi
 * components:
 *   schemas:
 *     Policyholder:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         name: { type: string, example: "Aditi Sharma" }
 *         email: { type: string, format: email }
 *         phone: { type: string, example: "+91-9876543210" }
 *         address: { type: string }
 *         dateOfBirth: { type: string, format: date }
 *     PolicyholderInput:
 *       type: object
 *       required: [name, email, phone, address]
 *       properties:
 *         name: { type: string }
 *         email: { type: string, format: email }
 *         phone: { type: string }
 *         address: { type: string }
 *         dateOfBirth: { type: string, format: date }
 *
 * /api/policyholders:
 *   get:
 *     summary: List all policyholders
 *     tags: [Policyholders]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of policyholders
 *       401:
 *         description: Missing/invalid JWT
 *   post:
 *     summary: Create a policyholder
 *     tags: [Policyholders]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PolicyholderInput' }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 *       409: { description: Email already in use }
 */
router.post("/", userOnly, validate(policyholderSchema), controller.create);
router.get("/", controller.findAll);

/**
 * @openapi
 * /api/policyholders/{id}:
 *   get:
 *     summary: Get a policyholder by id
 *     tags: [Policyholders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Policyholder found }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 *   put:
 *     summary: Update a policyholder
 *     tags: [Policyholders]
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
 *           schema: { $ref: '#/components/schemas/PolicyholderInput' }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 *       409: { description: Email already in use }
 *   delete:
 *     summary: Delete a policyholder
 *     tags: [Policyholders]
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
 *       409: { description: Has dependent policies }
 */
router.get("/:id", controller.findOne);
router.put("/:id", userOnly, validate(policyholderUpdateSchema), controller.update);
router.delete("/:id", adminOnly, controller.remove);

module.exports = router;
