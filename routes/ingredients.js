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
const User = db.models.User
const Notification = db.models.Notification
const { authenticateTokenAndAdmin } = require('./authToken')
const { authenticateTokenAndMember } = require('./authToken')
const { authenticateToken } = require('./authToken')

const unitMap = new Map()
unitMap.set('mg', 0)
unitMap.set('g', 1)
unitMap.set('kg', 2)
unitMap.set('ml', 3)
unitMap.set('l', 4)

const convertUnits = (fromUnit, toUnit, amount) => {
    if(fromUnit === toUnit || fromUnit === 'ea') return amount
    const multiplier = Math.pow(1000, (unitMap.get(fromUnit) - unitMap.get(toUnit)))
    return amount*multiplier
}

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
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

router.post('/resetCategories', authenticateTokenAndAdmin, async (req, res) => {
    const ingredientCategories = [
        'Dairy',
        'Bee',
        'Other-animal',
        'Oil-Liquid',
        'UB-Products',
        'Caps',
        'Labels',
        'Boxes',
        'Capsules',
        'Tablets',
        'Evergreen',
        'Nu-Wise',
        'Other'
    ];

    ingredientCategories.forEach(async (category) => {
        await IngredientCategory.create({ name: category });
    });

    res.sendStatus(200)
})

router.post('/category', authenticateTokenAndAdmin, async (req, res) => {
    IngredientCategory.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.post('/log', authenticateTokenAndMember, async (req, res) => {
    const inOut = req.body.inOut
    console.log(req.user)
    try {
        const ingredient = await Ingredient.findOne({
            where: {
                id: req.body.ingredientId
            }
        })

        const qty = convertUnits(req.body.unit, ingredient.unit, req.body.qty)
        if (inOut === 'in') {
            const log = await IngredientLog.create({
                ingredientId: req.body.ingredientId,
                batchNo: req.body.batchNo,
                location: req.body.location.id,
                user: req.user.id,
                inout: 'in',
                qty: qty,
                remark: req.body.remark
            }).catch(err => console.error(err))

            await IngredientBatch.create({
                batchNo: req.body.batchNo,
                ingredientId: req.body.ingredientId,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: qty,
                location: req.body.location.id
            }).catch(err => console.error(err))

            let payload = {
                qty: ingredient.qty + qty
            }
            if (ingredient.qty + qty > ingredient.stockAlert && ingredient.alertDismissed) {
                payload.alertDismissed = false
            }

            await Ingredient.update(payload, {
                where: {
                    id: req.body.ingredientId
                }
            }).catch(err => console.error(err))


            res.status(200).send(log)
        } else {
            if (req.body.singleBatch) {
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
                        qty: batch.qty - qty
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
                    user: req.user.id,
                    inout: 'out',
                    qty: qty,
                    remark: req.body.remark,
                    inProduct: req.body.inProduct
                })

                await Ingredient.update({
                    qty: ingredient.qty - qty
                }, {
                    where: {
                        id: req.body.ingredientId
                    }
                })
            } else {
                let remainder = qty
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
                                location: batch.location,
                                user: req.user.id,
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
                                location: batch.location,
                                user: req.user.id,
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
                    qty: ingredient.qty - qty
                }, {
                    where: {
                        id: req.body.ingredientId
                    }
                })

            }
            if (ingredient.qty - qty < ingredient.stockAlert && !ingredient.alertDismissed) {
                const msg = `${ingredient.name} qty is low! (${(ingredient.qty - qty).toFixed(3)}${ingredient.unit}/${ingredient.stockAlert.toFixed(3)}${ingredient.unit})`
                Notification.create({
                    ingredientId: ingredient.id,
                    type: 'lowStock',
                    msg: msg
                })
            }
            res.status(200).send("Load out successful")
        }
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/', authenticateToken, async (req, res) => {
    let whereCondition = {}
    console.log('get ingredient')

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
        console.error("get ingredient error:", err)
        res.status(500).send(err)
    }
})

router.get('/categories', authenticateToken, async (req, res) => {
    IngredientCategory.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
})

router.get('/:id/batches', authenticateToken, async (req, res) => {
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

router.get('/batch/:id', authenticateToken, async (req, res) => {
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

router.get('/logs', authenticateToken, async (req, res) => {
    try {
        let sortBy
        if (!req.query.sortBy) {
            sortBy = 'createdAt'
        } else if (req.query.sortBy === 'Batch No') {
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
            order: [[sortBy, req.query.dir || 'ASC']]
        })
        res.status(200).send(logs)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/:id/logs', authenticateToken, async (req, res) => {
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

router.get('/log/:id', authenticateToken, async (req, res) => {
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
                    attributes: ['name'],
                    required: false
                },
                {
                    model: User,
                    attributes: ['firstName', 'lastName']
                }
            ],
            where: {
                id: req.params.id
            }
        })

        console.log(log)

        res.status(200).send({ ...log.dataValues })
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/reserved', authenticateTokenAndMember, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'firstName', 'lastName', 'reservedIngredient', 'updatedAt'],
            where: {
                reservedIngredient: {
                    [Op.ne]: null
                }
            }
        })
        return res.status(200).send(users)
    } catch (err) {
        console.error(err)
    }
})

router.get('/:id', authenticateToken, async (req, res) => {
    Ingredient.findOne({
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.get('/category/:category', authenticateToken, async (req, res) => {
    try {
        console.log('hi')
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

router.put('/reserve/:id', authenticateTokenAndMember, async (req, res) => {
    User.update({
        reservedIngredient: req.params.id
    }, {
        where: {
            id: req.user.id
        }
    }).then(() => res.sendStatus(200)).catch(err => {
        console.error(err)
        return res.sendStatus(500)
    })
})

router.put('/unreserve', authenticateTokenAndMember, async (req, res) => {
    User.update({
        reservedIngredient: null
    }, {
        where: {
            id: req.user.id
        }
    }).then(() => res.sendStatus(200)).catch(err => {
        console.error(err)
        return res.sendStatus(500)
    })
})

router.put('/:id', authenticateTokenAndMember, async (req, res) => {
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