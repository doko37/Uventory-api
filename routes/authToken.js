const jwt = require('jsonwebtoken')
const tokenSecret = process.env.TOKEN_SECRET

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    console.log(authHeader)
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) console.error('invalid token')
    if (!token) return res.status(401).send('token invalid')
    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') {
            console.error('authenicateToken', 'token expired')
            return res.status(401).send('token expired')
        }
        if (err) return res.sendStatus(403)
        req.user = user
        next()
    })
}
const authenticateTokenAndMember = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.access === 'associate-member') return res.sendStatus(403)
        else next()
    })
}

const authenticateTokenAndAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.access !== 'admin') return res.sendStatus(403)
        else next()
    })
}

module.exports = {
    authenticateToken,
    authenticateTokenAndMember,
    authenticateTokenAndAdmin
}