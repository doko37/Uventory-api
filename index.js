const express = require('express')
const app = express()
const products = require('./routes/products')
const ingredients = require('./routes/ingredients')
const suppliers = require('./routes/suppliers')
const auth = require('./routes/auth')
const db = require('./db')

app.use(express.json())
app.use('/api/products', products)
app.use('/api/auth', auth)
app.use('/api/ingredients', ingredients)
app.use('/api/suppliers', suppliers)

db.sync().then((req) => {
    app.listen(5000, () => {
        console.log("Listening on port 5000")
    })
})