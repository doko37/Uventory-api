const router = require('express').Router()
const db = require('../db')
const Location = db.models.Location

router.post('/', async (req, res) => {
    Location.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.get('/', async (req, res) => {
    Location.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
})

module.exports = router