const router = require('express').Router()
const { Op, Sequelize, Transaction } = require('sequelize')
const db = require('../db')
const sequelize = require('../db')
const Ingredient = db.models.Ingredient
const IngredientCategory = db.models.IngredientCategory
const IngredientBatch = db.models.IngredientBatch
const IngredientLog = db.models.IngredientLog
const IngredientLogGroup = db.models.IngredientLogGroup
const ProductTemplateIngredient = db.models.ProductTemplateIngredient
const Location = db.models.Location
const Product = db.models.Product
const User = db.models.User
const Notification = db.models.Notification
const Ed = db.models.Ed
const LogAudit = db.models.LogAudit
const { authenticateTokenAndAdmin } = require('./authToken')
const { authenticateTokenAndMember } = require('./authToken')
const { authenticateToken } = require('./authToken')
const { DateTime } = require('luxon')

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
    if (toUnit === 'ea') return amount
    const fromUnit = toUnit.includes('g') ? 'mg' : 'ml'
    const multiplier = Math.pow(1000, (unitMap.get(fromUnit) - unitMap.get(toUnit)))
    return amount * multiplier
}

router.post('/', authenticateTokenAndAdmin, async (req, res, next) => {
    if(!isNaN(req.body.code) && req.body.code.trim() !== "") {
        return res.status(400).send({ text1: 'Code cannot be a pure numerical value or white space.', text2: 'Please include letters, "/", "-", or "_".' })
    } else if(req.body.code.charAt(0) === "0") {
        return res.status(400).send({ text1: 'Code cannot have trailing zeros.' })
    }

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
            receiver: req.body.receiver,
            expirationTime: req.body.expirationTime
        }, { transaction });

        await transaction.commit();

        req.io.emit('new_ingredient');
        return res.status(200).send(newIngredient);

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        return next(err);
}

})

router.post('/category', authenticateTokenAndAdmin, async (req, res, next) => {
    IngredientCategory.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => next(err))
})

const createAudit = async (req, action, transaction) => {
    try {
        const newItem = {
            logAction: action,
            ingredientLogId: req.ingredientLogId,
            ingredientId: req.ingredientId,
            batchNo: req.batchNo,
            qty: req.qty || null,
            user: req.user,
            inOut: req.inOut,
            createdAt: req.createdAt || null
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

router.post('/log', authenticateTokenAndMember, async (req, res, next) => {
    const inOut = req.body.inOut
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        const qty = convertToBase(req.body.unit, req.body.qty)
        const ingredient = await Ingredient.findOne({
            where: {
                id: req.body.ingredientId
            },
            attributes: {
                include: [[sequelize.fn('COALESCE', Sequelize.literal(`(SELECT SUM(qty) FROM IngredientBatches WHERE IngredientBatches.ingredientId = Ingredient.id)`), 0), 'qtySum']]
            },
            include: [
                {
                    model: IngredientBatch,
                    required: false,
                    attributes: []
                }
            ],
            raw: true,
            transaction
        })

        if(inOut === 'in') {
            const batch = await IngredientBatch.findOne({
                where: {
                    ingredientId: req.body.ingredientId,
                    batchNo: req.body.batchNo
                },
                transaction
            })

            if(batch) {
                await transaction.rollback()
                return res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${ingredient.name}\".`, text2: 'Please enter a different Batch No.'})
            }
        }

        const logGroup = await IngredientLogGroup.create({
            ingredientId: ingredient.id,
            inProduct: req.body.inProduct || null,
            user: req.user.id,
            inout: inOut,
            unit: req.body.unit,
            remark: req.body.remark || null,
            ed: req.body.ed,
            createdAt: req.body.createdAt || null
        }, { transaction })

        await User.update({
            lastIngredientLogId: logGroup.id
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

            await createAudit({ ...req.body, qty: qty, ingredientLogId: log.id, user: req.user.id, ingredientId: ingredient.id }, 'create', transaction)

            await IngredientBatch.create({
                batchNo: req.body.batchNo,
                ingredientId: ingredient.id,
                logId: log.id,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: qty,
                location: req.body.location.id,
            }, { transaction })

            if (ingredient.qtySum + qty > ingredient.stockAlert && ingredient.alertDismissed) {
                await Ingredient.update({ alertDismissed: false }, {
                    where: {
                        id: req.body.ingredientId
                    },
                    transaction
                })
            }

        } else {
            if (!req.body.force && qty > ingredient.qtySum) {
                // res.status(400).send({ text1: 'Qty insufficient' })
                await transaction.rollback()
                return false
            }

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

                const batchNo = batch.batchNo
                let deleted = false
                if (batch.qty - currQty === 0) {
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
                    batchQty: batch.qty,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    location: batch.location,
                    unit: ingredient.unit,
                    batchDeleted: deleted
                }, { transaction })

                await createAudit({
                    ...req.body,
                    qty: currQty,
                    ingredientLogId: log.id,
                    prevQty: batch.qty,
                    batchNo: batchNo,
                    user: req.user.id,
                    ingredientId: ingredient.id
                }, 'create', transaction)
            }

            if (ingredient.qtySum - qty < ingredient.stockAlert && !ingredient.alertDismissed) {
                const dp = ingredient.unit === 'ea' ? 0 : 3
                const msg = `${ingredient.name} qty is low! (${convertToUnit(ingredient.unit, ingredient.qtySum - qty).toFixed(dp)}${ingredient.unit}/${convertToUnit(ingredient.unit, ingredient.stockAlert).toFixed(dp)}${ingredient.unit})`
                await Notification.create({
                    ingredientId: ingredient.id,
                    type: 'lowStock',
                    msg: msg
                }, { transaction })
                req.io.emit('notification')
            }
        }
        await transaction.commit()
        return res.sendStatus(200)
    } catch (err) {
        await transaction.rollback()
        console.error(err)
        next(err)
    }
})

router.post('/code', authenticateTokenAndAdmin, async (req, res, next) => {
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

router.get('/export-log-to-csv', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        
    } catch (err) {
        next(err)
    }
})

router.get('/category/:category', authenticateToken, async (req, res, next) => {
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
                // { '$IngredientBatches.batchNo$': { [Op.like]: `%${req.query.search}%` } }
            ];
        } else if (req.params.category !== 'All') {
            whereCondition.category = req.params.category
        }

        const limit = req.body.limit || 20
        const page = req.query.page || 1
        const offset = (page - 1) * limit

        ingredients = await Ingredient.findAll({
            where: whereCondition,
            attributes: {
                include: [[sequelize.fn('COALESCE', Sequelize.literal(`(SELECT SUM(qty) FROM IngredientBatches WHERE IngredientBatches.ingredientId = Ingredient.id)`), 0), 'qtySum']]
            },
            include: [
                {
                    model: IngredientBatch,
                    required: false,
                    attributes: ['expDate']
                }
            ],
            order: [
                [sortBy === 'qty' ?
                    sequelize.fn('COALESCE', Sequelize.literal(`(SELECT SUM(qty) FROM IngredientBatches WHERE IngredientBatches.ingredientId = Ingredient.id)`), 0) :
                    sortBy, req.query.dir || 'ASC']
            ],
            limit: limit,
            offset: offset
        })
        res.status(200).send(ingredients)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/categories', authenticateToken, async (req, res, next) => {
    IngredientCategory.findAll({
        attributes: ['id', 'name'],
        order: [['name', 'ASC']]
    })
        .then(data => res.status(200).send(data))
        .catch(err => next(err))
})

router.get('/:id/batches', authenticateToken, async (req, res, next) => {
    try {
        const whereCond = {}
        whereCond.ingredientId = req.params.id
        if (req.query.search) {
            whereCond.batchNo = { [Op.like]: `%${req.query.search}%` }
        }

        let sortBy = 'expDate'
        if (req.query.sortBy === 'qty') {
            sortBy = 'qty'
        } else if (req.query.sortBy === 'poDate') {
            sortBy = 'poDate'
        }
        
        if(req.query.beforeDate) {
            const date = new Date(req.query.beforeDate)
            if(!isNaN(date)) {
                whereCond.createdAt = { [Op.lte]: date }
            }
        }

        let batches = await IngredientBatch.findAll({
            where: whereCond,
            order: [
                [sortBy, req.query.dir === 'DESC' ? 'DESC' : 'ASC'],
                ['batchNo', 'ASC']
            ],
            raw: true
        })

        console.log(batches)

        if(req.query.beforeDate) {
            const result = {}
            for (const batch of batches) {
                const prevLog = await IngredientLog.findOne({
                    where: {
                        createdAt: { [Op.lt]: req.query.beforeDate },
                        batchNo: batch.batchNo
                    },
                    include: [
                        {
                            model: IngredientLogGroup,
                            where: {
                                ingredientId: req.params.id
                            },
                            attributes: [],
                            required: true
                        }
                    ],
                    attributes: ['qty', 'batchQty'],
                    order: [["createdAt", "DESC"]],
                    raw: true
                })

                result[batch.batchNo] = {
                    ...batch,
                    batchQty: prevLog ? prevLog.batchQty ? prevLog.batchQty - prevLog.qty : prevLog.qty : null
                }
            }

            res.status(200).send(result)
        } else {
            res.status(200).send(batches)
        }
    } catch (err) {
        next(err)
    }
})

router.get('/batch/:id', authenticateToken, async (req, res, next) => {
    try {
        const batch = await IngredientBatch.findOne({
            where: {
                id: req.params.id
            }
        })

        if(!batch) {
            return res.sendStatus(404)
        }

        res.status(200).send(batch)
    } catch (err) {
        next(err)
    }
})

router.get('/:id/logs', authenticateToken, async (req, res, next) => {
    try {
        let sortBy
        if (req.query.sortBy === 'Date' || !req.query.sortBy) {
            sortBy = 'createdAt'
        } else {
            sortBy = req.query.sortBy.toLowerCase()
        }

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

        if(req.query.search) {
            const ids = await IngredientLog.findAll({
                attributes: ['logGroup'],
                where: { batchNo: { [Op.like]: `%${req.query.search}%` } },
                raw: true
            });
    
            groupIds = ids.map(log => log.logGroup);

            whereCondition[Op.or] = [
                { '$User.firstName$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.lastName$': { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.name$': { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.code$': { [Op.like]: `%${req.query.search}%` } },
                { id: { [Op.like]: `%${req.query.search}%` } },
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
                    attributes: [],
                    paranoid: false
                },
                {
                    model: Ingredient,
                    attributes: ['id', 'code', 'unit'],
                    required: true,
                    paranoid: false
                }
            ],
            order: [[sortBy === 'qty' ? Sequelize.literal(`(SELECT SUM(qty) FROM IngredientLogs WHERE IngredientLogs.logGroup = IngredientLogGroup.id AND IngredientLogs.deletedAt IS NULL)`) : sortBy, req.query.dir || 'DESC']],
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
            paranoid: true
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
        next(err)
    }
})

router.get('/lastLog', authenticateTokenAndMember, async (req, res, next) => {
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
        next(err)
    }
})

router.get('/log/:id', authenticateToken, async (req, res, next) => {
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
                    attributes: ['id', 'name', 'unit'],
                },
                {
                    model: Product,
                    attributes: ['id', 'name'],
                    required: false
                },
                {
                    model: User,
                    attributes: ['firstName', 'lastName'],
                    paranoid: false
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
        next(err)
    }
})

router.get('/reserved', authenticateTokenAndMember, async (req, res, next) => {
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

router.get('/:id', authenticateToken, async (req, res, next) => {
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
        .catch(err => next(err))
})

router.put('/category/:id', authenticateTokenAndAdmin, async (req, res, next) => {
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
        next(err)
    }
})

router.put('/reserve/:id', authenticateTokenAndMember, async (req, res, next) => {
    User.update({
        reservedIngredient: req.params.id
    }, {
        where: {
            id: req.user.id
        }
    }).then(() => res.sendStatus(200)).catch(err => {
        console.error(err)
        next(err)
    })
})

router.put('/unreserve', authenticateTokenAndMember, async (req, res, next) => {
    User.update({
        reservedIngredient: null
    }, {
        where: {
            id: req.user.id
        }
    }).then(() => res.sendStatus(200)).catch(err => {
        console.error(err)
        next(err)
    })
})

router.put('/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        let editList = req.body
        if (req.body.stockAlert) {
            editList = { ...req.body, stockAlert: convertToBase(req.body.unit, req.body.stockAlert) }
        }
        
        if (req.body.name) {
            const ingredient = await Ingredient.findOne({
                where: {
                    name: req.body.name
                }
            })

            if (ingredient) {
                return res.status(400).send({ text1: `Name \"${req.body.name}\" already exists.`, text2: 'Please enter a different name' })
            }
        }

        if(req.body.code) {
            if(!isNaN(req.body.code) && req.body.code.trim() !== "") {
                return res.status(400).send({ text1: 'Code cannot be a pure numerical value or white space.', text2: 'Please include letters, "/", "-", or "_".' })
            } else if(req.body.code.charAt(0) === "0") {
                return res.status(400).send({ text1: 'Code cannot have trailing zeros.' })
            }
            const ing = await Ingredient.findOne({
                where: {
                    id: req.body.code
                },
                raw: true
            })

            if(ing) {
                return res.status(400).send({ text1: `Code "${req.body.code}" already exists.`, text2: 'Please enter a different code.' })
            }
        }

        await Ingredient.update(editList, {
            where: {
                id: req.params.id
            }
        })

        res.status(200).send(`Updated ingredient (ID: ${req.params.id})`)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.put('/batch/:id', authenticateTokenAndMember, async (req, res, next) => {
    try {
        const batch = await IngredientBatch.findOne({
            where: {
                id: req.params.id
            }
        })

        const editList = req.body

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

            editList.batchNo = req.body.batchNo
        }

        await IngredientBatch.update(editList, {
            where: {
                id: req.params.id
            }
        })
        res.status(200).send(`Updated ingredient batch (ID: ${req.params.id})`)
    } catch (err) {
        console.error(err)
        next(err)
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

router.put('/log/:id', authenticateTokenAndMember, async (req, res, next) => {
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

    if(!logGroup) {
        await transaction.commit()
        return res.sendStatus(404)
    }
    try {
        if (req.body.IngredientLogs) {
            const batches = {}
            if(!req.query.confirmed) {
                const combinedSet = req.body.IngredientLogs.map(log => ({...log, new: true}))
                for(log of logGroup.dataValues.IngredientLogs) {
                    if(!req.body.IngredientLogs.some(i => i.batchNo === log.batchNo)) {
                        const batch = await IngredientBatch.findOne({
                            where: {
                                ingredientId: logGroup.dataValues.ingredientId,
                                batchNo: log.batchNo
                            },
                            attributes: ['id'],
                            raw: true
                        })
                        combinedSet.push({
                            id: batch ? batch.id : null,
                            batchNo: log.batchNo,
                            batchQty: log.batchQty,
                            expDate: log.expDate,
                            createdAt: log.createdAt,
                            qty: 0,
                            exclude: true
                        })
                    }
                }

                for(const log of combinedSet) {
                    console.log("log:", log)
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
                                [Op.gte]: logGroup.dataValues.createdAt
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
                            ingredientId: logGroup.dataValues.ingredientId,
                            exclude: log.exclude
                        }
                        if(log.new) {
                            console.log("log is new:", log)
                            const prevLog = await IngredientLog.findOne({
                                where: {
                                    createdAt: { [Op.lt]: logGroup.dataValues.createdAt },
                                    batchNo: log.batchNo
                                },
                                include: [
                                    {
                                        model: IngredientLogGroup,
                                        where: {
                                            ingredientId: logGroup.dataValues.ingredientId
                                        },
                                        attributes: [],
                                        required: true
                                    }
                                ],
                                attributes: ['qty', 'batchQty'],
                                order: [["createdAt", "DESC"]],
                                raw: true
                            })
                            batches[log.batchNo].logs.push({
                                id: null,
                                logGroup: logGroup.dataValues.id,
                                qty: log.qty,
                                batchQty: prevLog ? prevLog.batchQty || prevLog.qty : null,
                                unit: req.body.unit
                            })
                        }
                    }

                    if(logHistory.length > 40) {
                        return res.status(400).send({ text1: 'Log is too far back in history' })
                    }
                    batches[log.batchNo].logs.push(...logHistory.map(i => i.dataValues))
                }

                for(const batchNo of Object.keys(batches)) {
                    const currBatch = batches[batchNo]
                    let prev = 0
                    let first = true
                    console.log(batchNo)
                    if(currBatch.logs.length === 0) {
                        const newLog = combinedSet.find(i => i.batchNo === batchNo)
                        currBatch.logs.push({
                            id: null,
                            logGroup: logGroup.dataValues.id,
                            qty: newLog.qty,
                            batchQty: newLog.batchQty,
                            expDate: newLog.expDate,
                            unit: req.body.unit,
                            inOut: newLog.batchQty ? 'out' : 'in'
                        })
                    } else {
                        for(const batch of currBatch.logs) {
                            if(first) {
                                const match = combinedSet.find(i => i.batchNo === batchNo)
                                console.log(match)
                                if(batch.batchQty === null) {
                                    prev = match.qty
                                    batch.prevQty = batch.qty
                                    batch.qty = match.qty
                                    batch.inOut = 'in'
                                } else {
                                    prev = batch.batchQty - match.qty
                                    batch.prevQty = batch.qty
                                    batch.qty = match.qty
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
                            console.log(currBatch)
                        }
                    }
                }
                console.log(batches)
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

        if(req.body.batchNo) {
            const sameBatch = await IngredientBatch.findOne({
                where: {
                    ingredientId: logGroup.dataValues.ingredientId,
                    batchNo: req.body.batchNo
                },
                transaction
            })

            if(sameBatch) {
                const ingredient = await Ingredient.findOne({
                    where: {
                        id: logGroup.dataValues.ingredientId
                    },
                    attributes: ['name'],
                    transaction
                })
                res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${ingredient.dataValues.name}\".`, text2: 'Please enter a different Batch No.'})
                await transaction.rollback();
                return
            }

            const logs = await IngredientLog.findAll({
                where: {
                    batchNo: logGroup.dataValues.IngredientLogs[0].batchNo
                },
                include: [
                    {
                        model: IngredientLogGroup,
                        where: {
                            ingredientId: logGroup.dataValues.ingredientId
                        },
                        attributes: [],
                        required: true
                    }
                ],
                attributes: ['id'],
                transaction
            })
            for(const id of logs.map(i => i.dataValues.id)) {
                await IngredientLog.update({
                    batchNo: req.body.batchNo
                }, {
                    where: {
                        id: id
                    },
                    transaction
                }) 
            }

            await IngredientBatch.update({
                batchNo: req.body.batchNo
            }, {
                where: {
                    ingredientId: logGroup.dataValues.ingredientId,
                    batchNo: logGroup.dataValues.IngredientLogs[0].batchNo
                },
                transaction
            })
        }

        if (req.body.ed !== undefined) {
            await IngredientLogGroup.update({ ed: req.body.ed }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        }

        if (req.body.Product) {
            await IngredientLogGroup.update({ inProduct: req.body.Product.id }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        }

        if(req.body.remark) {
            await IngredientLogGroup.update({ remark: req.body.remark }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        } else {
            await IngredientLogGroup.update({ remark: null }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        }

        await transaction.commit()
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        await transaction.rollback()
        next(err)
    }
})

router.delete('/batch/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const batch = await IngredientBatch.findOne({
            where: {
                id: req.params.id
            },
            raw: true
        })
        if(!batch) {
            return res.sendStatus(404)
        }

        await LogAudit.create({
            logAction: 'delete',
            ingredientId: batch.ingredientId,
            batchNo: batch.batchNo,
            qty: batch.qty,
            user: req.user.id,
            inOut: null,
            createdAt: DateTime.now().toISO()
        })

        await IngredientBatch.destroy({
            where: {
                id: req.params.id
            }
        })
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})


router.delete('/log/:id', authenticateTokenAndMember, async (req, res, next) => {
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

            await IngredientLog.destroy({
                where: {
                    logGroup: req.params.id
                },
                transaction
            })
        }

        await transaction.commit()
        return res.sendStatus(200)
    } catch(err) {
        await transaction.rollback()
        console.error(err)
        next(err)
    }
})

router.delete('/category/:id', authenticateTokenAndAdmin, async (req, res, next) => {
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
        next(err)
    }
})

router.delete('/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const ingredient = await Ingredient.findOne({
            where: {
                id: req.params.id
            }
        })

        if(!ingredient) return req.sendStatus(404)
        
        ingredient.code = null
        ingredient.name = null
        await ingredient.save()

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

        await ProductTemplateIngredient.destroy({
            where: {
                ingredientId: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

module.exports = { router, convertToBase, convertToUnit, createAudit }