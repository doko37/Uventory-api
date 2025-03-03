const { authenticateToken } = require('../routes/authToken')
const router = require('express').Router()
const { Op, Sequelize, where, Transaction } = require('sequelize')
const db = require('../db')
const sequelize = require('../db')
const LogAudit = db.models.LogAudit
const Ingredient = db.models.Ingredient
const IngredientLog = db.models.IngredientLog
const User = db.models.User
const Product = db.models.Product
const ProductLog = db.models.ProductLog

router.get('/', authenticateToken, async (req, res, next) => {
    let whereCondition = { [Op.and]: [] };

    if(req.query.show === 'ingredients') {
        whereCondition[Op.and].push(
            { productId: null },
            { ingredientId: { [Op.ne]: null } }
        )
    } else if(req.query.show === 'products') {
        whereCondition[Op.and].push(
            { productId: { [Op.ne]: null } },
            { ingredientId: null }
        )
    }

    if(req.query.search) {
        const searchCondition = {
            [Op.or]: [
                { '$User.firstName$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.lastName$': { [Op.like]: `%${req.query.search}%` } },
                { batchNo: { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.code$': { [Op.like]: `%${req.query.search}%` } },
                { '$Product.code$': { [Op.like]: `%${req.query.search}%` } }
            ]
        }
        whereCondition[Op.and].push(searchCondition)
    }

    if(req.query.action) {
        const actionConditions = req.query.action.split('_').map(action => ({
            logAction: action
        }))

        const actionCondition = {
            [Op.or]: actionConditions
        }

        whereCondition[Op.and].push(actionCondition)
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

    try {
        const audits = await LogAudit.findAll({
            where: whereCondition,
            include: [
                {
                    model: Ingredient,
                    required: false,
                    attributes: ['code'],
                },
                {
                    model: Product,
                    required: false,
                    attributes: ['code'],
                },
                {
                    model: User,
                    attributes: []
                },
            ],
            order: [['createdAt', req.query.dir || 'DESC']],
            limit: limit,
            offset: offset,
            raw: true
        })

        const renamedAudits = audits.map(audit => {
            const { 'Ingredient.code': ingredientCode, 'Product.code': productCode, ...rest } = audit
            return {
                ...rest,
                ingredientCode,
                productCode
            }
        })

        return res.status(200).send(renamedAudits)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
        const audit = await LogAudit.findOne({
            where: {
                id: req.params.id,
            },
            include: [
                {
                    model: IngredientLog,
                    required: false,
                    paranoid: false,
                    where: {
                        [Op.or]: [ { deletedAt: null }, { deletedAt: { [Op.not]: null } } ]
                    }
                },
                {
                    model: User,
                    attributes: ['firstName', 'lastName'],
                },
                {
                    model: Ingredient,
                    attributes: ['name', 'code', 'unit']
                },
                {
                    model: ProductLog,
                    paranoid: false,
                    required: false,
                    where: {
                        [Op.or]: [ { deletedAt: null }, { deletedAt: { [Op.not]: null } } ]
                    }
                },
                {
                    model: Product,
                    attributes: ['name', 'code']
                }

            ],
            raw: true
        })

        if(audit.ingredientId) {
            const { 
                'Ingredient.unit': unit,
                'Ingredient.name': ingredientName, 
                'User.firstName': firstName, 
                'User.lastName': lastName, 
                'Ingredient.code': ingredientCode,
                ...rest 
            } = audit
    
            return res.status(200).send({ ...rest, unit, user: { firstName, lastName }, ingredientCode, ingredientName })
        } else {
            const { 'Product.name': productName, 'User.firstName': firstName, 'User.lastName': lastName, 'Product.code': productCode, ...rest } = audit
    
            return res.status(200).send({ ...rest, user: { firstName, lastName }, productName, productCode })
        }
    } catch (err) {
        console.error(err)
        next(err)
    }
})

module.exports = router