const jwt = require('jsonwebtoken')
const testTokenSecret = process.env.TOKEN_SECRET

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return res.sendStatus(401)

    jwt.verify(token, testTokenSecret, (err, user) => {
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

    jwt.verify(token, testTokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') return res.sendStatus(401)
        if (err || (user.access === 'associate-member')) return res.sendStatus(403)
        req.user = user
        next()
    })
}

const authenticateTokenAndAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return res.sendStatus(401)

    jwt.verify(token, testTokenSecret, (err, user) => {
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