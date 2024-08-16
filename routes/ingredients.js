const router = require('express').Router()
const { Op, Sequelize, where } = require('sequelize')
const db = require('../db')
const sequelize = require('../db')
const Ingredient = db.models.Ingredient
const IngredientCategory = db.models.IngredientCategory
const IngredientBatch = db.models.IngredientBatch
const IngredientLog = db.models.IngredientLog
const Location = db.models.Location
const Product = db.models.Product

router.post('/', async (req, res) => {
    Ingredient.create({
        code: req.body.code,
        name: req.body.name,
        category: req.body.category,
        supplier: req.body.supplier,
        stockAlert: req.body.stockAlert,
        unit: req.body.unit,
        ed: req.body.ed,
        reciever: req.body.reciever
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => {
            console.error(err)
            res.status(500).send(err)
        })
})

router.post('/category', async (req, res) => {
    IngredientCategory.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.post('/log', async (req, res) => {
    const inOut = req.body.inOut
    try {

        const ingredient = await Ingredient.findOne({
            where: {
                id: req.body.ingredientId
            }
        })
        if (inOut === 'in') {
            const log = await IngredientLog.create({
                ingredientId: req.body.ingredientId,
                batchNo: req.body.batchNo,
                location: req.body.location.id,
                user: req.body.user,
                inout: 'in',
                qty: req.body.qty,
                remark: req.body.remark
            }).catch(err => console.error(err))

            await IngredientBatch.create({
                batchNo: req.body.batchNo,
                ingredientId: req.body.ingredientId,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: req.body.qty,
                location: req.body.location.id
            }).catch(err => console.error(err))

            await Ingredient.update({
                qty: ingredient.qty + req.body.qty
            }, {
                where: {
                    id: req.body.ingredientId
                }
            }).catch(err => console.error(err))

            res.status(200).send(log)
        } else if (req.body.singleBatch) {
            const batch = await IngredientBatch.findOne({
                where: {
                    ingredientId: req.body.ingredientId,
                    batchNo: req.body.batchNo
                }
            })

            if (req.body.qty === batch.qty) {
                IngredientBatch.destroy({
                    where: {
                        id: batch.id
                    }
                })

            } else {
                IngredientBatch.update({
                    qty: batch.qty - req.body.qty
                }, {
                    where: {
                        id: batch.id
                    }
                })
            }

            IngredientLog.create({
                ingredientId: req.body.ingredientId,
                batchNo: batch.batchNo,
                location: req.body.location.id,
                user: req.body.user,
                inout: 'out',
                qty: req.body.qty,
                remark: req.body.remark,
                inProduct: req.body.inProduct
            })

            await Ingredient.update({
                qty: ingredient.qty - req.body.qty
            }, {
                where: {
                    id: req.body.ingredientId
                }
            })

            res.status(200).send("Load out successful")
        } else {
            let remainder = req.body.qty
            if (remainder > ingredient.qty) {
                res.status(400).send("Invalid qty")
                return
            }
            const batches = await IngredientBatch.findAll({
                where: {
                    ingredientId: req.body.ingredientId
                },
                order: [
                    ['expDate', 'ASC']
                ]
            })

            let index = 0
            while (remainder > 0) {
                const batch = batches[index]
                if (remainder < batch.qty) {
                    try {
                        IngredientBatch.update({
                            qty: batch.qty - remainder
                        }, {
                            where: {
                                id: batch.id
                            }
                        })

                        IngredientLog.create({
                            ingredientId: req.body.ingredientId,
                            batchNo: batch.batchNo,
                            location: req.body.location.id,
                            user: req.body.user,
                            inout: 'out',
                            qty: remainder,
                            remark: req.body.remark,
                            inProduct: req.body.inProduct
                        })

                        remainder = 0
                    } catch (err) {
                        res.status(500).send(err)
                    }
                } else {
                    try {
                        IngredientLog.create({
                            ingredientId: req.body.ingredientId,
                            batchNo: batch.batchNo,
                            location: req.body.location.id,
                            user: req.body.user,
                            inout: 'out',
                            qty: batch.qty,
                            remark: req.body.remark,
                            inProduct: req.body.inProduct
                        })

                        IngredientBatch.destroy({
                            where: {
                                id: batch.id
                            }
                        })

                        remainder -= batch.qty
                    } catch (err) {
                        res.status(500).send(err)
                    }
                }

                index++;
            }
            await Ingredient.update({
                qty: ingredient.qty - req.body.qty
            }, {
                where: {
                    id: req.body.ingredientId
                }
            })

            res.status(200).send("Load out successful")
        }
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/', async (req, res) => {
    let whereCondition = {}

    console.log(req.query.search)
    if (req.query.search) {
        whereCondition[Op.or] = [
            { name: { [Op.like]: `%${req.query.search}%` } },
            { code: { [Op.like]: `%${req.query.search}%` } },
            { category: { [Op.like]: `%${req.query.search}%` } },
            { supplier: { [Op.like]: `%${req.query.search}%` } },
            { qty: { [Op.like]: `%${req.query.search}%` } },
            { reciever: { [Op.like]: `%${req.query.search}%` } },
        ]
    }

    try {
        const ingredients = await Ingredient.findAll({
            where: whereCondition
        })
        res.status(200).send(ingredients)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/categories', async (req, res) => {
    IngredientCategory.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
})

router.get('/:id/batches', async (req, res) => {
    try {
        const batches = await IngredientBatch.findAll({
            where: {
                ingredientId: req.params.id
            },
            order: [
                ['expDate', 'ASC']
            ]
        })

        res.status(200).send(batches)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/batch/:id', async (req, res) => {
    try {
        const batch = await IngredientBatch.findOne({
            where: {
                id: req.params.id
            }
        })

        res.status(200).send(batch)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/logs', async (req, res) => {
    try {
        let sortBy
        if (req.query.sortBy === 'Batch No') {
            sortBy = 'batchNo'
        } else if (req.query.sortBy === 'Date') {
            sortBy = 'createdAt'
        } else {
            sortBy = req.query.sortBy.toLowerCase()
        }

        let whereCondition = {}

        if (req.query.inOut) {
            whereCondition.inout = req.query.inOut;
        }

        if (req.query.search) {
            whereCondition[Op.or] = [
                { batchNo: { [Op.like]: `%${req.query.search}%` } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
                { location: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.code$': { [Op.like]: `%${req.query.search}%` } }
            ];
        }

        if (req.query.startDate && req.query.endDate) {
            const startDate = new Date(req.query.startDate)
            startDate.setHours(0, 0, 0, 0)

            const endDate = new Date(req.query.endDate);
            endDate.setHours(23, 59, 59, 999)

            whereCondition['createdAt'] = {
                [Op.between]: [startDate, endDate]
            }
        }

        logs = await IngredientLog.findAll({
            where: whereCondition,
            include: [{
                model: Ingredient,
                attributes: ['code']
            }],
            order: [[sortBy, req.query.dir]]
        })
        res.status(200).send(logs)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/:id/logs', async (req, res) => {
    try {
        let sortBy
        if (req.query.sortBy === 'Batch No') {
            sortBy = 'batchNo'
        } else if (req.query.sortBy === 'Date') {
            sortBy = 'createdAt'
        } else {
            sortBy = req.query.sortBy.toLowerCase()
        }

        let whereCondition
        if (req.query.inOut) {
            whereCondition = {
                ingredientId: req.params.id,
                inout: req.query.inOut
            }
        } else {
            whereCondition = {
                ingredientId: req.params.id
            }
        }

        if (req.query.search) {
            whereCondition[Op.or] = [
                { batchNo: { [Op.like]: `%${req.query.search}%` } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
                { location: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
            ];
        }

        if (req.query.startDate && req.query.endDate) {
            const startDate = new Date(req.query.startDate)
            startDate.setHours(0, 0, 0, 0)

            const endDate = new Date(req.query.endDate);
            endDate.setHours(23, 59, 59, 999)

            whereCondition['createdAt'] = {
                [Op.between]: [startDate, endDate]
            }
        }

        logs = await IngredientLog.findAll({
            where: whereCondition,
            order: [[sortBy, req.query.dir]]
        }).catch(err => console.error(err))

        res.status(200).send(logs)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/log/:id', async (req, res) => {
    try {
        const log = await IngredientLog.findOne({
            include: [
                {
                    model: Ingredient,
                    attributes: ['name']
                },
                {
                    model: Location,
                    attributes: ['name']
                },
                {
                    model: Product,
                    attributes: ['name']
                }
            ],
            where: {
                id: req.params.id
            }
        })

        res.status(200).send({ ...log.dataValues })
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/:id', async (req, res) => {
    Ingredient.findOne({
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.get('/category/:category', async (req, res) => {
    try {
        let ingredients
        let sortBy
        if (req.query.sortBy === 'Stock Alert') {
            sortBy = sequelize.literal('qty - stockAlert')
        } else {
            sortBy = req.query.sortBy.toLowerCase()
        }

        const whereCondition = {
            category: req.params.category === 'All' ? { [Op.not]: '' } : req.params.category
        };

        if (req.query.search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${req.query.search}%` } },
                { supplier: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } }
            ];
        }

        ingredients = await Ingredient.findAll({
            include: req.query.sortBy === 'Exp. Date' ? [{
                model: IngredientBatch,
                attributes: [],
                required: false
            }] : [],
            where: whereCondition,
            group: ['Ingredient.id'],
            order: [
                [req.query.sortBy === 'Exp. Date' ?
                    Sequelize.fn('MIN', Sequelize.col('IngredientBatches.expDate')) :
                    sortBy, req.query.dir]
            ]
        })
        res.status(200).send(ingredients)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.put('/:id', async (req, res) => {
    try {
        await Ingredient.update(req.body, {
            where: {
                id: req.params.id
            }
        })

        res.status(200).send(`Updated ingredient (ID: ${req.params.id})`)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

module.exports = router