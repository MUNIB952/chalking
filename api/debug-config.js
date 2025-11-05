/**
 * Debug endpoint to check environment variables
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION;
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;

    const debug = {
      hasProjectId: !!projectId,
      hasLocation: !!location,
      hasServiceAccount: !!serviceAccountJson,
      projectId: projectId || 'MISSING',
      location: location || 'MISSING',
      serviceAccountLength: serviceAccountJson?.length || 0,
      serviceAccountStartsWith: serviceAccountJson?.substring(0, 30) || 'MISSING',
      canParseJson: false,
      jsonKeys: []
    };

    // Try to parse the service account JSON
    if (serviceAccountJson) {
      try {
        const parsed = JSON.parse(serviceAccountJson);
        debug.canParseJson = true;
        debug.jsonKeys = Object.keys(parsed);
        debug.hasPrivateKey = !!parsed.private_key;
        debug.hasClientEmail = !!parsed.client_email;
        debug.clientEmail = parsed.client_email || 'MISSING';
      } catch (e) {
        debug.jsonParseError = e.message;
      }
    }

    return res.status(200).json(debug);

  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
