// server.js — AI Model Inventory Manager (MongoDB Native Driver + Express, CommonJS)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Optional: Firebase Admin for auth-gating edits/deletes
const admin = require('firebase-admin');
let firebaseEnabled = false;
try {
  const serviceAccountPath = process.env.FIREBASE_ADMIN_JSON || './firebase-admin-key.json';
  const svc = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(svc) });
  firebaseEnabled = true;
  console.log('🔐 Firebase Admin initialized');
} catch (err) {
  console.log('ℹ️ Firebase Admin not enabled (set FIREBASE_ADMIN_JSON to enable)');
}

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());


// Auth middleware (REQUIRED for PUT/DELETE). If Firebase isn't configured, block the request.
const verifyFirebaseToken = async (req, res, next) => {
  // Allow bypass for local dev (works even if Firebase is configured)
  if (process.env.FIREBASE_DISABLE_AUTH === 'true') {
    req.token_email = lc(req.query.email || req.body?.email || 'dev@example.com');
    return next();
  }

  if (!firebaseEnabled) {
    return res
      .status(501)
      .send({ message: 'Firebase Admin not configured on server. Set FIREBASE_DISABLE_AUTH=true for local dev.' });
  }
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = (decoded.email || '').toLowerCase();
    next();
  } catch (error) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

// ✅ Test route to verify Firebase authentication
app.get('/auth/test', verifyFirebaseToken, (req, res) => {
  res.send({
    message: 'Firebase token verified successfully ✅',
    email: req.token_email,
  });
});

// ✅ User login/register — saves/updates user in database
app.post('/auth/login', async (req, res) => {
  try {
    // Can come from Firebase token or dev mode
    const { email, displayName, photoURL } = req.body;
    if (!email) return res.status(400).send({ message: 'Missing email' });

    // This will be set once we connect to MongoDB (see run() function)
    if (!global.usersCollection) {
      return res.status(503).send({ message: 'Database not ready' });
    }

    const userDoc = {
      email: email.toLowerCase(),
      displayName: displayName || 'User',
      photoURL: photoURL || '',
      lastLogin: new Date()
    };

    // Upsert user: update if exists, insert if not (createdAt only set on insert via $setOnInsert)
    const result = await global.usersCollection.updateOne(
      { email: email.toLowerCase() },
      {
        $set: userDoc,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    res.send({
      message: 'Login successful ✅',
      email: email.toLowerCase(),
      isNewUser: result.upsertedId ? true : false
    });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).send({ message: 'Failed to login' });
  }
});

// MongoDB connection
const uri =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ytu48q5.mongodb.net/?appName=Cluster0`;

const clientOptions = {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
}

const client = new MongoClient(uri, clientOptions)

// Helper: lowercase email
const lc = (s) => (s || '').toLowerCase().trim();

app.get('/', (req, res) => {
  res.send('AI Model Inventory Manager API is running');
});

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'ai-model-inventory');
    const models = db.collection('models');
    const purchases = db.collection('purchases');
    const users = db.collection('users');

    // Expose users collection globally so /auth/login can access it
    global.usersCollection = users;

    // Ensure helpful indexes (safe to call repeatedly)
    await models.createIndex({ name: 1 });
    await models.createIndex({ createdBy: 1, createdAt: -1 });
    await purchases.createIndex({ purchasedBy: 1, createdAt: -1 });
    await purchases.createIndex({ modelId: 1, purchasedBy: 1 });
    await users.createIndex({ email: 1 });

    // -----------------------------
    // CRUD ROUTES for Models
    // -----------------------------

    // Create (Private)
    app.post('/models', verifyFirebaseToken, async (req, res) => {
      try {
        const { name, framework, useCase, dataset, description, image, createdBy, createdAt } = req.body || {};
        if (!name || !framework || !useCase || !dataset || !description || !image || !createdBy) {
          return res.status(400).send({ message: 'Missing required fields' });
        }
        // Ensure the caller is the creator
        if (lc(createdBy) !== lc(req.token_email)) {
          return res.status(403).send({ message: 'forbidden access' });
        }

        const doc = {
          name,
          framework,
          useCase,
          dataset,
          description,
          image, // ImgBB URL
          createdBy: lc(createdBy),
          createdAt: createdAt ? new Date(createdAt) : new Date(),
          purchased: Number(req.body.purchased || 0),
          ratings: [],
          averageRating: 0,
        };
        const result = await models.insertOne(doc);
        res.send({ _id: result.insertedId, ...doc });
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Failed to create model' });
      }
    });

    // Read All (+ search by name with ?q=, optional framework filter)
    app.get('/models', async (req, res) => {
      try {
        const { q, framework } = req.query;
        const filter = {};

        if (q) {
          filter.name = { $regex: q, $options: 'i' };
        }
        if (framework && framework !== 'all') {
          filter.framework = framework;
        }

        const result = await models.find(filter).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Failed to fetch models' });
      }
    });

    // Read One by id
    app.get('/models/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const doc = await models.findOne({ _id: new ObjectId(id) });
        if (!doc) return res.status(404).send({ message: 'Not found' });
        res.send(doc);
      } catch (e) {
        console.error(e);
        res.status(400).send({ message: 'Invalid id' });
      }
    });

    // Update (Private, creator-only) — Firebase token REQUIRED
    app.put('/models/:id', verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const toSet = {};
        ['name', 'framework', 'useCase', 'dataset', 'description', 'image'].forEach((k) => {
          if (req.body[k] !== undefined) toSet[k] = req.body[k];
        });

        const existing = await models.findOne({ _id: new ObjectId(id) });
        if (!existing) return res.status(404).send({ message: 'Not found' });

        // Enforce creator-only edits using verified Firebase email
        if (lc(existing.createdBy) !== lc(req.token_email)) {
          return res.status(403).send({ message: 'forbidden access' });
        }

        await models.updateOne({ _id: new ObjectId(id) }, { $set: toSet });
        const updated = await models.findOne({ _id: new ObjectId(id) });
        res.send(updated);
      } catch (e) {
        console.error(e);
        res.status(400).send({ message: 'Failed to update model' });
      }
    });

    // Delete (Private, creator-only) — Firebase token REQUIRED
    app.delete('/models/:id', verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const existing = await models.findOne({ _id: new ObjectId(id) });
        if (!existing) return res.status(404).send({ message: 'Not found' });

        // Enforce creator-only deletes using verified Firebase email
        if (lc(existing.createdBy) !== lc(req.token_email)) {
          return res.status(403).send({ message: 'forbidden access' });
        }

        const result = await models.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (e) {
        console.error(e);
        res.status(400).send({ message: 'Failed to delete model' });
      }
    });

    // -----------------------------
    // Extras per requirements
    // -----------------------------

    // My Models
    app.get('/my-models', verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.token_email;
        if (!email) return res.status(400).send({ message: 'Missing user email' });
        const result = await models.find({ createdBy: email }).sort({ createdAt: -1 }).toArray();
        res.send(result);
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Failed to fetch my models' });
      }
    });

    // Purchase Model: increments purchased + inserts into purchases
    app.post('/models/:id/purchase', verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const purchaser = req.token_email;
        if (!purchaser) return res.status(400).send({ message: 'Missing purchaser email' });

        await models.updateOne({ _id: new ObjectId(id) }, { $inc: { purchased: 1 } });
        await purchases.insertOne({ modelId: new ObjectId(id), purchasedBy: purchaser, createdAt: new Date() });

        const refreshed = await models.findOne({ _id: new ObjectId(id) });
        if (!refreshed) return res.status(404).send({ message: 'Model not found after purchase' });
        res.status(201).send({ purchased: refreshed.purchased });
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Failed to purchase model' });
      }
    });

    // My Purchases: list of purchases joined with models
    app.get('/my-purchases', verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.token_email;
        if (!email) return res.status(400).send({ message: 'Missing user email' });

        const pipeline = [
          { $match: { purchasedBy: email } },
          { $sort: { createdAt: -1 } },
          { $lookup: { from: 'models', localField: 'modelId', foreignField: '_id', as: 'model' } },
          { $unwind: '$model' },
          {
            $project: {
              _id: 1,
              purchasedAt: '$createdAt',
              purchasedBy: 1,
              'model._id': 1,
              'model.name': 1,
              'model.framework': 1,
              'model.useCase': 1,
              'model.createdBy': 1,
              'model.image': 1,
              'model.purchased': 1,
              'model.averageRating': 1,
            },
          },
        ];
        const result = await purchases.aggregate(pipeline).toArray();
        res.send(result);
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Failed to fetch purchases' });
      }
    });

    // Ratings: 1–5 stars and recompute average using aggregation-pipeline update
    app.post('/models/:id/ratings', verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const rater = req.token_email;
        const value = Number(req.body.value);
        if (!rater || !value) return res.status(400).send({ message: 'Missing rating user or value' });
        if (value < 1 || value > 5) return res.status(400).send({ message: 'Value must be 1–5' });

        const newRating = { user: rater, value, ratedAt: new Date() };
        const result = await models.updateOne(
          { _id: new ObjectId(id) },
          [
            { $set: { ratings: { $concatArrays: [{ $ifNull: ['$ratings', []] }, [newRating]] } } },
            { $set: { averageRating: { $cond: [{ $gt: [{ $size: '$ratings' }, 0] }, { $avg: '$ratings.value' }, 0] } } },
          ]
        );

        if (!result.matchedCount) return res.status(404).send({ message: 'Model not found' });
        const doc = await models.findOne({ _id: new ObjectId(id) }, { projection: { averageRating: 1, ratings: 1 } });
        res.status(201).send({ averageRating: doc?.averageRating || 0, totalRatings: doc?.ratings?.length || 0 });
      } catch (e) {
        console.error(e);
        res.status(500).send({ message: 'Failed to add rating' });
      }
    });

    // 404 handler for unknown API routes
    app.use((req, res) => {
      res.status(404).send({ message: "Oops! This AI model doesn’t exist." });
    });

    console.log('✅ Connected to MongoDB and routes ready');
  } catch (err) {
    console.error('[db] Failed to connect:', err);
    process.exit(1);
  }
}

run().catch(console.error);

app.listen(port, () => {
  console.log(`🚀 AI Model Inventory server running on port: ${port}`);
});
