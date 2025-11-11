const { Router } = require('express')
const { ObjectId } = require('mongodb')
const { getDb } = require('../db')
const { verifyFirebaseToken } = require('../middleware/verifyFirebaseToken')

const router = Router()

// helper to get collection
async function modelsCol() { return (await getDb()).collection('models') }

/**
 * POST /api/models (Private)
 */
router.post('/', verifyFirebaseToken, async (req, res) => {
  try {
    const u = req.user?.email || 'unknown'
    const b = req.body || {}

    const doc = {
      name: String(b.name || '').trim(),
      framework: String(b.framework || '').trim(),
      useCase: String(b.useCase || '').trim(),
      dataset: String(b.dataset || '').trim(),
      description: String(b.description || '').trim(),
      image: String(b.image || '').trim(), // ImgBB URL
      createdBy: u,
      createdAt: new Date(),
      purchased: 0
    }

    // minimal validation
    for (const k of ['name','framework','useCase','dataset','description','image']) {
      if (!doc[k]) return res.status(400).json({ message: `Missing field: ${k}` })
    }

    const result = await (await modelsCol()).insertOne(doc)
    return res.status(201).json({ _id: result.insertedId, ...doc })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to create model' })
  }
})

/**
 * GET /api/models
 */
router.get('/', async (req, res) => {
  try {
    const { q, frameworks, page = '1', limit = '12' } = req.query
    const match = {}
    if (q) match.name = { $regex: String(q), $options: 'i' }
    if (frameworks) match.framework = { $in: String(frameworks).split(',') }

    const p = Math.max(1, parseInt(page))
    const l = Math.max(1, Math.min(48, parseInt(limit)))

    const col = await modelsCol()
    const cursor = col.find(match).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l)
    const [items, total] = await Promise.all([cursor.toArray(), col.countDocuments(match)])
    return res.json({ items, total, page: p, pages: Math.ceil(total / l) })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to fetch models' })
  }
})

/**
 * GET /api/models/latest — latest 6
 */
router.get('/latest', async (_req, res) => {
  try {
    const items = await (await modelsCol()).find({}).sort({ createdAt: -1 }).limit(6).toArray()
    return res.json(items)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to fetch latest models' })
  }
})

/**
 * GET /api/models/mine (Private)
 */
router.get('/mine', verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user?.email
    const items = await (await modelsCol()).find({ createdBy: email }).sort({ createdAt: -1 }).toArray()
    return res.json(items)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to fetch my models' })
  }
})

/**
 * GET /api/models/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
    const item = await (await modelsCol()).findOne({ _id: new ObjectId(id) })
    if (!item) return res.status(404).json({ message: 'Not found' })
    return res.json(item)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to fetch model' })
  }
})

/**
 * PUT /api/models/:id (Private, owner only)
 */
router.put('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
    const col = await modelsCol()
    const existing = await col.findOne({ _id: new ObjectId(id) })
    if (!existing) return res.status(404).json({ message: 'Not found' })
    if (existing.createdBy !== req.user?.email) return res.status(403).json({ message: 'Forbidden' })

    const { _id, purchased, createdBy, createdAt, ...updates } = req.body || {}
    // sanitize updates
    for (const k of Object.keys(updates)) {
      if (updates[k] === undefined || updates[k] === null) delete updates[k]
    }

    await col.updateOne({ _id: existing._id }, { $set: updates })
    const updated = await col.findOne({ _id: existing._id })
    return res.json(updated)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to update model' })
  }
})

/**
 * DELETE /api/models/:id (Private, owner only)
 */
router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })
    const col = await modelsCol()
    const existing = await col.findOne({ _id: new ObjectId(id) })
    if (!existing) return res.status(404).json({ message: 'Not found' })
    if (existing.createdBy !== req.user?.email) return res.status(403).json({ message: 'Forbidden' })

    await col.deleteOne({ _id: existing._id })
    return res.json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to delete model' })
  }
})

/**
 * POST /api/models/:id/purchase (Private)
 */
router.post('/:id/purchase', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })

    const db = await getDb()
    const models = db.collection('models')
    const purchases = db.collection('purchases')

    // Write new purchase
    await purchases.insertOne({
      modelId: new ObjectId(id),
      purchasedBy: req.user?.email || 'unknown',
      purchasedAt: new Date()
    })

    // Increment purchased count & return updated doc
    await models.updateOne({ _id: new ObjectId(id) }, { $inc: { purchased: 1 } })
    const updated = await models.findOne({ _id: new ObjectId(id) })
    if (!updated) return res.status(404).json({ message: 'Not found' })
    return res.json(updated)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to purchase model' })
  }
})

module.exports = router
