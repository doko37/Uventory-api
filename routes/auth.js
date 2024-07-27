const router = require('express').Router()
const db = require('../db')
const User = db.models.User

router.get('/', async (req, res) => {
    await User.findAll()
        .then(users => {
            res.send(users)
        })
        .catch(err => {
            console.err(err)
        })
})

router.post('/login', async (req, res) => {
    console.log(req.body)
    const user = await User.findOne({
        where: {
            email: req.body.email
        }
    })

    console.log(user)
    res.send(user)
})

router.post('/create', async (req, res) => {
    console.log(req.body)
    const user = await User.create({ email: req.body.email, firstName: req.body.firstName, lastName: req.body.lastName })
    res.send(user)
})

module.exports = router