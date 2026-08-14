// Proxies claim-amount predictions to the Flask ML service (see
// /ml-service). Kept as a thin controller: the Node backend does not
// duplicate any model logic, it just forwards the request and relays
// the response/error back to the caller.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";

exports.predict = async (req, res, next) => {
  try {
    console.info('[predictionController] predict called - headers:', {
      authorization: req.headers.authorization,
      host: req.headers.host,
      'content-type': req.headers['content-type'],
    });
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    // Read the body ONCE as text, then attempt to parse it. Calling
    // response.json() and, on failure, response.text() on the SAME
    // response tries to read its body stream twice — the fetch API
    // throws "Body is unusable: Body has already been read" for that,
    // which is what was surfacing as the prediction error.
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseErr) {
      return res.status(502).json({
        error: 'InvalidModelServiceResponse',
        message: 'Model service returned a non-JSON response',
        status: response.status,
        preview: raw?.substring(0, 1000),
      });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED" || err.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "ModelServiceUnavailable",
        message: "The claim prediction service is not reachable right now.",
      });
    }
    next(err);
  }
};

exports.predictLLM = async (req, res, next) => {
  try {
    console.info('[predictionController] predictLLM called - headers:', {
      authorization: req.headers.authorization,
      host: req.headers.host,
      'content-type': req.headers['content-type'],
    });
    const response = await fetch(`${ML_SERVICE_URL}/predict-llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    // Read the body ONCE as text, then attempt to parse it (see the
    // matching comment in predict() above for why).
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseErr) {
      return res.status(502).json({
        error: 'InvalidModelServiceResponse',
        message: 'Model service returned a non-JSON response',
        status: response.status,
        preview: raw?.substring(0, 1000),
      });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    if (err.cause?.code === "ECONNREFUSED" || err.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "ModelServiceUnavailable",
        message: "The claim prediction service is not reachable right now.",
      });
    }
    next(err);
  }
};
