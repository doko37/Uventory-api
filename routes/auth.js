const router = require('express').Router()
const db = require('../db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { authenticateTokenAndAdmin } = require('./authToken')
const { authenticateTokenAndMember } = require('./authToken')
const { authenticateToken } = require('./authToken')
const User = db.models.User
const RefreshToken = db.models.RefreshToken
const tokenSecret = process.env.TOKEN_SECRET
const refreshSecret = process.env.REFRESH_SECRET

const generateToken = (user) => {
    return jwt.sign(user, tokenSecret, { expiresIn: '10m' })
}

router.get('/users', authenticateTokenAndAdmin, async (req, res) => {
    User.findAll({
        attributes: {
            exclude: ['password']
        }
    })
        .then(users => {
            res.send(users)
        })
        .catch(err => {
            res.sendStatus(500)
            console.err(err)
        })
})

router.get('/user/:id', authenticateToken, async (req, res) => {
    if (req.user.id != req.params.id) return res.sendStatus(403)
    else return res.status(200).send(req.user)
})

router.post('/token', async (req, res) => {
    try {
        const refreshToken = req.body.token
        if (!refreshToken) return res.sendStatus(401)
        const token = await RefreshToken.findOne({
            where: {
                token: refreshToken
            }
        })
        if (!token) return res.sendStatus(403)
        jwt.verify(refreshToken, refreshSecret, (err, user) => {
            if (err) return res.sendStatus(403)
            const { password, ...rest } = user
            const accessToken = generateToken(rest)
            return res.status(200).send({ token: accessToken })
        })
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

router.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                email: req.body.email
            }
        })

        const match = bcrypt.compareSync(req.body.password, user.password)
        if (match) {
            const { password, ...rest } = user.dataValues
            const token = generateToken(rest)
            const refreshToken = jwt.sign(rest, refreshSecret)
            await RefreshToken.create({ token: refreshToken })
            res.status(200).send({ accessToken: token, refreshToken: refreshToken, access: rest.access })
        } else {
            res.sendStatus(401)
        }
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

router.post('/logout', async (req, res) => {
    try {
        await RefreshToken.destroy({
            where: {
                token: req.body.token
            }
        })

        res.sendStatus(200)
    } catch (err) {
        res.sendStatus(500)
    }
})

router.post('/create', async (req, res) => {
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(req.body.password, salt)
    const user = await User.create({ email: req.body.email, firstName: req.body.firstName, lastName: req.body.lastName, password: hash })
    res.sendStatus(200)
})

module.exports = router