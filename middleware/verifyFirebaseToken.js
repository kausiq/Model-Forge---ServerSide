const admin = require('firebase-admin')
const path = require('path')

let enabled = true
if (process.env.FIREBASE_DISABLE_AUTH === 'true') enabled = false

// Initialize Firebase Admin from local service account JSON only.
// If the file is missing or invalid, do NOT attempt env-var fallback.
if (enabled && !admin.apps.length) {
  try {
    const serviceAccountPath = path.join(__dirname, '..', 'model-forge-firebase-adminsdk.json')
    const serviceAccount = require(serviceAccountPath)
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    })
    console.log('[auth] Firebase admin initialized from model-forge-firebase-adminsdk.json')
  } catch (err) {
    console.warn('[auth] Firebase admin not configured: could not load model-forge-firebase-adminsdk.json')
    console.warn("[auth] Place the service account JSON at the project root with the filename 'model-forge-firebase-adminsdk.json' to enable auth.")
  }
}

async function verifyFirebaseToken(req, res, next) {
  if (!enabled) return next() // dev-only bypass

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ message: 'Missing token' })

    const decoded = await admin.auth().verifyIdToken(token)
    req.user = decoded
    next()
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

module.exports = { verifyFirebaseToken }
