const { Router } = require('express')
const { ObjectId } = require('mongodb')
const { getDb } = require('../db')
const { verifyFirebaseToken } = require('../middleware/verifyFirebaseToken')

const router = Router()

// helper to get collection
async function modelsCol() { return (await getDb()).collection('models') }

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