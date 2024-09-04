const router = require('express').Router()
const db = require('../db')
const { authenticateTokenAndAdmin, authenticateToken } = require('./authToken')
const Location = db.models.Location

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

module.exports = router