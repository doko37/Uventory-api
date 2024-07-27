const router = require('express').Router()
const db = require('../db')
const Supplier = db.models.Supplier

router.post('/', async (req, res) => {
    Supplier.create({
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        person: req.body.person,
        address: req.body.address
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

module.exports = router
