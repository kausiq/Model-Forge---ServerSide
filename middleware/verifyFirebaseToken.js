const admin = require('firebase-admin')

let enabled = true
if (process.env.FIREBASE_DISABLE_AUTH === 'true') enabled = false

if (enabled && !admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  })
} else if (enabled) {
  console.warn('[auth] Firebase admin not fully configured; write routes will reject requests.')
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
