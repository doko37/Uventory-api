const jwt = require('jsonwebtoken')
const tokenSecret = '54d13edf92d5f9aaa392631dec24fd79baceb2d34328cc4e8ad237cb6d871b1ecf2ac5d1b549005cef6a03e89360090749f0defc5cfd4362f08423a6c2b4796bd30dafab06050b097dc4247056d10e78'
const refreshSecret = 'b8c73fd0d6b6786094c83b3a94559f9d5d7188652cf8ae38fab23f4a7ed5914a25c8649101273deb66ac54f3362d4b17b192075d4cf32af5e88dae9249b9fdd5a6ed8d25a8fde72a706115d6883bfec5'

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    console.log(req.route)
    if (!token) return res.sendStatus(401)

    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') return res.sendStatus(401)
        if (err) return res.sendStatus(403)
        req.user = user
        next()
    })
}
const authenticateTokenAndMember = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return res.sendStatus(401)

    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') return res.sendStatus(401)
        if (err || (user.access !== 'member' && user.access !== 'admin')) return res.sendStatus(403)
        req.user = user
        next()
    })
}

const authenticateTokenAndAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return res.sendStatus(401)

    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') return res.sendStatus(401)
        if (err || user.access !== 'admin') return res.sendStatus(403)
        req.user = user
        next()
    })
}

module.exports = {
    authenticateToken,
    authenticateTokenAndMember,
    authenticateTokenAndAdmin
}