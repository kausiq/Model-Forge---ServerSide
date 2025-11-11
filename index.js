require('dotenv').config()
const express = require('express')
const cors = require('cors')

const modelRoutes = require('./routes/models')
const purchaseRoutes = require('./routes/purchases')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => res.send('AI Model Inventory API'))

// RESTful APIs
app.use('/api/models', modelRoutes)
app.use('/api/purchases', purchaseRoutes)

// 404
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }))

const port = process.env.PORT || 5174
app.listen(port, () => console.log(`Server running on :${port}`))
