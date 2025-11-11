const { Router } = require('express')
const { ObjectId } = require('mongodb')
const { getDb } = require('../db')
const { verifyFirebaseToken } = require('../middleware/verifyFirebaseToken')

const router = Router()

/**
 * GET /api/purchases/mine (Private)
 */
router.get('/mine', verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user?.email
    const db = await getDb()
    const rows = await db.collection('purchases').aggregate([
      { $match: { purchasedBy: email } },
      { $lookup: { from: 'models', localField: 'modelId', foreignField: '_id', as: 'model' } },
      { $unwind: '$model' },
      { $sort: { purchasedAt: -1 } }
    ]).toArray()

    return res.json(rows.map(r => ({
      purchasedAt: r.purchasedAt,
      purchasedBy: r.purchasedBy,
      model: r.model
    })))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to fetch purchases' })
  }
})

/**
 * GET /api/purchases/by-model/:id (Private)
 */
router.get('/by-model/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const id = req.params.id
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' })

    const db = await getDb()
    const rows = await db.collection('purchases').find({ modelId: new ObjectId(id) }).sort({ purchasedAt: -1 }).toArray()
    return res.json(rows)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'Failed to fetch purchases for model' })
  }
})

module.exports = router
