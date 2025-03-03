const router = require('express').Router()
const db = require('../db')
const { Op } = require('sequelize')
const { authenticateTokenAndAdmin, authenticateToken, authenticateTokenAndMember } = require('./authToken')
const Notification = db.models.Notification
const User = db.models.User
const Ingredient = db.models.Ingredient
const IngredientBatch = db.models.IngredientBatch

router.get('/', authenticateToken, async (req, res, next) => {
    const includeAttribute = []
    const dismissed = req.query.dismissed !== undefined && req.query.dismissed === 'true' ? true : false
    if (req.query.dismissed !== undefined && dismissed) {
        includeAttribute.push({
            model: User,
            attribute: ['firstName', 'lastName'],
            required: true
        })
    }

    const whereCondition = []
    whereCondition.push({ dismissed: dismissed })

    if (req.query.startDate) {
        whereCondition.push({ createdAt: { [Op.gte]: req.query.startDate } })
    }

    if (req.query.endDate) {
        whereCondition.push({ createdAt: { [Op.lte]: req.query.endDate } })
    }
    
    const limit = req.body.limit || 20
    const page = req.query.page || 1
    const offset = (page - 1) * limit

    Notification.findAll({
        include: includeAttribute,
        where: whereCondition,
        order: [[dismissed ? 'updatedAt' : 'createdAt', req.query.dir || 'DESC']],
        limit: limit,
        offset: offset
    }).then(data => {
        return res.send(data).status(200)
    }).catch(err => {
        console.error(err)
        next(err)
    })
})

router.get('/totalLength', authenticateToken, async (req, res, next) => {
    try {
        const length = await Notification.count({
            where: {
                dismissed: false
            }
        })
        
        return res.status(200).send({ length: length })
    } catch (err) {
        next(err)
    }
})

router.put('/dismiss/:id', authenticateTokenAndMember, async (req, res, next) => {
    try {
        const notification = await Notification.findOne({
            where: {
                id: req.params.id
            },
            raw: true
        })

        await Notification.update({
            dismissed: true,
            user: req.user.id
        }, {
            where: {
                id: req.params.id
            }
        })

        if (notification.type === 'lowStock') {
            await Ingredient.update({
                alertDismissed: true
            }, {
                where: {
                    id: notification.ingredientId
                }
            })
        } else if (notification.type === 'expiryDate') {
            await IngredientBatch.update({
                alertDismissed: true
            }, {
                where: {
                    id: notification.batchId
                }
            })
        }

        req.io.emit('notification')

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.put('/restore/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const notification = await Notification.findOne({
            where: {
                id: req.params.id
            },
            raw: true
        })

        await Notification.update(
            {
                dismissed: false,
                user: null
            },
            {
                where: {
                    id: req.params.id
                }
            }
        )

        if (notification.type === 'lowStock') {
            await Ingredient.update({
                alertDismissed: false
            }, {
                where: {
                    id: notification.ingredientId
                }
            })
        } else if (notification.type === 'expiryDate') {
            await IngredientBatch.update({
                alertDismissed: false
            }, {
                where: {
                    id: notification.batchId
                }
            })
        }

        req.io.emit('notification')

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

module.exports = router