const router = require("express").Router();
const controller = require("../controllers/claimController");
const validate = require("../validators/validate");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { claimSchema, claimUpdateSchema } = require("../validators/schemas");

// Every claim route requires a valid JWT (see src/middleware/auth.js).
router.use(requireAuth);

// Filing a claim (POST) is a regular-user action. Deciding the outcome
// (PUT - e.g. Approved/Rejected) or deleting a claim is admin-only. Both
// roles can view claims (GET).
const adminOnly = requireRole("admin");
const userOnly = requireRole("user");

/**
 * @openapi
 * components:
 *   schemas:
 *     Claim:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         policyId: { type: string }
 *         claimNumber: { type: string, example: "CLM-2026-0001" }
 *         dateFiled: { type: string, format: date }
 *         amountClaimed: { type: number }
 *         status: { type: string, enum: [Submitted, UnderReview, Approved, Rejected, Paid] }
 *         description: { type: string }
 *     ClaimInput:
 *       type: object
 *       required: [policyId, claimNumber, dateFiled, amountClaimed]
 *       properties:
 *         policyId: { type: string }
 *         claimNumber: { type: string }
 *         dateFiled: { type: string, format: date }
 *         amountClaimed: { type: number }
 *         status: { type: string, enum: [Submitted, UnderReview, Approved, Rejected, Paid] }
 *         description: { type: string }
 *
 * /api/claims:
 *   get:
 *     summary: List claims (optionally filtered by policy)
 *     tags: [Claims]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: policyId
 *         schema: { type: string }
 *         required: false
 *     responses:
 *       200: { description: Array of claims }
 *       401: { description: Missing/invalid JWT }
 *   post:
 *     summary: File a claim
 *     tags: [Claims]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ClaimInput' }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 */
router.post("/", userOnly, validate(claimSchema), controller.create);
router.get("/", controller.findAll);

/**
 * @openapi
 * /api/claims/{id}:
 *   get:
 *     summary: Get a claim by id
 *     tags: [Claims]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Claim found }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 *   put:
 *     summary: Update a claim
 *     tags: [Claims]
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
 *           schema: { $ref: '#/components/schemas/ClaimInput' }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       401: { description: Missing/invalid JWT }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a claim
 *     tags: [Claims]
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
router.put("/:id", adminOnly, validate(claimUpdateSchema), controller.update);
router.delete("/:id", adminOnly, controller.remove);

module.exports = router;
