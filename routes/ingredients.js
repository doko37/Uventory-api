const router = require('express').Router()
const db = require('../db')
const Ingredient = db.models.Ingredient

router.post('/', async (req, res) => {
    Ingredient.create({
        name: req.body.name,
        category: req.body.category,
        supplier: req.body.supplier,
        stockAlert: req.body.stockAlert,
        unit: req.body.unit
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

module.exports = router
