const { MongoClient } = require('mongodb')

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('Missing MONGODB_URI in .env')

const client = new MongoClient(uri, { ignoreUndefined: true })
let _db

async function getDb() {
  if (!_db) {
    await client.connect()
    _db = client.db(process.env.DB_NAME)
  }
  return _db
}

module.exports = { getDb, client }
