const router = require('express').Router()
const db = require('../db')
const sequelize = require('../db')
const { Op, Transaction, Sequelize } = require('sequelize')
const { convertToBase, convertToUnit, createAudit } = require('./ingredients')
const AWS = require('aws-sdk')
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager')
const { authenticateTokenAndAdmin } = require('./authToken')
const Supplier = db.models.Supplier
const Ingredient = db.models.Ingredient
const IngredientCategory = db.models.IngredientCategory
const IngredientLog = db.models.IngredientLog
const IngredientLogGroup = db.models.IngredientLogGroup
const IngredientBatch = db.models.IngredientBatch
const Product = db.models.Product
const ProductBatch = db.models.ProductBatch
const ProductLog = db.models.ProductLog
const ProductLogGroup = db.models.ProductLogGroup
const ProductCategory = db.models.ProductCategory
const Location = db.models.Location
const Notification = db.models.Notification
const LogAudit = db.models.LogAudit
const User = db.models.User
const Brand = db.models.Brand
const ProductTemplate = db.models.ProductTemplate
const ProductTemplateIngredient = db.models.ProductTemplateIngredient
const fs = require('fs')
const path = require('path')
const converter = require('json-2-csv')
const multer = require('multer')
const { DateTime } = require('luxon')
const upload = multer({ dest: 'uploads/' })
const csv = require('csvtojson')
const { processIngredientLogs, postIngredients, processProductLogs, postProducts } = require('../importFunctions')

const csvHeaders = {
    IngredientLogs: [
        'date',
        'ingredientCode',
        'batchNo',
        'inout',
        'qty',
        'unit',
        'inProduct',
        'expDate',
        'poDate',
        'location',
        'user',
        'userId',
        'ed',
        'remark'
    ],
    ProductLogs: [
        'date',
        'product',
        'productCode',
        'batchNo',
        'inout',
        'qty',
        'expDate',
        'poDate',
        'location',
        'user',
        'userId',
        'ed',
        'remark'
    ],
    Ingredients: [
        "code", 
        "name", 
        "category", 
        "supplier", 
        "stockAlert", 
        "unit", 
        "ed", 
        "reciever", 
        "createdAt", 
        "expirationTime", 
        "categoryId", 
        "supplierId"
    ],
    Products: [
        "code",
        "name",
        "category",
        "brand",
        "expirationTime",
        "createdAt"
    ]
}

const checkSecret = async (req, res, next) => {
    const secretName = 'uventory/upload-key'
    const authHeader = req.headers['authorization']

    const client = new SecretsManagerClient({
        region: 'ap-southeast-2'
    })

    let response

    try {
        response = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
                VersionStage: "AWSCURRENT", 
            })
        );
    } catch (error) {
        return res.sendStatus(401)
    }
      
    const secret = response.SecretString
    if(authHeader !== secret) {
        return res.sendStatus(401)
    }
    next()
}

const exportData = async (table, params, itemId = null) => {
    try {
        let data
        const cond = []
        if(params) {
            if(params.startDate) {
                let startDate = new Date(params.startDate);
                startDate.setHours(0, 0, 0, 0);
                cond.push({ createdAt: { [Op.gte]: startDate } })
            }
            
            if(params.endDate) {
                let endDate = new Date(params.endDate);
                endDate.setHours(23, 59, 59, 999);
                cond.push({ createdAt: { [Op.lte]: endDate } })
            }
        }

        if(table.includes('Logs') && params.inOut) {
            if(params.inOut === 'in') {
                cond.push({ inout: 'in' })
            } else if (params.inOut === 'out') {
                cond.push({ inout: 'out' })
            }
        }

        let groupIds = []

        if(table === 'IngredientLogs') {
            if(itemId) {
                cond.push({ ingredientId: itemId })
            }

            if(params.query) {
                const ids = await IngredientLog.findAll({
                    attributes: ['logGroup'],
                    where: { 
                        batchNo: { [Op.like]: `%${params.query}%` }
                    },
                    raw: true
                });
        
                groupIds = ids.map(log => log.logGroup);
                
                cond.push({
                    [Op.or]: [
                        { '$User.firstName$': { [Op.like]: `%${params.query}%` } },
                        { '$User.lastName$': { [Op.like]: `%${params.query}%` } },
                        { '$Ingredient.name$': { [Op.like]: `%${params.query}%` } },
                        { '$Ingredient.code$': { [Op.like]: `%${params.query}%` } },
                        { id: { [Op.in]: groupIds } },
                        { remark: { [Op.like]: `%${params.query}%` } },
                        { ed: { [Op.like]: `%${params.query}%` } }
                    ]
                })
            }

            res = await IngredientLogGroup.findAll({
                where: {
                    [Op.and]: cond,
                    ingredientId: { [Op.ne]: null }
                },
                attributes: {
                    exclude: ['id', 'deletedAt']
                },
                include: [
                    {
                        model: IngredientLog,
                        required: true,
                        attributes: {
                            exclude: ['batchDeleted', 'flagged', 'deletedAt']
                        },
                        include: [
                            {
                                model: Location,
                                required: false,
                                attributes: ['name']
                            }
                        ]
                    },
                    {
                        model: Ingredient,
                        required: true,
                        attributes: ['name', 'unit', 'code']
                    },
                    {
                        model: User,
                        required: true,
                        attributes: ['firstName', 'lastName', 'id']
                    },
                    {
                        model: Product,
                        required: false,
                        attributes: ['code']
                    }
                ],
                raw: true
            })

            data = res.map(log => {
                return {
                    date: DateTime.fromISO(log['createdAt'].toISOString()).toFormat('yyyy-LL-dd hh:mm:ss'),
                    ingredient: log['Ingredient.name'],
                    ingredientCode: String(log['Ingredient.code']),
                    batchNo: log['IngredientLogs.batchNo'],
                    inout: log['inout'],
                    qty: convertToUnit(log['Ingredient.unit'], log['IngredientLogs.qty']),
                    unit: log['Ingredient.unit'],
                    inProduct: log['Product.code'],
                    expDate: log['IngredientLogs.expDate'] ? DateTime.fromISO(log['IngredientLogs.expDate'].toISOString()).toFormat('yyyy-LL-dd') : null,
                    poDate: log['IngredientLogs.poDate'] ? DateTime.fromISO(log['IngredientLogs.poDate'].toISOString()).toFormat('yyyy-LL-dd') : null,
                    location: log['IngredientLogs.Location.name'] || null,
                    user: `${log['User.firstName']} ${log['User.lastName']}`,
                    userId: log['User.id'],
                    ed: log['ed'],
                    remark: log['remark']
                }
            })
        } else if (table === 'ProductLogs') {
            if(itemId) {
                cond.push({ productId: itemId })
            }

            if(params.query) {
                const ids = await ProductLog.findAll({
                    attributes: ['logGroup'],
                    where: { batchNo: { [Op.like]: `%${params.query}%` } },
                    raw: true
                });
        
                groupIds = ids.map(log => log.logGroup);
                
                cond.push({
                    [Op.or]: [
                        { '$User.firstName$': { [Op.like]: `%${params.query}%` } },
                        { '$User.lastName$': { [Op.like]: `%${params.query}%` } },
                        { '$Product.name$': { [Op.like]: `%${params.query}%` } },
                        { '$Product.code$': { [Op.like]: `%${params.query}%` } },
                        { id: { [Op.in]: groupIds } },
                        { remark: { [Op.like]: `%${params.query}%` } },
                        { ed: { [Op.like]: `%${params.query}%` } }
                    ]
                })
            }

            res = await ProductLogGroup.findAll({
                where: {
                    [Op.and]: cond,
                    productId: { [Op.ne]: null }
                },
                attributes: {
                    exclude: ['id', 'deletedAt']
                },
                include: [
                    {
                        model: ProductLog,
                        required: true,
                        attributes: {
                            exclude: ['batchDeleted', 'flagged', 'deletedAt']
                        },
                        include: [
                            {
                                model: Location,
                                required: false,
                                attributes: ['name']
                            }
                        ]
                    },
                    {
                        model: Product,
                        required: false,
                        attributes: ['name', 'code']
                    },
                    {
                        model: User,
                        required: false,
                        attributes: ['firstName', 'lastName', 'id']
                    }
                ],
                raw: true
            })

            data = res.map(log => {
                return {
                    date: DateTime.fromISO(log['createdAt'].toISOString()).toFormat('yyyy-LL-dd hh:mm:ss'),
                    product: log['Product.name'],
                    productCode: String(log['Product.code']),
                    batchNo: log['ProductLogs.batchNo'],
                    inout: log['inout'],
                    qty: log['ProductLogs.qty'],
                    expDate: log['ProductLogs.expDate'] ? DateTime.fromISO(log['ProductLogs.expDate'].toISOString()).toFormat('yyyy-LL-dd') : null,
                    poDate: log['ProductLogs.poDate'] ? DateTime.fromISO(log['ProductLogs.poDate'].toISOString()).toFormat('yyyy-LL-dd') : null,
                    location: log['ProductLogs.Location.name'] || null,
                    user: `${log['User.firstName']} ${log['User.lastName']}`,
                    userId: log['User.id'],
                    ed: log['ed'],
                    remark: log['remark']
                }
            })
        } else if (table.includes('Audits')) {
            if(params.query) {
                cond.push({
                    [Op.or]: [
                        { '$User.firstName$': { [Op.like]: `%${params.query}%` } },
                        { '$User.lastName$': { [Op.like]: `%${params.query}%` } },
                        { batchNo: { [Op.like]: `%${params.query}%` } },
                        { '$Ingredient.code$': { [Op.like]: `%${params.query}%` } },
                        { '$Product.code$': { [Op.like]: `%${params.query}%` } }
                    ]
                })
            }

            if(table.includes('Ingredient')) {
                cond.push({ productId: null })
                cond.push({ ingredientId: { [Op.ne]: null } })
            } else if (table.includes('Product')) {
                cond.push({ productId: { [Op.ne]: null } })
                cond.push({ ingredientId: null })
            } else {
                return Promise.reject('Invalid table')
            }
            res = await LogAudit.findAll({ 
                where: {
                    [Op.and]: cond
                },
                include: [
                    {
                        model: Ingredient,
                        required: false,
                        attributes: ['code', 'unit']
                    },
                    {
                        model: Product,
                        required: false,
                        attributes: ['code']
                    },
                    {
                        model: User,
                        required: false,
                        attributes: ['firstName', 'lastName']
                    }
                ],
                raw: true
            })

            data = res.map(audit => {
                return {
                    date: DateTime.fromISO(audit['createdAt'].toISOString()).toFormat('yyyy-LL-dd hh:mm:ss'),
                    user: `${audit['User.firstName']} ${audit['User.lastName']}`,
                    action: audit['logAction'],
                    inOut: audit['inOut'],
                    ingredientCode: audit['Ingredient.code'] ? String(audit['Ingredient.code']) : null,
                    productCode: audit['Product.code'] ? String(audit['Product.code']) : null,
                    batchNo: audit['batchNo'],
                    qty: table.includes('Ingredient') ? `${convertToUnit(audit['Ingredient.unit'], audit['qty'])}` : audit['qty'],
                    prevQty: table.includes('Ingredient') ? `${convertToUnit(audit['Ingredient.unit'], audit['prevQty'])}` : audit['prevQty'],
                    unit: table.includes('Ingredient') ? audit['Ingredient.unit'] : null,
                }
            })
        } else if (table === 'Alerts') {
            data = await Notification.findAll({
                where: {
                    [Op.and]: cond
                },
                raw: true
            })
        } else if (table === 'Ingredients') {
            console.log("exporting ingredients:")
            res = await Ingredient.findAll({
                attributes: {
                    include: [[sequelize.fn('SUM', sequelize.col('IngredientBatches.qty')), 'qtySum']]
                },
                include: [
                    {
                        model: IngredientCategory,
                        required: true,
                        attributes: ['name']
                    },
                    {
                        model: Supplier,
                        required: false,
                        attributes: ['name']
                    },
                    {
                        model: IngredientBatch,
                        required: false,
                        attributes: []
                    }
                ],
                group: ['Ingredient.id'],
                raw: true
            })

            data = res.map(ingredient => {
                return {
                    code: String(ingredient['code']),
                    name: ingredient['name'],
                    category: ingredient['IngredientCategory.name'],
                    supplier: ingredient['Supplier.name'] || null,
                    qty: ingredient['qtySum'] ? convertToUnit(ingredient['unit'], ingredient['qtySum'].toFixed(0)).toFixed(3) : 0,
                    stockAlert: ingredient['stockAlert'] ? `${convertToUnit(ingredient['unit'], ingredient['stockAlert'])}` : null,
                    unit: ingredient['unit'],
                    ed: ingredient['ed'],
                    reciever: ingredient['reciever'],
                    createdAt: DateTime.fromISO(ingredient['createdAt'].toISOString()).toFormat('yyyy-LL-dd'),
                    expirationTime: ingredient['expirationTime'],
                    categoryId: ingredient['category'],
                    supplierId: ingredient['supplier'] || null
                }
            })
        } else if (table === 'Products') {
            res = await Product.findAll({
                attributes: {
                    include: [
                        [Sequelize.literal("CAST(code AS CHAR)"), "code"],
                        [sequelize.fn('SUM', sequelize.col('ProductBatches.qty')), 'qtySum']
                    ]
                },
                include: [
                    {
                        model: ProductCategory,
                        required: true,
                        attributes: ['name']
                    },
                    {
                        model: Brand,
                        required: false,
                        attributes: ['name']
                    },
                    {
                        model: ProductBatch,
                        required: false,
                        attributes: []
                    }
                ],
                raw: true
            })

            data = res.map(product => {
                return {
                    code: typeof product['code'] === 'number' ? String(product['code']).padStart(4, "0") : product['code'],
                    name: product['name'],
                    category: product['ProductCategory.name'],
                    categoryId: product['category'],
                    brand: product['Brand.name'],
                    qty: product['qtySum'],
                    expirationTime: product['expirationTime'],
                    createdAt: DateTime.fromISO(product['createdAt'].toISOString()).toFormat('yyyy-LL-dd')
                }
            })
        } else if (table === 'Suppliers') {
            if(params.region !== 'All') {
                cond.push({ region: params.region })
            }
            res = await Supplier.findAll({
                where: cond,
                raw: true
            })

            data = res.map(supplier => {
                return {
                    name: supplier['name'],
                    location: supplier['location'],
                    person: supplier['person'],
                    email: supplier['email'],
                    phone: supplier['phone'],
                    region: supplier['region'],
                    createdAt: DateTime.fromISO(supplier['createdAt'].toISOString()).toFormat('yyyy-LL-dd')
                }
            })
        } else if (table === 'ProductTemplates') {
            res = await ProductTemplateIngredient.findAll({
                include: [
                    {
                        model: ProductTemplate,
                        required: true,
                        attributes: ['name', 'createdAt'],
                        include: [
                            {
                                model: User,
                                required: true,
                                attributes: ['firstName', 'lastName']
                            }
                        ]
                    },
                    {
                        model: Ingredient,
                        required: true,
                        attributes: ['code']
                    }
                ],
                raw: true
            })

            data = res.map(template => {
                return {
                    name: template['ProductTemplate.name'],
                    templateId: template['templateId'],
                    createdAt: DateTime.fromISO(template['ProductTemplate.createdAt'].toISOString()).toFormat('yyyy-LL-dd'),
                    user: `${template['ProductTemplate.User.firstName']} ${template['ProductTemplate.User.lastName']}`,
                    ingredient: template['Ingredient.code'],
                    qty: template['qty'],
                    unit: template['unit'],
                }
            })
        } else if (table === 'Brands') {
            res = await Brand.findAll({
                raw: true
            })

            data = res.map(brand => {
                return {
                    name: brand['name'],
                    createdAt: DateTime.fromISO(brand['createdAt'].toISOString()).toFormat('yyyy-LL-dd')
                }
            })
        } else if (table === 'Locations') {
            res = await Location.findAll({
                raw: true
            })

            data = res.map(location => {
                return {
                    name: location['name'],
                    createdAt: DateTime.fromISO(location['createdAt'].toISOString()).toFormat('yyyy-LL-dd')
                }
            })
        } else {
            return Promise.reject('Invalid table')
        }

        const csv = converter.json2csv(data)
        const csvFilePath = path.join(__dirname, 'data.csv')
        fs.writeFileSync(csvFilePath, csv)
        return csvFilePath
    } catch(err) {
        console.error(err)
    }
}

const uploadToS3 = async (table, params, now, itemId = null) => {
    const s3 = new AWS.S3()
    const filePath = await exportData(table, params, itemId)
    const bucketName = 'uventory'

    const uploadParams = {
        Bucket: bucketName,
        Key: `data-${now}.csv`,
        Body: fs.createReadStream(filePath)
    }
    
    s3.upload(uploadParams, (err, data) => {
        if (err) {
            console.error(err)
        } else {
            console.log('success')
        }
    })
}

// router.post('/insert-load-in-out', async (req, res, next) => {
//     const logs = req.body
//     const defaultUser = await User.findOne({
//         where: {
//             access: 'root'
//         },
//         raw: true
//     })

    
//     const result = await processLogs(logs)
//     if(result) {
//         return res.sendStatus(200)
//     } else {
//         return res.sendStatus(500)
//     }
// })

router.post('/update-ingredients', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const ingredients = JSON.parse(req.body.ingredient_info)
        for (const i in ingredients) {
            const update = ingredients[i]
            const ingredient = await Ingredient.findOne({
                where: {
                    name: update['Ingredient']
                }
            })

            if(ingredient) {
                let supplier = null
                const fetchSupplier = await Supplier.findOne({
                    where: {
                        name: update['Supplier']
                    },
                    attributes: ['id'],
                    raw: true
                })

                if(fetchSupplier) {
                    supplier = fetchSupplier.id
                }

                let category = null
                let fetchCategory = await IngredientCategory.findOne({
                    where: {
                        name: update['Category'].replace(/[\/ &]/g, '-')
                    }
                })

                if(!fetchCategory) {
                    await IngredientCategory.create({
                        name: update['Category'].replace(/[\/ &]/g, '-')
                    })

                    fetchCategory = await IngredientCategory.findOne({
                        where: {
                            name: update['Category'].replace(/[\/ &]/g, '-')
                        }
                    })
                }
                category = fetchCategory.dataValues.id

                ingredient.supplier = supplier
                ingredient.category = category
                ingredient.stockAlert = update['Stock Alert\n(kg)'] ? update['Stock Alert\n(kg)'] * 1000000 : null
                await ingredient.save()
            }
        }
        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.post('/insert-ingredients', checkSecret, async (req, res, next) => {
    const ingredients = JSON.parse(req.body.ingredients)
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        if(ingredients) {
            const formattedIngredients = []
            for(const i in ingredients) {
                const ingredient = ingredients[i]

                const existingIngredient = await Ingredient.findOne({
                    where: {
                        name: ingredient['Product'].trim()
                    },
                    raw: true
                })

                if(formattedIngredients.find(i => i.name.toLowerCase() === ingredient['Product'].trim().toLowerCase()) || existingIngredient) continue

                let code = ingredient['Batch No.']
                if(formattedIngredients.find(i => i.code === ingredient['Batch No.'])) {
                    code = `${code}A`
                } else if (typeof code === 'number') {
                    code = code.toFixed(0)
                } else if(code.match(/\//g)) {
                    code = code.split('/')[0]
                    while(formattedIngredients.find(i => i.code === code)) {
                        code = `${code}A`
                    }
                }

                formattedIngredients.push({
                    code: code,
                    name: ingredient['Product'].trim(),
                    category: 1,
                    supplier: null,
                    stockAlert: 0,
                    unit: 'kg',
                    ed: null,
                    reciever: null
                })
            }

            await Ingredient.bulkCreate(formattedIngredients, {
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

router.post('/insert-suppliers', checkSecret, async (req, res, next) => {
    const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED })
    try {
        const suppliers = JSON.parse(req.body.suppliers)
        const suppliersList = []
        for (const key of Object.keys(suppliers)) {
            console.log(suppliers[key][0])
            for (const i in suppliers[key]) {
                const data = suppliers[key][i]
                if(!data['COMPANY']) {
                    continue
                }
                let region

                if(key.includes('CHINA')) {
                    region = 'China'
                } else if (key === 'OVERSEAS') {
                    region = 'Overseas'
                } else if (key === 'NEW ZEALAND') {
                    region = 'NZ'
                } else if (key === 'PRINT'){
                    if(data['COUNTRY'] === 'CN') {
                        region = 'China'
                    } else if (data['COUNTRY'] === 'NZ') {
                        region = 'NZ'
                    } else {
                        region = 'Overseas'
                    }
                }

                suppliersList.push({
                    name: data['COMPANY'],
                    location: key === 'OVERSEAS' || key === 'PRINT' ? data['COUNTRY'] : data['CITY'],
                    person: data['SALES'],
                    email: data['E-MAIL'],
                    phone: data['PHONE'],
                    region: region
                })
            }
        }

        await Supplier.bulkCreate(suppliersList, {
            transaction
        })
        await transaction.commit()
        return res.sendStatus(200)
    } catch(err) {
        await transaction.rollback()
        console.error(err)
        next(err)
    }
})

router.post('/status', authenticateTokenAndAdmin, async (req, res, next) => {
    if(req.body.status === 'OK') {
        req.io.emit('uploadStatus', 'OK')
        return res.sendStatus(200)
    } else if (req.body.status === 'ERROR') {
        req.io.emit('uploadStatus', 'ERROR')
        return res.sendStatus(500)
    } else {
        return res.sendStatus(400)
    }
})

router.post('/upload', authenticateTokenAndAdmin, upload.single('file'), async (req, res, next) => {
    try {
        const file = req.file
        const tempPath = file.path
        const userSocket = [...req.io.sockets.sockets.values()].find(s => s.user.id === req.user.id)
        if(file) {
            await csv({ nullObject: true }).fromFile(file.path).on('header', headers => {
                if(req.body.table === 'IngredientLogs') {
                    for(const header of csvHeaders['IngredientLogs']) {
                        if(!headers.includes(header)) {
                            throw new Error("HeaderMissingError")
                        }
                    }
                } else if (req.body.table === 'ProductLogs') {
                    for(const header of csvHeaders['ProductLogs']) {
                        if(!headers.includes(header)) {
                            throw new Error("HeaderMissingError")
                        }
                    }
                } else if (req.body.table === 'Ingredients') {
                    for(const header of csvHeaders['Ingredients']) {
                        if(!headers.includes(header)) {
                            throw new Error("HeaderMissingError")
                        }
                    }
                } else if (req.body.table === 'Products') {
                    for(const header of csvHeaders['Products']) {
                        if(!headers.includes(header)) {
                            throw new Error("HeaderMissingError")
                        }
                    }
                } else {
                    throw new Error("InvalidTable")
                }
            }).then(async data => {
                if(req.body.table === 'IngredientLogs') {
                    await processIngredientLogs(data, userSocket, req.io)
                } else if (req.body.table === 'ProductLogs') {
                    await processProductLogs(data, userSocket, req.io)
                } else if (req.body.table === 'Ingredients') {
                    await postIngredients(data, userSocket, req.io)
                } else if (req.body.table === 'Products') {
                    await postProducts(data, userSocket, req.io)
                }
                res.sendStatus(200)
            }).catch(err => {
                if(err) {
                    if(err.type === 'DuplicateBatchError') {
                        res.status(400).send({ text1: `Duplicate load in for the same Batch No: ${err.metadata.batchNo} for Item: ${req.body.table === 'IngredientLogs' ? err.metadata.ingredient : err.metadata.product}.`, text2: 'Please fix the error and try again.' })
                    } else if (err.type === 'ProductNotFoundError') {
                        res.status(400).send({ text1: `Unknown code: ${err.metadata.code} for Product: ${err.metadata.product}`, text2: 'Please check that all product codes are correct and exists.' })
                    } else if (err.type === 'IngredientNotFoundError') {
                        res.status(400).send({ text1: `Unknown code: ${err.metadata.code} for Ingredient: ${err.metadata.ingredient}`, text2: 'Please check that all ingredient codes are correct and exists.' })
                    } else if (err.type === 'IngredientCategoryNotFound') {
                        res.status(400).send({ text1: `Category: "${err.metadata.category}" not found for Ingredient: "${err.metadata.ingredient}"`, text2: 'Please check that all category names are correct and try again.' })
                    } else if (err.type === 'ProductCategoryNotFound') {
                        res.status(400).send({ text1: `Category: "${err.metadata.category}" not found for Product: "${err.metadata.product}"`, text2: 'Please check that all category names are correct and try again.' })
                    } else if (err.type === 'ProductBrandNotFound') {
                        res.status(400).send({ text1: `Brand: "${err.metadata.brand}" not found for Product: "${err.metadata.product}"`, text2: 'Please check that all brand names are correct and try again.' })
                    } else if (err.message === 'HeaderMissingError') {
                        res.status(400).send({ text1: `CSV file is missing column(s) for table ${req.body.table}.`, text2: "Please fix the error and try again." })
                    } else if (err.message === 'InvalidTable') {
                        res.status(400).send({ text1: "Invalid Table." })
                    } else {
                        res.status(400).send({ text1: 'Unexpected Error.', text2: 'Please try again.' })
                    }
                } else {
                    res.status(400).send({ text1: 'Unexpected Error.', text2: 'Please try again.' })
                }
            }).finally(() => {
                fs.unlink(tempPath, (err) => {
                    if(err) {
                        console.error('Failed to delete file:', err)
                    }
                })
            })
        } else {
            res.sendStatus(400)
        }
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.post('/export-data-to-csv', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        if(!req.body.table) return res.status(400).send("Missing Parameters in Body.")
        const now = Date.now()
        const s3 = new AWS.S3()
        await uploadToS3(req.body.table, req.body.params, now, req.body.itemId)

        const getObjectParams = {
            Bucket: 'uventory',
            Key: `data-${now}.csv`,
            Expires: 60 * 5
        }

        setTimeout(() => {
            const url = s3.getSignedUrl('getObject', getObjectParams)
            res.json({ url })
        }, 3000)
    } catch(err) {
        next(err)
    }
})

module.exports = router