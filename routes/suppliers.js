const router = require('express').Router()
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateToken } = require('./authToken')
const Supplier = db.models.Supplier
const Ed = db.models.Ed
const Ingredient = db.models.Ingredient

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
    const supplier = await Supplier.findOne({
        where: {
            name: req.body.name
        },
        attributes: ['id'],
        raw: true
    })

    if(supplier) {
        return res.status(400).send({ text1: `Supplier \"${req.body.name}\" already exists.`, text2: "Please enter a different name." })
    }

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

router.post('/ed', authenticateTokenAndAdmin, async (req, res) => {
    try {
        const num = await Ed.findOne({
            where: {
                id: req.body.number
            },
            attributes: ['id'],
            raw: true
        })

        if (num !== null || !req.body.number) {
            return res.status(400).send({ text1: `\"${num.id} already exists.` })
        }

        await Ed.create({
            id: req.body.number
        })
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }

})

router.get('/ed', authenticateToken, async (req, res) => {
    Ed.findAll().then(data => {
        return res.status(200).send(data)
    }).catch(err => {
        console.error(err)
        return res.sendStatus(500)
    })
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
        .catch(err => {
            console.error(err)
            res.status(500).send(err)
        })
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

router.delete('/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        
        const ingredient = await Ingredient.findOne({
            where: {
                supplier: req.params.id
            }
        })
        
        if(ingredient) {
            const supplier = await Supplier.findOne({
                where: {
                    id: req.params.id
                },
                attributes: ['name'],
                raw: true
            })
            return res.status(400).send({ text1: `Cannot delete supplier \"${supplier.name}\".`, text2: 'It is referenced by existing Ingredient(s).' })
        }
        await Supplier.destroy({
            where: {
                id: req.params.id
            }
        })

        res.sendStatus(200)
    } catch(err) {
        console.log(err)
        res.sendStatus(500)
    }
})

module.exports = router
