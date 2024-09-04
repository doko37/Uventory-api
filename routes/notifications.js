const router = require('express').Router()
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateToken, authenticateTokenAndMember } = require('./authToken')
const Notification = db.models.Notification
const User = db.models.User
const Ingredient = db.models.Ingredient
const IngredientBatch = db.models.IngredientBatch

router.get('/', authenticateToken, async (req, res) => {
    const includeAttribute = []
    const dismissed = req.query.dismissed === 'true' ? true : false
    if (req.query.dismissed !== undefined && dismissed) {
        includeAttribute.push({
            model: User,
            attribute: ['firstName', 'lastName'],
            required: true
        })
    }
    console.log(includeAttribute)
    Notification.findAll({
        include: includeAttribute,
        where: {
            dismissed: req.query.dismissed !== undefined ? dismissed : true
        },
        order: [[dismissed ? 'updatedAt' : 'createdAt', 'ASC']]
    }).then(data => {
        return res.send(data).status(200)
    }).catch(err => {
        console.error(err)
        return res.sendStatus(500)
    })
})

router.put('/dismiss/:id', authenticateTokenAndMember, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            where: {
                id: req.params.id
            }
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

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

router.put('/restore/:id', authenticateTokenAndAdmin, async (req, res) => {
    Notification.update(
        {
            dismissed: false,
            user: null
        },
        {
            where: {
                id: req.params.id
            }
        }
    ).then(() => res.sendStatus(200)).catch(err => {
        console.error(err)
        return res.sendStatus(500)
    })
})

module.exports = router