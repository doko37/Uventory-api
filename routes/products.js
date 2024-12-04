const router = require('express').Router()
const { Op, Sequelize } = require('sequelize')
const db = require('../db')
const sequelize = require('../db')
const { authenticateTokenAndAdmin, authenticateTokenAndMember, authenticateToken } = require('./authToken')
const { convertToBase } = require('./ingredients')
const Product = db.models.Product
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

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
    Product.create({
        name: req.body.name,
        desc: req.body.desc,
        brand: req.body.brand
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.post('/brand', authenticateTokenAndAdmin, async (req, res) => {
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

router.post('/log', authenticateTokenAndMember, async (req, res) => {
    try {
        const product = await Product.findOne({
            where: {
                id: req.body.productId
            }
        })

        const logGroup = await ProductLogGroup.create({
            productId: product.id,
            user: req.user.id,
            location: req.body.location.id || null,
            inout: req.body.inOut,
            qty: req.body.qty,
            unit: req.body.unit,
            ed: req.body.ed,
            remark: req.body.remark || null
        })

        await User.update({
            lastProductLogId: logGroup.dataValues.id
        }, {
            where: {
                id: req.user.id
            }
        })

        if (req.body.inOut === 'in') {
            const log = await ProductLog.create({
                logGroup: logGroup.dataValues.id,
                batchNo: req.body.batchNo,
                expDate: req.body.expDate,
                qty: req.body.qty
            })

            await ProductBatch.create({
                batchNo: req.body.batchNo,
                productId: req.body.productId,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: req.body.qty,
                location: req.body.location.id
            })

            await Product.update({
                qty: product.qty + req.body.qty
            }, {
                where: {
                    id: product.id
                }
            })

            res.sendStatus(200)
        } else {
            if (req.body.qty > product.qty) {
                res.status(401).send("Invalid qty")
                return
            }
            req.body.batchList.forEach(async currBatch => {
                await ProductBatch.update({
                    qty: Sequelize.literal(`qty - ${currBatch.qty}`)
                }, {
                    where: {
                        id: currBatch.id
                    }
                })

                const batch = await ProductBatch.findOne({
                    where: {
                        id: currBatch.id
                    },
                    attributes: ['batchNo', 'qty']
                })

                const batchNo = batch.dataValues.batchNo
                let batchDeleted = false
                if (batch.dataValues.qty <= 0) {
                    await ProductBatch.destroy({
                        where: {
                            id: currBatch.id
                        }
                    })
                    batchDeleted = true
                }

                ProductLog.create({
                    logGroup: logGroup.id,
                    batchNo: batchNo,
                    qty: currBatch.qty,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    batchDeleted: batchDeleted
                })
            })

            await Product.update({
                qty: product.qty - req.body.qty
            }, {
                where: {
                    id: req.body.productId
                }
            })

            res.status(200).send("Load out successful")
        }
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.post('/template', authenticateTokenAndMember, async (req, res) => {
    try {
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
        return res.sendStatus(500)
    }
})

router.get('/templates', authenticateToken, async (req, res) => {
    try {
        let whereCondition
        if (req.query.search) {
            whereCondition = {
                name: { [Op.like]: `%${req.query.search}%` }
            }
        }
        const templates = await ProductTemplate.findAll({
            where: whereCondition,
        })
        return res.status(200).send(templates)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.get('/templates/:id', authenticateToken, async (req, res) => {
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
            })
            const index = template.dataValues.ProductTemplateIngredients.findIndex(i => i.ingredientId === ingredient.dataValues.id)
            template.dataValues.ProductTemplateIngredients[index].dataValues['Ingredient'] = ingredient.dataValues

        }

        return res.status(200).send(template)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.get('/lastLog', authenticateTokenAndMember, async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                id: req.user.id
            }
        })
        if (user && user.lastProductLogId) {
            const log = await ProductLogGroup.findOne({
                where: {
                    id: user.lastProductLogId
                }
            })

            if (!log.dataValues) {
                return res.status(200).send('No log found')
            }
            return res.status(200).send(log)
        }

        return res.status(401).send('No log found')
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.get('/:id/logs', authenticateToken, async (req, res) => {
    try {
        let logs
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
                { '$Location.name$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.firstName$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.lastName$': { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
                { ed: { [Op.like]: `%${req.query.search}%` } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
                { '$Product.name$': { [Op.like]: `%${req.query.search}%` } },
                { id: { [Op.in]: groupIds } }
            ]
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

        logs = await ProductLogGroup.findAll({
            where: whereCondition,
            include: [
                {
                    model: ProductLog,
                    required: true
                },
                {
                    model: Product,
                    required: true
                },
                {
                    model: Location,
                    required: false
                },
                {
                    model: User,
                    required: false
                }
            ],
            order: [
                [sortBy, req.query.dir || 'ASC']
            ]
        })

        res.status(200).send(logs)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/:id/batches', authenticateToken, async (req, res) => {
    try {
        let batches
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

        if (req.query.search) {
            batches = await ProductBatch.findAll({
                where: {
                    productId: req.params.id,
                    [Op.or]: {
                        batchNo: { [Op.like]: `%${req.query.search}` },
                        qty: { [Op.like]: `%${req.query.search}` }
                    }
                },
                order: [
                    [sortBy, req.query.dir]
                ]
            })
        } else {
            batches = await ProductBatch.findAll({
                where: {
                    productId: req.params.id
                },
                order: [
                    [sortBy, req.query.dir]
                ]
            })
        }

        res.status(200).send(batches)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/batch/:id', authenticateToken, async (req, res) => {
    ProductBatch.findOne({
        include: [{
            model: Location,
            required: true
        }],
        where: {
            id: req.params.id
        }
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.get('/brands', async (req, res) => {
    Brand.findAll({
        where: {
            name: { [Op.ne]: 'UBbio' }
        }
    })
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
})

router.get('/:brand/logs', authenticateToken, async (req, res) => {
    try {
        const logs = await ProductLogGroup.findAll({
            include: [{
                model: Product,
                where: {
                    brand: req.params.brand === 'OEM' ? {
                        [Op.ne]: 'UBBio'
                    } : req.params.brand
                }
            }]
        })

        res.status(200).send(logs)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/log/:id', authenticateToken, async (req, res) => {
    try {
        const log = await ProductLogGroup.findOne({
            where: {
                id: req.params.id,
            },
            include: [
                {
                    model: ProductLog,
                    required: true
                },
                {
                    model: User,
                    required: true
                },
                {
                    model: Location,
                    required: false,
                    attributes: ['name']
                }
            ]
        })
        console.log(log.dataValues)
        res.status(200).send(log)
    } catch (err) {
        console.error(err)
        res.status(500).send(err)
    }
})

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const product = await Product.findOne({
            where: {
                id: req.params.id
            }
        })

        res.status(200).send(product)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/brand/:brand', authenticateToken, async (req, res) => {
    try {
        let products
        if (req.query.search) {
            products = await Product.findAll({
                where: {
                    brand: req.params.brand === 'OEM' ? {
                        [Op.ne]: 'UBbio'
                    } : req.params.brand,
                    [Op.or]: {
                        name: { [Op.like]: `%${req.query.search}%` },
                        desc: { [Op.like]: `%${req.query.search}%` },
                        qty: { [Op.like]: `%${req.query.search}%` },
                        memo: { [Op.like]: `%${req.query.search}%` }
                    }
                },
                order: [
                    [req.query.sortBy, req.query.dir]
                ]
            })
        } else {
            products = await Product.findAll({
                where: {
                    brand: req.params.brand === 'OEM' ? {
                        [Op.ne]: 'UBbio'
                    } : req.params.brand
                },
                order: [
                    [req.query.sortBy.toLowerCase(), req.query.dir]
                ]
            })
        }

        res.status(200).send(products)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.put('/:id', authenticateTokenAndMember, async (req, res) => {
    try {
        await Product.update(req.body, {
            where: {
                id: req.params.id
            }
        })

        res.status(200).send(`Updated product (ID: ${req.params.id})`)
    } catch (err) {
        console.error("Failed to update product", err)
        res.status(500).send(err)
    }
})

router.put('/brand/:id', authenticateTokenAndAdmin, async (req, res) => {
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
        return res.sendStatus(500)
    }
})

router.put('/template/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        await ProductTemplate.update({
            name: req.body.name,
            product: req.body.product
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
        return res.sendStatus(500)
    }
})

router.delete('/template/:id', authenticateTokenAndAdmin, async (req, res) => {
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
        return res.sendStatus(500)
    }
})

router.delete('/brand/:id', authenticateTokenAndAdmin, async (req, res) => {
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
        return res.sendStatus(500)
    }
})

module.exports = router
