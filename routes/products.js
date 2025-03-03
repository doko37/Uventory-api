const router = require('express').Router()
const { Op, Sequelize, Transaction } = require('sequelize')
const db = require('../db')
const sequelize = require('../db')
const { authenticateTokenAndAdmin, authenticateTokenAndMember, authenticateToken } = require('./authToken')
const { convertToBase } = require('./ingredients')
const Product = db.models.Product
const ProductCategory = db.models.ProductCategory
const ProductBatch = db.models.ProductBatch
const ProductLog = db.models.ProductLog
const ProductLogGroup = db.models.ProductLogGroup
const ProductTemplate = db.models.ProductTemplate
const ProductTemplateIngredient = db.models.ProductTemplateIngredient
const Brand = db.models.Brand
const User = db.models.User
const Location = db.models.Location
const Ingredient = db.models.Ingredient
const IngredientBatch = db.models.IngredientBatch
const LogAudit = db.models.LogAudit
const { DateTime, Duration } = require('luxon')

router.post('/', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        if(!isNaN(req.body.code) && req.body.code.trim() !== "") {
            return res.status(400).send({ text1: 'Code cannot be a pure numerical value or white space.', text2: 'Please include letters, "/", "-", or "_".' })
        } else if(req.body.code.charAt(0) === "0") {
            return res.status(400).send({ text1: 'Code cannot have trailing zeros.' })
        }
        const product = await Product.findOne({
            where: {
                [Op.or]: [
                    { code: req.body.code },
                    { name: req.body.name }
                ]
            },
            attributes: ['code', 'name'],
            raw: true
        })
    
        if(product) {
            if(typeof req.body.name === 'string' && req.body.name.toLowerCase() === product.name.toLowerCase()) {
                return res.status(400).send({ text1: `Name ${req.body.name} already exists.`, text2: 'Please enter a different name.' })
            } else if(req.body.code === product.code) {
                return res.status(400).send({ text1: `Code ${req.body.code} already exists.`, text2: 'Please enter a different code.' })
            }
        }
    
        await Product.create({
            name: req.body.name,
            memo: req.body.memo,
            brand: req.body.brand,
            category: req.body.category,
            code: req.body.code,
            expirationTime: req.body.expirationTime
        })

        return res.sendStatus(200)
    } catch (err) {
        next(err)
    }
})

router.post('/data-insert', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        for (const i in req.body) {
            const row = req.body[i]

            let category = await ProductCategory.findOne({
                where: {
                    name: row.category.trim()
                }
            })

            if(!category) {
                category = await ProductCategory.create({
                    name: row.category.trim()
                })
            }

            let brand = await Brand.findOne({
                where: {
                    name: row.category.includes("GREENIA") ? 'GREENIA' : 'UBBio'
                }
            })

            if(!brand) {
                brand = await Brand.create({
                    name: row.category.includes("GREENIA") ? 'GREENIA' : 'UBBio'
                })
            }

            let code = row.code

            if(!code) {
                let newCode = 0
                let exists = await Product.findOne({
                    where: {
                        code: String(newCode).padStart(4, '0')
                    }
                })
                while (exists) {
                    newCode++
                    exists = await Product.findOne({
                        where: {
                            code: String(newCode).padStart(4, '0')
                        }
                    })
                }
                code = String(newCode).padStart(4, '0')
            } else {
                let newCode = row.code
                let exists = await Product.findOne({
                    where: {
                        code: newCode
                    }
                })
                while (exists) {
                    newCode += 'A'
                    exists = await Product.findOne({
                        where: {
                            code: newCode
                        }
                    })
                }

                code = newCode
            }

            const product = await Product.create({
                name: row.name,
                category: category.dataValues.id,
                brand: brand.dataValues.id,
                code: code
            })

            const dur = Duration.fromObject({ years: 2 })
            const expDate = DateTime.now().plus(dur).toFormat('yyyy-LL-dd')

            await ProductBatch.create({
                productId: product.dataValues.id,
                batchNo: row.code || "0000",
                qty: row.qty.toFixed(0),
                expDate: expDate,
                poDate: DateTime.now().toFormat('yyyy-LL-dd'),
                location: 17
            })
        }
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.post('/brand', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const brand = await Brand.findOne({
            where: {
                name: req.body.name
            },
            raw: true
        })
        if(brand) {
            return res.status(400).send({ text1: `Brand \"${req.body.name}\" already exists.`, text2: 'Please enter a different name.' })
        }
        await Brand.create({
            name: req.body.name
        })

        res.sendStatus(200)
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }

})

const createAudit = async (req, action, transaction) => {
    try {
        const newItem = {
            logAction: action,
            productLogId: req.productLogId,
            productId: req.productId,
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

router.post('/log', authenticateTokenAndMember, async (req, res, next) => {
    try {
        const inOut = req.body.inOut
        const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
        const product = await Product.findOne({
            where: {
                id: req.body.productId
            },
            attributes: {
                include: [[Sequelize.literal(`(SELECT SUM(qty) FROM ProductBatches WHERE ProductBatches.productId = Product.id)`), 'qty']]
            },
            include: [
                {
                    model: ProductBatch,
                    required: false,
                    attributes: []
                }
            ],
            transaction
        })

        if(inOut === 'in') {
            const batch = await ProductBatch.findOne({
                where: {
                    productId: req.body.productId,
                    batchNo: req.body.batchNo
                },
                transaction
            })

            if(batch) {
                await transaction.rollback()
                return res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${product.dataValues.name}\".`, text2: 'Please enter a different Batch No.'})
            }
        }

        const logGroup = await ProductLogGroup.create({
            productId: product.id,
            user: req.user.id,
            inout: req.body.inOut,
            ed: req.body.ed,
            remark: req.body.remark || null
        }, { transaction })

        await User.update({
            lastProductLogId: logGroup.dataValues.id
        }, {
            where: {
                id: req.user.id
            },
            transaction
        })

        if (req.body.inOut === 'in') {
            const log = await ProductLog.create({
                logGroup: logGroup.dataValues.id,
                batchNo: req.body.batchNo,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: req.body.qty,
                location: req.body.location.id,
            }, { transaction })

            await createAudit({ ...req.body, qty: req.body.qty, productLogId: log.dataValues.id, user: req.user.id, productId: product.dataValues.id }, 'create', transaction)

            await ProductBatch.create({
                batchNo: req.body.batchNo,
                productId: req.body.productId,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: req.body.qty,
                location: req.body.location.id
            }, { transaction })
        } else {
            if (req.body.qty > product.qtySum) {
                res.status(400).send({ text1: 'Qty insufficient' })
                await transaction.rollback()
                return
            }

            for(const index in req.body.batchList) {
                const currBatch = req.body.batchList[index]
                const currQty = currBatch.qty
                const batch = await ProductBatch.findOne({
                    where: {
                        id: currBatch.id
                    },
                    transaction,
                    attributes: ['batchNo', 'qty', 'location']
                })

                const batchNo = batch.dataValues.batchNo
                let deleted = false
                if (batch.dataValues.qty - currQty === 0) {
                    await ProductBatch.destroy({
                        where: {
                            id: currBatch.id
                        }
                    }, { transaction })
                    deleted = true
                } else {
                    await ProductBatch.update({
                        qty: Sequelize.literal(`qty - ${currQty}`)
                    }, {
                        where: {
                            id: currBatch.id,
                        },
                        transaction,
                    })
                }
                const log = await ProductLog.create({
                    logGroup: logGroup.id,
                    batchNo: batchNo,
                    qty: currQty,
                    batchQty: batch.dataValues.qty,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    location: batch.dataValues.location,
                    batchDeleted: deleted
                }, { transaction })

                await createAudit({
                    ...req.body,
                    qty: currQty,
                    productLogId: log.id,
                    prevQty: batch.dataValues.qty,
                    batchNo: batchNo,
                    user: req.user.id,
                    productId: product.dataValues.id
                }, 'create', transaction)
            }
        }
        await transaction.commit()
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.post('/category', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const category = await ProductCategory.findOne({
            where: {
                name: req.body.name
            }
        })

        if(category) {
            return res.status(400).send({ text1: "Category name already exists.", text2: "Please enter a different name." })
        }

        await ProductCategory.create({
            name: req.body.name
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.post('/template', authenticateTokenAndMember, async (req, res, next) => {
    try {
        const template = await ProductTemplate.findOne({
            where: {
                name: req.body.name
            }
        })

        if(template) {
            return res.status(400).send({ text1: 'Template name already exists.', text2: 'Please choose a different name.' })
        }

        const newTemplate = await ProductTemplate.create({
            user: req.user.id,
            name: req.body.name
        })

        req.body.ingredientList.forEach(async ingredient => {
            const qty = convertToBase(ingredient.unit, ingredient.qty)
            await ProductTemplateIngredient.create({
                templateId: newTemplate.dataValues.id,
                ingredientId: ingredient.id,
                qty: qty,
                unit: ingredient.unit
            })
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/categories', authenticateToken, async (req, res, next) => {
    try {
        const categories = await ProductCategory.findAll({
            order: [['name', 'ASC']]
        })
        return res.send(categories).status(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/templates', authenticateToken, async (req, res, next) => {
    try {
        let whereCondition
        if (req.query.search) {
            whereCondition = {
                name: { [Op.like]: `%${req.query.search}%` }
            }
        }
        const templates = await ProductTemplate.findAll({
            where: whereCondition,
            order: [['name', req.query.dir || 'ASC']]
        })
        return res.status(200).send(templates)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/templates/:id', authenticateToken, async (req, res, next) => {
    try {
        const template = await ProductTemplate.findOne({
            where: {
                id: req.params.id
            },
            include: [
                {
                    model: ProductTemplateIngredient,
                    required: true,
                }
            ],
        })

        if(!template) {
            return res.sendStatus(404)
        }

        for(const pti of template.dataValues.ProductTemplateIngredients.map(i => i.dataValues)) {
            const ingredient = await Ingredient.findOne({
                where: {
                    id: pti.ingredientId
                },
                attributes: [
                    'id',
                    'name',
                    'unit',
                    [sequelize.fn('SUM', sequelize.col('IngredientBatches.qty')), 'qtySum']
                ],
                include: [
                    {
                        model: IngredientBatch,
                        required: false,
                        attributes: []
                    }
                ],
                raw: true
            })
            if(ingredient.id) {
                const index = template.dataValues.ProductTemplateIngredients.findIndex(i => i.ingredientId === ingredient['id'])
                template.dataValues.ProductTemplateIngredients[index].dataValues['Ingredient'] = ingredient
            }

        }

        return res.status(200).send(template)
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
        if (user && user.lastProductLogId) {
            const logGroup = await ProductLogGroup.findOne({
                where: {
                    id: user.lastProductLogId
                }
            })

            const log = await ProductLog.findOne({
                where: {
                    logGroup: logGroup.dataValues.id
                },
                attributes: ['location']
            })

            if (!log.dataValues) {
                return res.status(404).send('No log found')
            }
            return res.status(200).send({ ...logGroup.dataValues, location: logGroup.inout === 'in' ? log.dataValues.location : null })
        }

        return res.status(404).send('No log found')
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/checkIngredient/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const data = await ProductTemplate.findAll({
            attributes: ['name'],
            include: [
                {
                    model: ProductTemplateIngredient,
                    required: true,
                    attributes: [],
                    where: {
                        ingredientId: req.params.id
                    }
                }
            ],
            raw: true
        })

        res.status(200).send(data)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/:id/logs', authenticateToken, async (req, res, next) => {
    try {
        let sortBy
        if (req.query.sortBy === 'Date') {
            sortBy = 'createdAt'
        } else if (req.query.sortBy === 'BatchNo') {
            sortBy = 'batchNo'
        } else {
            sortBy = req.query.sortBy.toLocaleLowerCase()
        }

        let whereCondition = {}
        let groupIds = []

        if (req.params.id !== 'all') {
            whereCondition.productId = req.params.id
        }

        if (req.query.inOut) {
            whereCondition.inout = req.query.inOut;
        }

        if (req.query.search) {
            const ids = await ProductLog.findAll({
                attributes: ['logGroup'],
                where: { batchNo: { [Op.like]: `%${req.query.search}%` } }
            })

            groupIds = ids.map(log => log.dataValues.logGroup)

            whereCondition[Op.or] = [
                { '$User.firstName$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.lastName$': { [Op.like]: `%${req.query.search}%` } },
                { '$Product.code$': { [Op.like]: `%${req.query.search}%` } },
                { '$Product.name$': { [Op.like]: `%${req.query.search}%` } },
                { id: { [Op.in]: groupIds } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
                { ed: { [Op.like]: `%${req.query.search}%` } }
            ]
        }

        const limit = req.body.limit || 20
        const page = req.query.page || 1
        const offset = (page - 1) * limit

        if (req.query.startDate && req.query.endDate) {
            const startDate = new Date(req.query.startDate)
            startDate.setHours(0, 0, 0, 0)

            const endDate = new Date(req.query.endDate);
            endDate.setHours(23, 59, 59, 999)

            whereCondition['createdAt'] = {
                [Op.between]: [startDate, endDate]
            }
        }

        const logIds = await ProductLogGroup.findAll({
            where: whereCondition,
            attributes: ['id', 'createdAt'],
            include: [
                {
                    model: Product,
                    attributes: ['id', 'name', 'code'],
                    required: true,
                    paranoid: false
                },
                {
                    model: User,
                    required: false,
                    paranoid: false
                }
            ],
            order: [[sortBy === 'qty' ? Sequelize.literal(`(SELECT SUM(qty) FROM ProductLogs WHERE ProductLogs.logGroup = ProductLogGroup.id AND ProductLogs.deletedAt IS NULL)`) : sortBy, req.query.dir || 'DESC']],
            raw: true,
            limit: limit,
            offset: offset,
            paranoid: true
        })

        const logs = await ProductLogGroup.findAll({
            where: {
                id: { [Op.in]: logIds.map(i => i.id) }
            },
            attributes: {
                include: [
                    [Sequelize.literal(`(SELECT SUM(qty) FROM ProductLogs WHERE ProductLogs.logGroup = ProductLogGroup.id AND ProductLogs.deletedAt IS NULL)`), 'qty']
                ]
            },
            include: [
                {
                    model: ProductLog,
                    attributes: ['id', 'batchNo', 'qty', 'expDate', 'batchDeleted', 'flagged'],
                    required: true,
                    include: [
                        {
                            model: Location,
                            attributes: ['name']
                        }
                    ],
                }
            ],
            order: [[sortBy === 'qty' ? Sequelize.literal(`(SELECT SUM(qty) FROM ProductLogs WHERE ProductLogs.logGroup = ProductLogGroup.id AND ProductLogs.deletedAt IS NULL)`) : sortBy, req.query.dir || 'DESC']],
            paranoid: true
        })

        const joinedLog = logs.map(log => {
            match = logIds.find(i => i.id === log.id)
            return {
                ...log.dataValues,
                productName: match['Product.name'] || 'N/A',
                code: match['Product.code'] || 'N/A',
                locationName: match['Location.name'] || 'N/A'
            }
        })

        res.status(200).send(joinedLog)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/:id/batches', authenticateToken, async (req, res, next) => {
    try {
        let sortBy
        if (req.query.sortBy === 'Exp. Date') {
            sortBy = 'expDate'
        } else if (req.query.sortBy === 'PO Date') {
            sortBy = 'poDate'
        } else if (req.query.sortBy === 'Batch No') {
            sortBy = 'batchNo'
        } else {
            sortBy = 'qty'
        }

        const whereCond = {}
        whereCond.productId = req.params.id

        if(req.query.search) {
            whereCond.batchNo = { [Op.like]: `%${req.query.search}%` }
        }
        
        const batches = await ProductBatch.findAll({
            where: whereCond,
            order: [
                [sortBy, req.query.dir || 'ASC']
            ]
        })
        
        res.status(200).send(batches)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/batch/:id', authenticateToken, async (req, res, next) => {
    try {
        const batch = await ProductBatch.findOne({
            where: {
                id: req.params.id
            },
            include: [
                {
                    model: Location,
                    required: false,
                    attributes: ['name']
                }
            ]
        })

        if(!batch) {
            return res.sendStatus(404)
        }

        return res.status(200).send(batch)
    } catch(err) {
        console.error(err)
        next(err)
    }
})

router.get('/brands', async (req, res, next) => {
    Brand.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => next(err))
})

// router.get('/:brand/logs', authenticateToken, async (req, res, next) => {
//     try {
//         const logs = await ProductLogGroup.findAll({
//             include: [{
//                 model: Product,
//                 where: {
//                     brand: req.params.brand === 'OEM' ? {
//                         [Op.ne]: 'UBBio'
//                     } : req.params.brand
//                 }
//             }]
//         })

//         res.status(200).send(logs)
//     } catch (err) {
//         next(err)
//     }
// })

router.get('/log/:id', authenticateToken, async (req, res, next) => {
    try {
        const log = await ProductLogGroup.findOne({
            where: {
                id: req.params.id,
            },
            attributes: {
                include: [
                    [Sequelize.literal(`(SELECT SUM(qty) FROM ProductLogs WHERE ProductLogs.logGroup = ProductLogGroup.id AND ProductLogs.deletedAt IS NULL)`), 'qty']
                ]
            },
            include: [
                {
                    model: ProductLog,
                    required: false,
                    include: [
                        {
                            model: Location,
                            attributes: []
                        }
                    ],
                    attributes: [
                        'id',
                        [Sequelize.literal(`(SELECT name FROM Locations WHERE Locations.id = ProductLogs.location)`), 'locationName'],
                        [Sequelize.literal(`(SELECT id FROM Locations WHERE Locations.id = ProductLogs.location)`), 'locationId'],
                        'batchNo',
                        'expDate',
                        'qty',
                        'batchQty',
                        'batchDeleted',
                        'flagged'
                    ]
                },
                {
                    model: User,
                    required: true,
                    attributes: ['id','firstName', 'lastName'],
                    paranoid: false
                }
            ]
        })

        res.status(200).send({ ...log.dataValues })
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const product = await Product.findOne({
            where: {
                id: req.params.id
            }
        })

        res.status(200).send(product)
    } catch (err) {
        next(err)
    }
})

router.get('/category/:category', authenticateToken, async (req, res, next) => {
    try {
        let sortBy
        let whereCondition = {}
        if(req.query.sortBy) {
            sortBy = req.query.sortBy.toLowerCase()
        } else {
            sortBy = 'createdAt'
        }

        if (req.params.category !== 'All') {
            whereCondition.category = req.params.category
        }

        if (req.query.search) {
            whereCondition[Op.or] = {
                name: { [Op.like]: `%${req.query.search}%` },
                memo: { [Op.like]: `%${req.query.search}%` },
                code: { [Op.like]: `%${req.query.search}%` }
            }
        }

        if(req.query.brand !== 'All') {
            const brand = await Brand.findOne({
                where: {
                    name: 'UBbio'
                },
                attributes: ['id'],
                raw: true
            })
    
            if(req.query.brand === 'OEM') {
                whereCondition.brand = {
                    [Op.ne]: brand.id
                }
            } else {
                if(req.query.brand === 'UBbio') {
                    whereCondition.brand = brand.id
                } else {
                    whereCondition.brand = req.query.brand
                }
            }
        }
        

        const products = await Product.findAll({
            where: whereCondition,
            attributes: {
                include: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('ProductBatches.qty')), 0), 'qtySum']]
            },
            include: [
                {
                    model: ProductBatch,
                    attributes: []
                }
            ],
            order: [[
                sortBy === 'qty' ? sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('ProductBatches.qty')), 0) : sortBy, 
                req.query.dir || 'ASC'
            ]],
            group: ['Product.id']
        })

        res.status(200).send(products)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

const updateQty = async (req) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        for (const key of Object.keys(req.body.ProductLogs)) {
            const batch = req.body.ProductLogs[key]
            let first = true
            const rootLog = batch.logs[0]

            if(rootLog.exclude) {
                await createAudit({
                    productId: batch.productId,
                    productLogId: rootLog.id,
                    batchNo: key,
                    inOut: rootLog.inOut,
                    qty: rootLog.prevQty,
                    user: req.user.id
                }, 'delete', transaction)
            } else {
                await createAudit({
                    productId: batch.productId,
                    productLogId: rootLog.id,
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
                        await ProductBatch.destroy({
                            where: {
                                productId: batch.productId,
                                batchNo: key
                            },
                            transaction
                        })
                    } else {
                        const existingBatch = await ProductBatch.findOne({
                            where: {
                                productId: batch.productId,
                                batchNo: key
                            },
                            attributes: ['id'],
                            transaction
                        })

                        const diff = log.qty - log.prevQty
                        if(existingBatch) {
                            await ProductBatch.update({
                                qty: log.inOut === 'out' ? sequelize.literal(`qty - ${diff}`) : sequelize.literal(`qty + ${diff}`),
                                flagged: batch.flagged
                            }, {
                                where: {
                                    productId: batch.productId,
                                    batchNo: key
                                },
                                transaction
                            })
                        } else {
                            const batchInfo = await ProductLog.findOne({
                                where: {
                                    id: log.id
                                },
                                attributes: ['expDate', 'poDate', 'location'],
                                transaction
                            })
                            if(batchInfo) {
                                await ProductBatch.create({
                                    productId: batch.productId,
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
                    await ProductLog.destroy({
                        where: {
                            id: log.id
                        },
                        transaction
                    })
                } else {
                    await ProductLog.update({
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
    let logGroup = await ProductLogGroup.findOne({
        where: {
            id: req.params.id
        },
        include: [
            {
                model: ProductLog,
                required: true
            }
        ],
        transaction
    })

    if(!logGroup) return res.sendStatus(404)
    try {
        if (req.body.ProductLogs) {
            const batches = {}
            if(!req.query.confirmed) {
                for(const i in logGroup.dataValues.ProductLogs) {
                    const log = logGroup.dataValues.ProductLogs[i]
                    if(!req.body.ProductLogs.some(i => i.id === log.id)) {
                        continue
                    }
                    const logHistory = await ProductLog.findAll({
                        include: [
                            {
                                model: ProductLogGroup,
                                where: {
                                    productId: logGroup.dataValues.productId
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
                        attributes: ['id','logGroup', 'qty', 'batchQty'],
                        transaction,
                    })

                    if(batches[log.batchNo] === undefined) {
                        batches[log.batchNo] = {
                            logs: [],
                            deleted: false,
                            flagged: false,
                            productId: logGroup.dataValues.productId
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
                            const match = req.body.ProductLogs.find(i => i.id === batch.id)
                            if(match.exclude) {
                                batch.exclude = true
                            }
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
            await ProductLog.update({ location: req.body.location }, {
                where: {
                    logGroup: req.params.id
                },
                transaction
            })

            const batch = await ProductBatch.findOne({
                where: {
                    productId: logGroup.dataValues.productId,
                    batchNo: req.body.batchNo
                },
                attributes: ['id'],
                transaction
            })
            if(batch) {
                await ProductBatch.update({ location: req.body.location }, {
                    where: {
                        productId: logGroup.dataValues.productId,
                        batchNo: req.body.batchNo
                    },
                    transaction
                })
            }
        }

        if(req.body.batchNo) {
            const sameBatch = await ProductBatch.findOne({
                where: {
                    productId: logGroup.dataValues.productId,
                    batchNo: req.body.batchNo
                },
                transaction
            })

            if(sameBatch) {
                const product = await Product.findOne({
                    where: {
                        id: logGroup.dataValues.productId
                    },
                    attributes: ['name'],
                    transaction
                })
                res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${product.dataValues.name}\".`, text2: 'Please enter a different Batch No.'})
                await transaction.rollback();
                return
            }

            const logs = await ProductLog.findAll({
                where: {
                    batchNo: logGroup.dataValues.ProductLogs[0].batchNo
                },
                include: [
                    {
                        model: ProductLogGroup,
                        where: {
                            productId: logGroup.dataValues.productId
                        },
                        attributes: [],
                        required: true
                    }
                ],
                attributes: ['id'],
                transaction
            })
            for(const id of logs.map(i => i.dataValues.id)) {
                await ProductLog.update({
                    batchNo: req.body.batchNo
                }, {
                    where: {
                        id: id
                    },
                    transaction
                }) 
            }

            await ProductBatch.update({
                batchNo: req.body.batchNo
            }, {
                where: {
                    productId: logGroup.dataValues.productId,
                    batchNo: logGroup.dataValues.ProductLogs[0].batchNo
                },
                transaction
            })
        }

        if(req.body.remark) {
            await ProductLogGroup.update({ remark: req.body.remark }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        } else {
            await ProductLogGroup.update({ remark: null }, {
                where: {
                    id: req.params.id
                },
                transaction
            })
        }

        if (req.body.ed !== undefined) {
            await ProductLogGroup.update({ ed: req.body.ed }, {
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
        next(err)
    }
})

router.put('/reserve/:id', authenticateTokenAndMember, async (req, res, next) => {
    User.update({
        reservedProduct: req.params.id
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
        reservedProduct: null
    }, {
        where: {
            id: req.user.id
        }
    }).then(() => res.sendStatus(200)).catch(err => {
        console.error(err)
        next(err)
    })
})

router.put('/brand/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const brand = await Brand.findOne({
            where: {
                name: req.body.name
            },
            raw: true
        })

        if(brand) {
            return res.status(400).send({ text1: `Brand \"${brand.name}\" already exists.`, text2: 'Please enter a different name.' })
        }

        await Brand.update({ name: req.body.name }, {
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

router.put('/category/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const category = await ProductCategory.findOne({
            where: {
                name: req.body.name
            }
        })

        if(category) {
            return res.status(400).send({ text1: "Category name already exists.", text2: "Please enter a different name." })
        }

        await ProductCategory.update({ name: req.body.name }, {
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

router.put('/template/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        await ProductTemplate.update({
            name: req.body.name,
        }, {
            where: {
                id: req.params.id
            }
        })

        await ProductTemplateIngredient.destroy({
            where: {
                templateId: req.params.id
            }
        })

        req.body.ingredientList.forEach(async ingredient => {
            const qty = convertToBase(ingredient.unit, ingredient.qty)
            await ProductTemplateIngredient.create({
                templateId: req.params.id,
                ingredientId: ingredient.id,
                qty: qty,
                unit: ingredient.unit
            })
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.put('/batch/:id', authenticateTokenAndMember, async (req, res, next) => {
    try {
        const batch = await ProductBatch.findOne({
            where: {
                id: req.params.id
            }
        })

        if(req.body.batchNo) {
            const sameBatch = await ProductBatch.findOne({
                where: {
                    productId: batch.dataValues.productId,
                    batchNo: req.body.batchNo
                }
            })

            if(sameBatch) {
                const product = await Product.findOne({
                    where: {
                        id: batch.dataValues.productId
                    },
                    attributes: ['name']
                })
                return res.status(400).send({ text1: `Batch No \"${req.body.batchNo}\" already exists for \"${product.dataValues.name}\".`, text2: 'Please enter a different Batch No.'})
            }
            const logs = await ProductLog.findAll({
                where: {
                    batchNo: batch.batchNo
                },
                include: [
                    {
                        model: ProductLogGroup,
                        where: {
                            productId: batch.dataValues.productId
                        },
                        attributes: [],
                        required: true
                    }
                ],
                attributes: ['id']
            })
            for(const id of logs.map(i => i.dataValues.id)) {
                await ProductLog.update({
                    batchNo: req.body.batchNo
                }, {
                    where: {
                        id: id
                    },
                })
            }
        }
        
        if(req.body.qty) {
            await LogAudit.create({
                logAction: 'update',
                productId: batch.productId,
                batchNo: batch.batchNo,
                qty: req.body.qty,
                prevQty: batch.qty,
                user: req.user.id,
                inOut: null,
                createdAt: DateTime.now().toISO()
            })
        }

        await ProductBatch.update(req.body, {
            where: {
                id: req.params.id
            }
        })
        res.status(200).send(`Updated product batch (ID: ${req.params.id})`)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.put('/:id', authenticateTokenAndMember, async (req, res, next) => {
    try {
        if(req.body.name) {
            const matching = await Product.findOne({
                where: {
                    name: req.body.name
                }
            })
            if(matching) {
                return res.status(400).send({ text1: `Name \"${req.body.name}\" already exists.`, text2: 'Please enter a different name.' })
            }
        }
        if(req.body.code) {
            if(!isNaN(req.body.code) && req.body.code.trim() !== "") {
                return res.status(400).send({ text1: 'Code cannot be a pure numerical value or white space.', text2: 'Please include letters, "/", "-", or "_".' })
            } else if(req.body.code.charAt(0) === "0") {
                return res.status(400).send({ text1: 'Code cannot have trailing zeros.' })
            }
            let matching = await Product.findOne({
                where: {
                    code: req.body.code
                }
            })
            if(matching) {
                return res.status(400).send({ text1: `Code \"${req.body.code}\" already exists.`, text2: 'Please enter a different code.' })
            }
        }

        await Product.update(req.body, {
            where: {
                id: req.params.id
            }
        })
        res.status(200).send(`Updated product (ID: ${req.params.id})`)
    } catch (err) {
        console.error("Failed to update product", err)
        next(err)
    }
})

router.delete('/log/:id', authenticateTokenAndMember, async (req, res, next) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        console.log(req.body)
        const logGroup = await ProductLogGroup.findOne({
            where: {
                id: req.params.id
            },
            include: [
                {
                    model: ProductLog,
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
            attributes: ['lastProductLogId'],
            transaction
        })

        if(req.body.inout === 'in') {
            const rootLog = logGroup.dataValues.ProductLogs[0]
            await ProductBatch.destroy({
                where: {
                    productId: logGroup.dataValues.productId,
                    batchNo: rootLog.batchNo
                },
                transaction
            })
            const logHistory = await ProductLog.findAll({
                include: [
                    {
                        model: ProductLogGroup,
                        where: {
                            productId: logGroup.dataValues.productId
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

            console.log(logHistory)

            for(const log of logHistory.map(i => {
                const { 'ProductLogGroup.inout': inOut, ...rest } = i
                return { ...rest, inOut }
            })) {
                await createAudit({
                    productId: logGroup.dataValues.productId,
                    productLogId: log.id,
                    batchNo: log.batchNo,
                    inOut: log.inOut,
                    user: req.user.id,
                    qty: log.qty
                }, 'delete', transaction)

                await ProductLog.destroy({
                    where: {
                        id: log.id
                    },
                    transaction
                })

                if(user.dataValues.lastProductLogId === log.logGroup) {
                    await User.update({
                        lastProductLogId: null
                    }, {
                        where: {
                            id: req.user.id
                        },
                        transaction
                    })
                }

                await ProductLogGroup.destroy({
                    where: {
                        id: log.logGroup
                    },
                    transaction
                })
            }
        } else {
            if(user.dataValues.lastProductLogId === req.params.id) {
                await User.update({
                    lastProductLogId: null
                }, {
                    where: {
                        id: req.user.id
                    },
                    transaction
                })
            }

            await ProductLogGroup.destroy({
                where: {
                    id: req.params.id
                },
                transaction
            })

            await ProductLog.destroy({
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
        next(err)
    }
})

router.delete('/batch/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const batch = await ProductBatch.findOne({
            where: {
                id: req.params.id
            }
        })
        if(!batch) {
            return res.sendStatus(404)
        }

        await LogAudit.create({
            logAction: 'delete',
            productId: batch.productId,
            batchNo: batch.batchNo,
            qty: batch.qty,
            user: req.user.id,
            inOut: null,
            createdAt: DateTime.now().toISO()
        })

        await batch.destroy()
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.delete('/category/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const product = await Product.findOne({
            where: {
                category: req.params.id
            }
        })
        const category = await ProductCategory.findOne({
            where: {
                id: req.params.id
            }
        })
        if(!category) {
            return res.sendStatus(404)
        }
        if(product) {
            return res.status(400).send({ text1: `Cannot delete category \"${category.dataValues.name}\".`, text2: 'It is referenced by existing products.' })
        }
        category.name = null
        await category.save()
        await category.destroy()
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.delete('/template/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        await ProductTemplateIngredient.destroy({
            where: {
                templateId: req.params.id
            }
        })

        await ProductTemplate.destroy({
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

router.delete('/brand/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const product = await Product.findOne({
            where: {
                brand: req.params.id
            },
            attributes: ['id'],
            raw: true
        })

        if(product) {
            const brand = await Brand.findOne({
                where: {
                    id: req.params.id
                },
                raw: true
            })
            return res.status(400).send({ text1: `Cannot delete brand \"${brand.name}\".`, text2: 'It is referenced by existing products.' })
        }

        await Brand.destroy({
            where:{ 
                id: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch (err) {
        next(err)
    }
})

router.delete('/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const product = await Product.findOne({
            where: {
                id: req.params.id
            }
        })

        product.code = null
        product.name = null
        await product.destroy()

        await ProductBatch.destroy({
            where: {
                productId: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch(err) {
        console.error(err)
        next(err)
    }
})

module.exports = router
