const router = require('express').Router()
const { Op, Sequelize, where, Transaction } = require('sequelize')
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
const LogAudit = db.models.LogAudit
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
    console.log(fromUnit, amount)
    if (fromUnit === 'ea') return amount
    const toUnit = fromUnit.includes('g') ? 'mg' : 'ml'
    const multiplier = Math.pow(1000, (unitMap.get(fromUnit) - unitMap.get(toUnit)))
    return amount * multiplier
}

const convertToUnit = (toUnit, amount) => {
    if (toUnit === 'ea') return amount
    const fromUnit = toUnit.includes('g') ? 'mg' : 'ml'
    const multiplier = Math.pow(1000, (unitMap.get(fromUnit) - unitMap.get(toUnit)))
    return amount * multiplier
}

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    const stockAlert = convertToBase(req.body.unit, req.body.stockAlert);

    try {
        const existingIngredient = await Ingredient.findOne({
            where: {
                name: req.body.name
            },
            transaction
        });

        if (existingIngredient) {
            await transaction.rollback();
            return res.status(400).send({ text1: `Cannot create ingredient.`, text2: `Name \"${req.body.name}\" already exists.` });
        }

        const deleted = await Ingredient.findOne({
            where: {
                [Op.or]: [
                    { code: req.body.code },
                    { name: req.body.name }
                ],
            },
            attributes: ['code', 'name'],
            paranoid: false,
            transaction
        });

        if (deleted) {
            if (deleted.code === req.body.code) {
                await Ingredient.update(
                    { code: null },
                    {
                        where: { code: req.body.code },
                        paranoid: false,
                        transaction
                    }
                );
            }
            if (deleted.name === req.body.name) {
                await Ingredient.update(
                    { name: null },
                    {
                        where: { name: req.body.name },
                        paranoid: false,
                        transaction
                    }
                );
            }
        }

        const newIngredient = await Ingredient.create({
            code: req.body.code,
            name: req.body.name,
            category: req.body.category,
            supplier: req.body.supplier,
            stockAlert: stockAlert,
            unit: req.body.unit,
            ed: req.body.ed,
            receiver: req.body.receiver
        }, { transaction });

        await transaction.commit();

        req.io.emit('new_ingredient');
        return res.status(200).send(newIngredient);

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        return res.status(500).send(err);
}

})

router.post('/category', authenticateTokenAndAdmin, async (req, res) => {
    IngredientCategory.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

const createAudit = async (req, action, transaction) => {
    console.log("createAudit:", req)
    try {
        const newItem = {
            logAction: action,
            ingredientLogId: req.ingredientLogId,
            ingredientId: req.ingredientId,
            batchNo: req.batchNo,
            qty: req.qty || null,
            user: req.user,
            inOut: req.inOut
        }

        if (action === 'update') {
            newItem.prevQty = req.prevQty
        }

        await LogAudit.create(newItem, {
            transaction
        })
        return
    } catch(err) {
        throw err
    }
}

router.post('/log', authenticateTokenAndMember, async (req, res) => {
    const inOut = req.body.inOut
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {

        const qty = convertToBase(req.body.unit, req.body.qty)
        const ingredient = await Ingredient.findOne({
            where: {
                id: req.body.ingredientId
            },
            transaction
        })

        if(inOut === 'in') {
            const batch = await IngredientBatch.findOne({
                where: {
                    ingredientId: req.body.ingredientId,
                    batchNo: req.body.batchNo
                }
            })

            if(batch) {
                return res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${ingredient.dataValues.name}\".`, text2: 'Please enter a different Batch No.'})
            }
        }

        const logGroup = await IngredientLogGroup.create({
            ingredientId: ingredient.dataValues.id,
            inProduct: req.body.inProduct || null,
            user: req.user.id,
            inout: inOut,
            unit: req.body.unit,
            remark: req.body.remark || null,
            ed: req.body.ed
        }, { transaction })

        await User.update({
            lastIngredientLogId: logGroup.dataValues.id
        }, {
            where: {
                id: req.user.id
            },
            transaction
        })

        if (inOut === 'in') {
            const log = await IngredientLog.create({
                logGroup: logGroup.id,
                batchNo: req.body.batchNo,
                qty: qty,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                location: req.body.location.id,
                unit: ingredient.unit
            }, { transaction })

            await createAudit({ ...req.body, qty: qty, ingredientLogId: log.dataValues.id, user: req.user.id, ingredientId: ingredient.dataValues.id }, 'create', transaction)

            await IngredientBatch.create({
                batchNo: req.body.batchNo,
                ingredientId: ingredient.id,
                logId: log.dataValues.id,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: qty,
                location: req.body.location.id,
            }, { transaction })

            let payload = {
                qty: ingredient.qty + qty
            }
            if (ingredient.qty + qty > ingredient.stockAlert && ingredient.alertDismissed) {
                payload.alertDismissed = false
            }

            await Ingredient.update(payload, {
                where: {
                    id: req.body.ingredientId
                },
                transaction
            })
        } else {
            // if (qty > ingredient.qty) {
            //     res.status(401).send("Invalid qty")
            //     await transaction.rollback()
            //     return
            // }

            for(const index in req.body.batchList) {
                const currBatch = req.body.batchList[index]
                const currQty = convertToBase(req.body.unit, currBatch.qty)
                const batch = await IngredientBatch.findOne({
                    where: {
                        id: currBatch.id
                    },
                    transaction,
                    attributes: ['batchNo', 'qty', 'location']
                })

                const batchNo = batch.dataValues.batchNo
                let deleted = false
                if (batch.dataValues.qty - currQty === 0) {
                    await IngredientBatch.destroy({
                        where: {
                            id: currBatch.id
                        }
                    }, { transaction })
                    deleted = true
                } else {
                    await IngredientBatch.update({
                        qty: Sequelize.literal(`qty - ${currQty}`)
                    }, {
                        where: {
                            id: currBatch.id,
                        },
                        transaction,
                    })
                }
                const log = await IngredientLog.create({
                    logGroup: logGroup.id,
                    batchNo: batchNo,
                    qty: currQty,
                    batchQty: batch.dataValues.qty,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    location: batch.dataValues.location,
                    unit: ingredient.unit,
                    batchDeleted: deleted
                }, { transaction })

                await createAudit({
                    ...req.body,
                    qty: currQty,
                    ingredientLogId: log.id,
                    prevQty: batch.dataValues.qty,
                    batchNo: batchNo,
                    user: req.user.id,
                    ingredientId: ingredient.dataValues.id
                }, 'create', transaction)
            }

            await Ingredient.update({
                qty: ingredient.qty - qty
            }, {
                where: {
                    id: req.body.ingredientId
                },
                transaction
            })

            if (ingredient.qty - qty < ingredient.stockAlert && !ingredient.alertDismissed) {
                const dp = ingredient.unit === 'ea' ? 0 : 3
                const msg = `${ingredient.name} qty is low! (${convertToUnit(ingredient.unit, ingredient.qty - qty).toFixed(dp)}${ingredient.unit}/${convertToUnit(ingredient.unit, ingredient.stockAlert).toFixed(dp)}${ingredient.unit})`
                await Notification.create({
                    ingredientId: ingredient.id,
                    type: 'lowStock',
                    msg: msg
                }, { transaction })
            }
        }
        await transaction.commit()
        res.sendStatus(200)
        req.io.emit('log_ingredient', { id: req.user.id })
    } catch (err) {
        await transaction.rollback()
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
    console.log(req.socketId)
    try {
        let ingredients
        let sortBy
        if (req.query.sortBy === 'Stock Alert') {
            sortBy = sequelize.literal('qty - stockAlert')
        } else {
            if(req.query.sortBy) {
                sortBy = req.query.sortBy.toLowerCase()
            } else {
                sortBy = 'createdAt'
            }
        }

        let whereCondition = {}

        if (req.query.search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${req.query.search}%` } },
                { supplier: { [Op.like]: `%${req.query.search}%` } },
                { code: { [Op.like]: `%${req.query.search}%` } },
                { '$IngredientBatches.batchNo$': { [Op.like]: `%${req.query.search}%` } }
            ];
        } else if (req.params.category !== 'All') {
            whereCondition.category = req.params.category
        }

        ingredients = await Ingredient.findAll({
            attributes: {
                include: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('IngredientBatches.qty')), 0), 'qtySum']]
            },
            include: [
                {
                    model: IngredientBatch,
                    required: false,
                    attributes: []
                }
            ],
            where: whereCondition,
            group: ['Ingredient.id'],
            order: [
                [req.query.sortBy === 'Exp. Date' ?
                    Sequelize.fn('MIN', Sequelize.col('IngredientBatches.expDate')) :
                    sortBy, req.query.dir || 'ASC']
            ]
        })
        res.status(200).send(ingredients)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/categories', authenticateToken, async (req, res) => {
    IngredientCategory.findAll({
        attributes: ['id', 'name']
    })
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
        if (req.query.sortBy === 'Date' || !req.query.sortBy) {
            sortBy = 'createdAt'
        } else {
            sortBy = req.query.sortBy.toLowerCase()
        }

        const { Op, Sequelize } = require('sequelize');

        let whereCondition = {};
        let groupIds = [];

        if (req.params.id !== 'all') {
            whereCondition.ingredientId = req.params.id;
        }

        if (req.query.inOut) {
            whereCondition.inout = req.query.inOut;
        }

        if (req.query.startDate && req.query.endDate) {
            const startDate = new Date(req.query.startDate);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(req.query.endDate);
            endDate.setHours(23, 59, 59, 999);

            whereCondition['createdAt'] = {
                [Op.between]: [startDate, endDate]
            };
        }

        const limit = req.body.limit || 20
        const page = req.query.page || 1
        const offset = (page - 1) * limit

        const ids = await IngredientLog.findAll({
            attributes: ['logGroup'],
            where: { batchNo: { [Op.like]: `%${req.query.search}%` } },
            raw: true
        });

        groupIds = ids.map(log => log.logGroup);

        if(req.query.search) {
            whereCondition[Op.or] = [
                { '$User.firstName$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.lastName$': { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.code$': { [Op.like]: `%${req.query.search}%` } },
                { id: { [Op.in]: groupIds } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
                { ed: { [Op.like]: `%${req.query.search}%` } }
            ]
        }

        const logIds = await IngredientLogGroup.findAll({
            where: whereCondition,
            attributes: ['id', 'createdAt'],
            include: [
                {
                    model: User,
                    attributes: []
                },
                {
                    model: Ingredient,
                    attributes: ['id', 'code', 'unit'],
                    required: true,
                    paranoid: true
                }
            ],
            limit: limit,
            offset: offset,
            paranoid: true,
            raw: true
        })

        const logs = await IngredientLogGroup.findAll({
            where: {
                id: { [Op.in]: logIds.map(i => i.id) }
            },
            attributes: {
                include: [
                    [Sequelize.literal(`(SELECT SUM(qty) FROM IngredientLogs WHERE IngredientLogs.logGroup = IngredientLogGroup.id AND IngredientLogs.deletedAt IS NULL)`), 'qty']
                ]
            },
            include: [
                {
                    model: IngredientLog,
                    attributes: ['id', 'batchNo', 'qty', 'expDate', 'batchDeleted', 'flagged'],
                }
            ],
            order: [[sortBy === 'qty' ? Sequelize.literal(`(SELECT SUM(qty) FROM IngredientLogs WHERE IngredientLogs.logGroup = IngredientLogGroup.id AND IngredientLogs.deletedAt IS NULL)`) : sortBy, req.query.dir || 'DESC']],
            limit: limit,
            paranoid: true,
            offset: offset
        })

        const joinedLog = logs.map(log => {
            match = logIds.find(i => i.id === log.id)
            return {
                ...log.dataValues,
                ingredientCode: match['Ingredient.code'],
                unit: match['Ingredient.unit']
            }
        })

        res.status(200).send(joinedLog)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/lastLog', authenticateTokenAndMember, async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                id: req.user.id
            }
        })
        if (user && user.lastIngredientLogId) {
            const logGroup = await IngredientLogGroup.findOne({
                where: {
                    id: user.lastIngredientLogId
                }
            })

            const log = await IngredientLog.findOne({
                where: {
                    logGroup: logGroup.dataValues.id
                },
                attributes: ['unit'],
                include: [
                    {
                        model: Location,
                        required: false,
                        attributes: ['id']
                    }
                ]
            })

            if (!log.dataValues) {
                return res.status(200).send('No log found')
            }

            return res.status(200).send({ ...logGroup.dataValues, unit: log.dataValues.unit, location: logGroup.inout === 'in' ? log.dataValues.Location.id : null })
        }

        return res.status(404).send('No log found')
    } catch(err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.get('/log/:id', authenticateToken, async (req, res) => {
    try {
        const log = await IngredientLogGroup.findOne({
            where: {
                id: req.params.id
            },
            attributes: {
                include: [
                    [Sequelize.literal(`(SELECT SUM(qty) FROM IngredientLogs WHERE IngredientLogs.logGroup = IngredientLogGroup.id AND IngredientLogs.deletedAt IS NULL)`), 'qty']
                ]
            },
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
                    required: false,
                    include: [
                        {
                            model: Location,
                            attributes: []
                        }
                    ],
                    attributes: [
                        'id',
                        [Sequelize.literal(`(SELECT name FROM Locations WHERE Locations.id = IngredientLogs.location)`), 'locationName'],
                        [Sequelize.literal(`(SELECT id FROM Locations WHERE Locations.id = IngredientLogs.location)`), 'locationId'],
                        'batchNo',
                        'expDate',
                        'qty',
                        'batchQty',
                        'batchDeleted',
                        'flagged'
                    ]
                }
            ],
        })

        if(!log) {
            return res.sendStatus(404)
        }

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
        },
        attributes: {
            include: [[sequelize.fn('SUM', sequelize.col('IngredientBatches.qty')), 'qtySum']]
        },
        include: [
            {
                model: IngredientBatch,
                required: false,
                attributes: []
            }
        ],
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.put('/category/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        await IngredientCategory.update({
            name: req.body.name
        }, {
            where: {
                id: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch(err) {
        console.error(err)
        return res.sendStatus(500)
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

router.put('/:id', authenticateTokenAndAdmin, async (req, res) => {
    let editList
    if (req.body.stockAlert) {
        editList = { ...req.body, stockAlert: convertToBase(req.body.unit, req.body.stockAlert) }
    } else if (req.body.name) {
        const ingredient = await Ingredient.findOne({
            where: {
                name: req.body.name
            }
        })

        if (ingredient) {
            return res.status(400).send({ text1: `Name \"${req.body.name}\" already exists.`, text2: 'Please enter a different name' })
        }

        editList = req.body
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

router.put('/batch/:id', authenticateTokenAndMember, async (req, res) => {
    try {
        const batch = await IngredientBatch.findOne({
            where: {
                id: req.params.id
            }
        })

        if(req.body.batchNo) {
            const sameBatch = await IngredientBatch.findOne({
                where: {
                    ingredientId: batch.dataValues.ingredientId,
                    batchNo: req.body.batchNo
                }
            })

            if(sameBatch) {
                const ingredient = await Ingredient.findOne({
                    where: {
                        id: batch.dataValues.ingredientId
                    },
                    attributes: ['name']
                })
                return res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${ingredient.dataValues.name}\".`, text2: 'Please enter a different Batch No.'})
            }
            console.log(batch.dataValues.batchNo)
            const logs = await IngredientLog.findAll({
                where: {
                    batchNo: batch.batchNo
                },
                include: [
                    {
                        model: IngredientLogGroup,
                        where: {
                            ingredientId: batch.dataValues.ingredientId
                        },
                        attributes: [],
                        required: true
                    }
                ],
                attributes: ['id']
            })
            for(const id of logs.map(i => i.dataValues.id)) {
                await IngredientLog.update({
                    batchNo: req.body.batchNo
                }, {
                    where: {
                        id: id
                    },
                })
            }
            await IngredientBatch.update({ batchNo: req.body.batchNo }, {
                where: {
                    id: req.params.id
                }
            })
        } else if (req.body.qty) {
        } else {
            await IngredientBatch.update(req.body, {
                where: {
                    id: req.params.id
                }
            })
        }
        res.status(200).send(`Updated ingredient batch (ID: ${req.params.id})`)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

const updateQty = async (req) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        for (const key of Object.keys(req.body.IngredientLogs)) {
            const batch = req.body.IngredientLogs[key]
            let first = true
            const rootLog = batch.logs[0]

            if(rootLog.exclude) {
                await createAudit({
                    ingredientId: batch.ingredientId,
                    ingredientLogId: rootLog.id,
                    batchNo: key,
                    inOut: rootLog.inOut,
                    qty: rootLog.prevQty,
                    user: req.user.id
                }, 'delete', transaction)
            } else {
                await createAudit({
                    ingredientId: batch.ingredientId,
                    ingredientLogId: rootLog.id,
                    batchNo: key,
                    inOut: rootLog.inOut,
                    qty: rootLog.qty,
                    prevQty: rootLog.prevQty,
                    user: req.user.id
                }, 'update', transaction)
            }

            for(const log of batch.logs) {
                if(first) {
                    if(batch.deleted) {
                        await IngredientBatch.destroy({
                            where: {
                                ingredientId: batch.ingredientId,
                                batchNo: key
                            },
                            transaction
                        })
                    } else {
                        const existingBatch = await IngredientBatch.findOne({
                            where: {
                                ingredientId: batch.ingredientId,
                                batchNo: key
                            },
                            attributes: ['id'],
                            transaction
                        })

                        const diff = log.qty - log.prevQty
                        if(existingBatch) {
                            await IngredientBatch.update({
                                qty: log.inOut === 'out' ? sequelize.literal(`qty - ${diff}`) : sequelize.literal(`qty + ${diff}`),
                                flagged: batch.flagged
                            }, {
                                where: {
                                    ingredientId: batch.ingredientId,
                                    batchNo: key
                                },
                                transaction
                            })
                        } else {
                            const batchInfo = await IngredientLog.findOne({
                                where: {
                                    id: log.id
                                },
                                attributes: ['expDate', 'poDate', 'location'],
                                transaction
                            })
                            if(batchInfo) {
                                await IngredientBatch.create({
                                    ingredientId: batch.ingredientId,
                                    batchNo: key,
                                    qty: log.inOut === 'out' ? log.prevQty - log.qty : log.qty - log.prevQty,
                                    expDate: batchInfo.dataValues.expDate,
                                    poDate: batchInfo.dataValues.poDate,
                                    location: batchInfo.dataValues.location,
                                    flagged: batch.flagged
                                }, { transaction })
                            }
                        }
                    }
                    first = false
                }

                if(log.exclude) {
                    await IngredientLog.destroy({
                        where: {
                            id: log.id
                        },
                        transaction
                    })
                } else {
                    await IngredientLog.update({
                        qty: log.qty,
                        batchQty: log.batchQty,
                        flagged: log.batchQty ? log.batchQty - log.qty < 0 ? true : false : false,
                        batchDeleted: log.batchQty ? log.batchQty - log.qty === 0 ? true : false : false,
                    }, {
                        where: {
                            id: log.id
                        },
                        transaction
                    })
                }
            }
        }
        await transaction.commit()
        return true
    } catch(err) {
        await transaction.rollback()
        throw err
    }
}

router.put('/log/:id', authenticateTokenAndMember, async (req, res) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    let logGroup = await IngredientLogGroup.findOne({
        where: {
            id: req.params.id
        },
        include: [
            {
                model: IngredientLog,
                required: true
            }
        ],
        transaction
    })

    if(!logGroup) return res.sendStatus(404)
    try {
        if (req.body.IngredientLogs) {
            const batches = {}
            if(!req.query.confirmed) {
                for(const i in logGroup.dataValues.IngredientLogs) {
                    const log = logGroup.dataValues.IngredientLogs[i]
                    if(!req.body.IngredientLogs.some(i => i.id === log.id)) {
                        continue
                    }
                    const logHistory = await IngredientLog.findAll({
                        include: [
                            {
                                model: IngredientLogGroup,
                                where: {
                                    ingredientId: logGroup.dataValues.ingredientId
                                },
                                required: true,
                                attributes: []
                            }
                        ],
                        where: {
                            batchNo: log.batchNo,
                            createdAt: {
                                [Op.gte]: log.createdAt
                            }
                        },
                        order: [['createdAt', 'ASC']],
                        attributes: ['id','logGroup', 'qty', 'batchQty', 'unit'],
                        transaction,
                    })

                    if(batches[log.batchNo] === undefined) {
                        batches[log.batchNo] = {
                            logs: [],
                            deleted: false,
                            flagged: false,
                            ingredientId: logGroup.dataValues.ingredientId
                        }
                    }

                    if(logHistory.length > 20) {
                        return res.status(400).send({ text1: 'Log is too far back in history' })
                    }
                    batches[log.batchNo].logs = logHistory.map(i => i.dataValues)
                }

                for(const batchNo of Object.keys(batches)) {
                    const currBatch = batches[batchNo]
                    let prev = 0
                    let first = true
                    for(const batch of currBatch.logs) {
                        if(first) {
                            const match = req.body.IngredientLogs.find(i => i.id === batch.id)
                            if(match.exclude) {
                                batch.exclude = true
                            }
                            console.log("match:",match)
                            if(batch.batchQty === null) {
                                prev = match.qty
                                batch.prevQty = batch.qty
                                batch.qty = match.qty
                                batch.inOut = 'in'
                            } else {
                                prev = match.exclude ? batch.batchQty : batch.batchQty - match.qty
                                batch.prevQty = batch.qty
                                batch.qty = match.exclude ? 0 : match.qty
                                batch.inOut = 'out'
                            }
                            first = false
                        } else {
                            batch.batchQty = prev
                            prev -= batch.qty
                            batch.inOut = 'out'
                        }

                        if(batch.batchQty) {
                            if(batch.batchQty - batch.qty === 0) {
                                currBatch.deleted = true
                            } else if(batch.batchQty - batch.qty < 0) {
                                currBatch.deleted = false
                                currBatch.flagged = true
                            }
                        }
                    }
                }

                await transaction.commit()
                return res.status(200).send({ affectedBatches: batches })
            } else {
                await updateQty(req)
            }
        }

        if (req.body.location) {
            await IngredientLog.update({ location: req.body.location }, {
                where: {
                    logGroup: req.params.id
                },
                transaction
            })

            const batch = await IngredientBatch.findOne({
                where: {
                    ingredientId: logGroup.dataValues.ingredientId,
                    batchNo: req.body.batchNo
                },
                attributes: ['id'],
                transaction
            })
            if(batch) {
                await IngredientBatch.update({ location: req.body.location }, {
                    where: {
                        ingredientId: logGroup.dataValues.ingredientId,
                        batchNo: req.body.batchNo
                    },
                    transaction
                })
            }
        }

        if (req.body.ed !== undefined) {
            await IngredientLogGroup.update({ ed: req.body.ed }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        }

        if (req.body.product) {
            await IngredientLogGroup.update({ inProduct: req.body.product }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        }
        transaction.commit()
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        transaction.rollback()
        return res.sendStatus(500)
    }
})

router.delete('/log/:id', authenticateTokenAndMember, async (req, res) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        const logGroup = await IngredientLogGroup.findOne({
            where: {
                id: req.params.id
            },
            include: [
                {
                    model: IngredientLog,
                    attributes: ['batchNo', 'createdAt']
                }
            ],
            transaction
        })

        if(!logGroup) {
            await transaction.rollback()
            return res.sendStatus(404)
        }

        const user = await User.findOne({
            where: {
                id: req.user.id
            },
            attributes: ['lastIngredientLogId'],
            transaction
        })

        if(req.body.inout === 'in') {
            const rootLog = logGroup.dataValues.IngredientLogs[0]
            await IngredientBatch.destroy({
                where: {
                    ingredientId: logGroup.dataValues.ingredientId,
                    batchNo: rootLog.batchNo
                },
                transaction
            })
            const logHistory = await IngredientLog.findAll({
                include: [
                    {
                        model: IngredientLogGroup,
                        where: {
                            ingredientId: logGroup.dataValues.ingredientId
                        },
                        required: true,
                        attributes: ['inout']
                    }
                ],
                where: {
                    batchNo: rootLog.batchNo,
                    createdAt: {
                        [Op.gte]: rootLog.createdAt
                    }
                },
                order: [['createdAt', 'ASC']],
                attributes: ['id', 'logGroup', 'batchNo', 'qty'],
                raw: true,
                transaction,
            })

            for(const log of logHistory.map(i => {
                const { 'IngredientLogGroup.inout': inOut, ...rest } = i
                return { ...rest, inOut }
            })) {
                await createAudit({
                    ingredientId: logGroup.dataValues.ingredientId,
                    ingredientLogId: log.id,
                    batchNo: log.batchNo,
                    inOut: log.inOut,
                    user: req.user.id,
                    qty: log.qty
                }, 'delete', transaction)

                await IngredientLog.destroy({
                    where: {
                        id: log.id
                    },
                    transaction
                })

                if(user.dataValues.lastIngredientLogId === log.logGroup) {
                    await User.update({
                        lastIngredientLogId: null
                    }, {
                        where: {
                            id: req.user.id
                        },
                        transaction
                    })
                }

                await IngredientLogGroup.destroy({
                    where: {
                        id: log.logGroup
                    },
                    transaction
                })
            }
        } else {
            if(user.dataValues.lastIngredientLogId === req.params.id) {
                await User.update({
                    lastIngredientLogId: null
                }, {
                    where: {
                        id: req.user.id
                    },
                    transaction
                })
            }

            await IngredientLogGroup.destroy({
                where: {
                    id: req.params.id
                },
                transaction
            })
        }

        await transaction.commit()
        return res.sendStatus(200)
    } catch(err) {
        await transaction.rollback()
        console.error(err)
        return res.sendStatus(500)
    }
})

router.delete('/category/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        const foreignKey = await Ingredient.findOne({
            where: {
                category: req.params.id
            }
        })

        if(foreignKey) {
            const category = await IngredientCategory.findOne({
                where: {
                    id: req.params.id
                },
                attributes: ['name'],
                raw: true
            })
            return res.status(400).send({ text1: `Cannot delete category \"${category.name}\".`, text2: 'It is referenced by existing Ingredient.'})
        }

        await IngredientCategory.destroy({
            where: {
                id: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch(err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.delete('/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        await Ingredient.destroy({
            where: {
                id: req.params.id
            }
        })

        await IngredientBatch.destroy({
            where: {
                ingredientId: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

module.exports = { router, convertToBase, convertToUnit }