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

router.get('/', authenticateToken, async (req, res) => {
    let whereCondition = { [Op.and]: [] };

    // if(req.query.show === 'ingredients') {
    //     whereCondition[Op.ne] = {
    //         ingredientId: null
    //     }
    // } else if(req.query.show === 'products') {
    //     whereCondition[Op.ne] = {
    //         productId: null
    //     }
    // }

    if(req.query.search) {
        searchCondition = {
            [Op.or]: [
                { '$User.firstName$': { [Op.like]: `%${req.query.search}%` } },
                { '$User.lastName$': { [Op.like]: `%${req.query.search}%` } },
                { batchNo: { [Op.like]: `%${req.query.search}%` } },
                { '$Ingredient.code$': { [Op.like]: `%${req.query.search}%` } }
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
                    required: true,
                    attributes: ['code'],
                },
                {
                    model: Product,
                    required: false,
                    attributes: [],
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
            const { 'Ingredient.code': ingredientCode, ...rest } = audit
            return {
                ...rest,
                ingredientCode
            }
        })

        return res.status(200).send(renamedAudits)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.get('/:id', authenticateToken, async (req, res) => {
    console.log("get audit", req.params.id)
    try {
        const audit = await LogAudit.findOne({
            where: {
                id: req.params.id,
            },
            include: [
                {
                    model: IngredientLog,
                    attributes: ['unit'],
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
                    attributes: ['code']
                }
            ],
            raw: true
        })

        console.log(audit)

        const { 'IngredientLog.unit': unit, 'User.firstName': firstName, 'User.lastName': lastName, 'Ingredient.code': ingredientCode, ...rest } = audit

        return res.status(200).send({ ...rest, unit, user: { firstName, lastName }, ingredientCode })
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

module.exports = router