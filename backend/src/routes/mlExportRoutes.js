const router = require("express").Router();
const controller = require("../controllers/mlExportController");
const requireAuth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

/**
 * @openapi
 * /api/ml/training-export:
 *   get:
 *     summary: Export resolved claims as labeled rows for model retraining (admin only)
 *     description: >
 *       Used by the ml-service Airflow ingestion DAG (see
 *       ml-service/ingestion/ingest.py) to pull newly-decided claims since
 *       its last run. Requires stateful mode (USE_DB=true).
 *     tags: [ML Pipeline]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: since
 *         schema: { type: string, format: date-time }
 *         required: false
 *         description: Only return claims decided after this ISO timestamp.
 *     responses:
 *       200: { description: Array of training rows }
 *       401: { description: Missing/invalid JWT }
 *       403: { description: Not an admin }
 *       501: { description: Not supported in stateless (in-memory) mode }
 */
router.get("/training-export", requireAuth, requireRole("admin"), controller.trainingExport);

module.exports = router;
