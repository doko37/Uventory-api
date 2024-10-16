const router = require('express').Router()
const { Op, Sequelize, where } = require('sequelize')
const db = require('../db')
const sequelize = require('../db')
const Ingredient = db.models.Ingredient
const IngredientCategory = db.models.IngredientCategory
const IngredientBatch = db.models.IngredientBatch
const IngredientLog = db.models.IngredientLog
const IngredientLogGroup = db.models.IngredientLogGroup
const Location = db.models.Location
const Product = db.models.Product
const User = db.models.User
const Notification = db.models.Notification
const Ed = db.models.Ed
const { authenticateTokenAndAdmin } = require('./authToken')
const { authenticateTokenAndMember } = require('./authToken')
const { authenticateToken } = require('./authToken')

const unitMap = new Map()
unitMap.set('mg', 0)
unitMap.set('g', 1)
unitMap.set('kg', 2)
unitMap.set('ml', 3)
unitMap.set('l', 4)

const convertToBase = (fromUnit, amount) => {
    if (fromUnit === 'ea') return amount
    const toUnit = fromUnit.includes('g') ? 'mg' : 'ml'
    const multiplier = Math.pow(1000, (unitMap.get(fromUnit) - unitMap.get(toUnit)))
    return amount * multiplier
}

const convertToUnit = (toUnit, amount) => {
    if (fromUnit === 'ea') return amount
    const fromUnit = toUnit.includes('g') ? 'mg' : 'ml'
    const multiplier = Math.pow(1000, (unitMap.get(fromUnit) - unitMap.get(toUnit)))
    return amount * multiplier
}

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
    const stockAlert = convertToBase(req.body.unit, req.body.stockAlert)
    Ingredient.create({
        code: req.body.code,
        name: req.body.name,
        category: req.body.category,
        supplier: req.body.supplier,
        stockAlert: stockAlert,
        unit: req.body.unit,
        ed: req.body.ed,
        reciever: req.body.reciever
    })
        .then(data => {
            req.io.emit('new_ingredient')
            res.status(200).send(data.toJSON())
        })
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
    try {
        const qty = convertToBase(req.body.unit, req.body.qty)
        const ingredient = await Ingredient.findOne({
            where: {
                id: req.body.ingredientId
            }
        })

        const logGroup = await IngredientLogGroup.create({
            ingredientId: ingredient.id,
            inProduct: req.body.inProduct || null,
            user: req.user.id,
            inout: inOut,
            qty: qty,
            unit: req.body.unit,
            remark: req.body.remark || null,
            location: req.body.location.id || null,
            ed: req.body.ed
        }).catch(err => console.error(err))

        await User.update({
            lastLogId: logGroup.dataValues.id
        }, {
            where: {
                id: req.user.id
            }
        })

        if (inOut === 'in') {
            const log = await IngredientLog.create({
                logGroup: logGroup.id,
                batchNo: req.body.batchNo,
                qty: qty,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                unit: ingredient.unit
            }).catch(err => console.error(err))

            await IngredientBatch.create({
                batchNo: req.body.batchNo,
                ingredientId: ingredient.id,
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
            if (qty > ingredient.qty) {
                res.status(401).send("Invalid qty")
                return
            }

            req.body.batchList.forEach(async currBatch => {
                const currQty = convertToBase(req.body.unit, currBatch.qty)
                await IngredientBatch.update({
                    qty: Sequelize.literal(`qty - ${currQty}`)
                }, {
                    where: {
                        id: currBatch.id,
                    }
                })

                const batch = await IngredientBatch.findOne({
                    where: {
                        id: currBatch.id
                    },
                    attributes: ['batchNo', 'qty']
                })

                const batchNo = batch.dataValues.batchNo
                let batchDeleted = false
                if (batch.dataValues.qty <= 0) {
                    await IngredientBatch.destroy({
                        where: {
                            id: currBatch.id
                        }
                    })
                    batchDeleted = true
                }

                IngredientLog.create({
                    logGroup: logGroup.id,
                    batchNo: batchNo,
                    qty: currQty,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    unit: ingredient.unit,
                    batchDeleted: batchDeleted
                })
            })

            await Ingredient.update({
                qty: ingredient.qty - qty
            }, {
                where: {
                    id: req.body.ingredientId
                }
            })

            if (ingredient.qty - qty < ingredient.stockAlert && !ingredient.alertDismissed) {
                const dp = ingredient.unit === 'ea' ? 0 : 3
                const msg = `${ingredient.name} qty is low! (${convertToUnit(ingredient.unit, ingredient.qty - qty).toFixed(dp)}${ingredient.unit}/${convertToUnit(ingredient.unit, ingredient.stockAlert).toFixed(dp)}${ingredient.unit})`
                Notification.create({
                    ingredientId: ingredient.id,
                    type: 'lowStock',
                    msg: msg
                })
            }
            res.status(200).send("Load out successful")
        }
        req.io.emit('log_ingredient', { id: req.user.id })
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.post('/code', authenticateTokenAndAdmin, async (req, res) => {
    Ingredient.findOne({
        where: {
            code: req.body.code
        }
    }).then(data => {
        if (data === null) return res.status(200).send({ exists: false })
        else return res.status(200).send({ exists: true })
    }).catch(err => {
        console.error(err)
        res.sendStatus(500)
    })
})

router.get('/category/:category', authenticateToken, async (req, res) => {
    try {
        let ingredients
        let sortBy
        if (req.query.sortBy === 'Stock Alert') {
            sortBy = sequelize.literal('qty - stockAlert')
        } else {
            sortBy = req.query.sortBy.toLowerCase()
        }

        let whereCondition = {}

        if (req.query.search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${req.query.search}%` } },
                { supplier: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
                { '$IngredientBatches.batchNo$': { [Op.like]: `%${req.query.search}%` } }
            ];
        } else if (req.params.category !== 'All') {
            whereCondition.category = req.params.category
        }

        ingredients = await Ingredient.findAll({
            include: req.query.sortBy === 'Exp. Date' || req.query.search ? [{
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

router.get('/:id/logs', authenticateToken, async (req, res) => {
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
        let groupIds = []

        if (req.params.id !== 'all') {
            whereCondition.ingredientId = req.params.id
        }

        if (req.query.inOut) {
            whereCondition.inout = req.query.inOut;
        }

        if (req.query.search) {
            const ids = await IngredientLog.findAll({
                attributes: ['logGroup'],
                where: { batchNo: { [Op.like]: `%${req.query.search}%` } }
            })

            groupIds = ids.map(log => log.dataValues.logGroup)

            whereCondition[Op.or] = [
                { remark: { [Op.like]: `%${req.query.search}%` } },
                { location: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
                { ed: { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.code$': { [Op.like]: `%${req.query.search}%` } },
                { id: { [Op.in]: groupIds } }
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

        logs = await IngredientLogGroup.findAll({
            where: whereCondition,
            include: [
                {
                    model: Ingredient,
                    required: true
                },
                {
                    model: IngredientLog,
                    required: false,
                }
            ],
            order: [[sortBy, req.query.dir || 'ASC']]
        })

        res.status(200).send(logs)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/lastLog', authenticateTokenAndMember, async (req, res) => {
    const user = await User.findOne({
        where: {
            id: req.user.id
        }
    })
    if (user && user.lastLogId) {
        const log = await IngredientLogGroup.findOne({
            where: {
                id: user.lastLogId
            }
        })

        if (!log.dataValues) {
            return res.status(200).send('No log found')
        }
        return res.status(200).send(log)
    }

    return res.status(401).send('No log found')
})

router.get('/log/:id', authenticateToken, async (req, res) => {
    try {
        const log = await IngredientLogGroup.findOne({
            include: [
                {
                    model: Ingredient,
                    attributes: ['id', 'name', 'unit']
                },
                {
                    model: Product,
                    attributes: ['id', 'name'],
                    required: false
                },
                {
                    model: User,
                    attributes: ['firstName', 'lastName']
                },
                {
                    model: IngredientLog,
                    required: true
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
    let editList
    if (req.body.stockAlert) {
        editList = { ...req.body, stockAlert: convertToBase(req.body.unit, req.body.stockAlert) }
    } else {
        editList = req.body
    }

    try {
        await Ingredient.update(editList, {
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

router.put('/batch/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        const batch = await IngredientBatch.findOne({
            where: {
                id: req.params.id
            }
        })

        await IngredientBatch.update(req.body, {
            where: {
                id: req.params.id
            }
        })

        if (req.body.qty) {
            const diff = req.body.qty - batch.qty
            await Ingredient.update(
                { qty: Sequelize.literal(`qty + ${diff}`) },
                { where: { id: batch.ingredientId } }
            )
        }

        res.status(200).send(`Updated ingredient batch (ID: ${req.params.id})`)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.put('/log/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        const log = await IngredientLogGroup.findOne({
            where: {
                id: req.params.id
            },
            include: [
                {
                    model: IngredientLog,
                    required: true
                }
            ]
        })

        if (!log) return res.sendStatus(401)
        const subLog = log.IngredientLogs[0].dataValues
        const { qty, location, inProduct } = req.body.editList
        if (log.inout === 'in') {
            if (qty) {
                await IngredientLogGroup.update({ qty: qty }, {
                    where: {
                        id: log.id
                    }
                })
                await IngredientLog.update({ qty: qty }, {
                    where: {
                        id: subLog.id
                    }
                })
                await IngredientBatch.update({ qty: qty }, {
                    where: {
                        ingredientId: log.ingredientId,
                        batchNo: subLog.batchNo
                    }
                })

                const diff = log.qty - qty
                await Ingredient.update({ qty: Sequelize.literal(`qty - ${diff}`) }, {
                    where: {
                        id: log.ingredientId
                    }
                })
            }

            if (location) {
                await IngredientBatch.update({ location: location }, {
                    where: {
                        ingredientId: log.ingredientId,
                        batchNo: subLog.batchNo
                    }
                })
            }
        } else {

        }

        req.io.emit('log_ingredient', { id: req.user.id })
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
    }
})

module.exports = router