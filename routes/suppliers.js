const router = require('express').Router()
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateToken } = require('./authToken')
const Supplier = db.models.Supplier

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
    Supplier.create({
        region: req.body.region,
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        person: req.body.person,
        address: req.body.address
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.put('/:id', authenticateTokenAndAdmin, async (req, res) => {
    Supplier.update(req.body, {
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data))
        .catch(err => {
            console.error(err)
            res.status(500).send(err)
        })
})

router.get('/', authenticateToken, async (req, res) => {
    Supplier.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
})

router.get('/:id', authenticateToken, async (req, res) => {
    Supplier.findOne({
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

module.exports = router
