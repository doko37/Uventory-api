const router = require('express').Router()
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateToken } = require('./authToken')
const Location = db.models.Location
const IngredientBatch = db.models.IngredientBatch
const ProductBatch = db.models.ProductBatch

router.post('/reset', authenticateTokenAndAdmin, async (req, res) => {
    const locations = [
        'Bottle storage',
        'Shed',
        'Propolis',
        'Bottle shed',
        'Alcohol Storage',
        'Ingredients container',
        'Evergreen container',
        'Evergreen storage (outside)',
        'Blue container',
        'Black container',
        'Metaformula container',
        'Yellow container',
        'NZ World container',
        'Cissus container',
        'Spare container',
        'Machine container',
        'Factory 1-Dry room 2',
        'Factory 1-Dry room 4',
        'Factory 1-Dry room 5',
        'Product storage',
        'Display room'
    ];

    locations.forEach(async (location) => {
        await Location.create({ name: location });
    });

    res.sendStatus(200)
})

router.post('/', authenticateTokenAndAdmin, async (req, res) => {
    Location.create({
        name: req.body.name
    })
        .then(data => res.status(200).send(data.toJSON()))
        .catch(err => res.status(500).send(err))
})

router.get('/', authenticateToken, async (req, res) => {
    Location.findAll()
        .then(data => res.status(200).send(data))
        .catch(err => res.status(500).send(err))
})

router.put('/:id', authenticateTokenAndAdmin, async (req, res) => {
    Location.update(
        { name: req.body.name },
        {
            where: {
                id: req.params.id
            }
        }
    ).then(() => res.sendStatus(200))
        .catch(err => {
            console.error(err)
            res.sendStatus(500)
        })
})

router.delete('/:id', authenticateTokenAndAdmin, async (req, res) => {
    const ingredientBatches = await IngredientBatch.findAll({
        where: {
            location: req.params.id
        }
    })

    const productBatches = await ProductBatch.findAll({
        where: {
            location: req.params.id
        }
    })

    if (ingredientBatches.length > 0 || productBatches.length > 0) {
        return res.sendStatus(400)
    }

    Location.destroy({
        where: {
            id: req.params.id
        }
    })

    res.sendStatus(200)
})

module.exports = router