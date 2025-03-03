const router = require('express').Router()
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateToken } = require('./authToken')
const Supplier = db.models.Supplier
const Ed = db.models.Ed
const Ingredient = db.models.Ingredient
const { Op, Sequelize, Transaction } = require('sequelize')

router.post('/', authenticateTokenAndAdmin, async (req, res, next) => {
    console.log(req.body)
    const supplier = await Supplier.findOne({
        where: {
            name: req.body.name
        },
        attributes: ['id'],
        raw: true,
        paranoid: false
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
        location: req.body.location
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => next(err))
})

router.post('/ed', authenticateTokenAndAdmin, async (req, res, next) => {
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
        next(err)
    }

})

router.get('/ed', authenticateToken, async (req, res, next) => {
    Ed.findAll().then(data => {
        return res.status(200).send(data)
    }).catch(err => {
        console.error(err)
        next(err)
    })
})

router.put('/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    Supplier.update(req.body, {
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data))
        .catch(err => {
            console.error(err)
            next(err)
        })
})

router.get('/', authenticateToken, async (req, res, next) => {
    try {
        let whereCondition = {}
        if(req.query.search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${req.query.search}%` } },
                { email: { [Op.like]: `%${req.query.search}%` } },
                { person: { [Op.like]: `%${req.query.search}%` } },
                { location: { [Op.like]: `%${req.query.search}%` } }
            ]
        }

        if(req.query.region && req.query.region !== 'All') {
            whereCondition['region'] = req.query.region
        }

        const limit = req.body.limit || 20
        const page = req.query.page || 1
        const offset = (page - 1) * limit

        const suppliers = await Supplier.findAll({
            where: whereCondition,
            order: [['name', req.query.dir || 'ASC']],
            limit: limit,
            offset: offset
        })

        return res.status(200).send(suppliers)
    } catch (err) { 
        console.error(err)
        res.sendStatus(500)
    }
})

router.get('/:id', authenticateToken, async (req, res, next) => {
    Supplier.findOne({
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => next(err))
})

router.delete('/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const supplier = await Supplier.findOne({
            where: {
                id: req.params.id
            },
        })

        if(!supplier) {
            return res.status(404).send({ text1: 'Supplier cannot be found.' })
        }
        const ingredient = await Ingredient.findOne({
            where: {
                supplier: req.params.id
            }
        })
        
        if(ingredient) {
            return res.status(400).send({ text1: `Cannot delete supplier \"${supplier.dataValues.name}\".`, text2: 'It is referenced by existing Ingredient(s).' })
        }

        supplier.name = null
        await supplier.save()
        await supplier.destroy()

        res.sendStatus(200)
    } catch(err) {
        console.error(err)
        res.sendStatus(500)
    }
})

module.exports = router
