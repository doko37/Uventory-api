const express = require('express')
const app = express()
const ingredients = require('./routes/ingredients')
const products = require('./routes/products')
const locations = require('./routes/locations')
const suppliers = require('./routes/suppliers')
const auth = require('./routes/auth')
const db = require('./db')
const cors = require('cors')

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())
app.use('/api/auth', auth)
app.use('/api/ingredients', ingredients)
app.use('/api/products', products)
app.use('/api/suppliers', suppliers)
app.use('/api/locations', locations)

db.sync({ alter: true }).then((req) => {
    app.listen(5000, () => {
        console.log("Listening on port 5000")
    })
})