const router = require('express').Router()
const { Op } = require('sequelize')
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateTokenAndMember, authenticateToken } = require('./authToken')
const Product = db.models.Product
const ProductBatch = db.models.ProductBatch
const ProductLog = db.models.ProductLog
const Brand = db.models.Brand
const User = db.models.User
const Location = db.models.Location

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
    Brand.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.post('/log', authenticateTokenAndMember, async (req, res) => {
    try {
        console.log(req.user)
        const product = await Product.findOne({
            where: {
                id: req.body.productId
            }
        })

        if (req.body.inOut === 'in') {
            await ProductBatch.create({
                batchNo: req.body.batchNo,
                productId: req.body.productId,
                expDate: req.body.expDate,
                poDate: req.body.poDate,
                qty: req.body.qty,
                location: req.body.location.id
            })

            const log = await ProductLog.create({
                productId: req.body.productId,
                batchNo: req.body.batchNo,
                user: req.user.id,
                inout: req.body.inOut,
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

            res.status(200).send(log)
        } else {
            let remainder = req.body.qty
            if (remainder > product.qty) {
                console.log(product)
                res.status(400).send("Invalid qty")
                return
            }
            const batches = await ProductBatch.findAll({
                where: {
                    productId: req.body.productId
                },
                order: [
                    ['expDate', 'ASC']
                ]
            })

            let index = 0
            while (remainder > 0) {
                const batch = batches[index]
                if (remainder < batch.qty) {
                    ProductBatch.update({
                        qty: batch.qty - remainder
                    }, {
                        where: {
                            id: batch.id
                        }
                    })

                    ProductLog.create({
                        productId: req.body.productId,
                        batchNo: batch.batchNo,
                        user: req.user.id,
                        inout: req.body.inOut,
                        qty: remainder,
                        location: req.body.location.id
                    })

                    remainder = 0
                } else {
                    ProductLog.create({
                        productId: req.body.productId,
                        batchNo: batch.batchNo,
                        user: req.user.id,
                        inout: req.body.inOut,
                        qty: batch.qty,
                        location: req.body.location.id
                    })

                    ProductBatch.destroy({
                        where: {
                            id: batch.id
                        }
                    })

                    remainder -= batch.qty
                }

                index++;
            }
            await product.update({
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

router.get('/logs', authenticateToken, async (req, res) => {
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

        if (req.query.inOut) {
            whereCondition.inout = req.query.inOut;
        }

        if (req.query.search) {
            whereCondition[Op.or] = [
                { batchNo: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
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

        logs = await ProductLog.findAll({
            where: whereCondition,
            order: [
                [sortBy, req.query.dir]
            ]
        })

        res.status(200).send(logs)
    } catch (err) {
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
    Brand.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
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

        let whereCondition = {
            productId: req.params.id
        }

        if (req.query.inOut) {
            whereCondition.inout = req.query.inOut;
        }

        if (req.query.search) {
            whereCondition[Op.or] = [
                { batchNo: { [Op.like]: `%${req.query.search}%` } },
                { qty: { [Op.like]: `%${req.query.search}%` } },
                { remark: { [Op.like]: `%${req.query.search}%` } },
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

        logs = await ProductLog.findAll({
            where: whereCondition,
            order: [
                [sortBy, req.query.dir]
            ]
        })

        res.status(200).send(logs)
    } catch (err) {
        res.status(500).send(err)
    }
})

router.get('/:brand/logs', authenticateToken, async (req, res) => {
    try {
        const logs = await ProductLog.findAll({
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
        const log = await ProductLog.findOne({
            include: [
                {
                    model: Location,
                    attributes: ['name']
                },
                {
                    model: Product,
                    attributes: ['name']
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
        res.status(200).send({ ...log.dataValues })
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

module.exports = router
