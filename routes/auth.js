const router = require('express').Router()
const db = require('../db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { authenticateTokenAndAdmin } = require('./authToken')
const { authenticateTokenAndMember } = require('./authToken')
const { authenticateToken } = require('./authToken')
const { google } = require('google-auth-library')
const nodemailer = require('nodemailer')
const User = db.models.User
const RefreshToken = db.models.RefreshToken
const Location = db.models.Location
const Ingredient = db.models.Ingredient
const IngredientCategory = db.models.IngredientCategory
const Brand = db.models.Brand
const Supplier = db.models.Supplier
const tokenSecret = process.env.TOKEN_SECRET
const refreshSecret = process.env.REFRESH_SECRET

const generateToken = (user) => {
    const payload = {
        ...user,
        iat: Math.floor(Date.now() / 1000)
    }
    return jwt.sign(payload, tokenSecret, { expiresIn: '1h' })
}

router.post('/token', async (req, res, next) => {
    try {
        const refreshToken = req.body.token
        if (!refreshToken) return res.sendStatus(401)
        const token = await RefreshToken.findOne({
            where: {
                token: refreshToken
            }
        })
        if (!token) return res.sendStatus(401)
        jwt.verify(refreshToken, refreshSecret, async (err, user) => {
            if (err) {
                console.log("\nrefresh token expired\n")
                return res.status(403).send('refresh token expired')
            }
            const { password, exp, ...rest } = user
            console.log(rest)
            const accessToken = generateToken(rest)
            console.log("new token:", accessToken)
            return res.status(200).send({ token: accessToken })
        })
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

// router.post('/checkToken', authenticateToken, async (req, res, next) => {
//     try {
//         const token = req.body.token
//         if(!token) return res.sendStatus(401)
//         jwt.verify(token, tokenSecret, async (err, user) => {
//             if(err && err.name === 'TokenExpiredError') {

//             }
//             if(err) {
//                 return res.sendStatus(403)
//             }
//         })
//     } catch (err) {

//     }
// })

router.post('/login', async (req, res, next) => {
    const sendToken = async (user) => {
        const { password, lastIngredientLogId, lastProductLogId, resetPasswordToken, loginToken, ...rest } = user.dataValues
        const token = generateToken(rest)
        const refreshToken = jwt.sign(rest, refreshSecret, { expiresIn: '12h' })
        await RefreshToken.create({ token: refreshToken })
        const payload = {
            accessToken: token,
            refreshToken: refreshToken,
            access: rest.access,
            id: rest.id,
            firstName: rest.firstName,
            lastName: rest.lastName
        }

        if(user.loginToken) {
            payload.loginToken = user.loginToken
        }
        res.status(200).send(payload)
    }

    try {
        if(req.body.loginToken) {
            const user = await User.findOne({
                where: {
                    loginToken: req.body.loginToken
                }
            })

            if(!user) return res.status(400).send({ text1: "Login token not found.", text1: "Please login again." })

            jwt.verify(req.body.loginToken, tokenSecret, async (err) => {
                if(err) {
                    user.loginToken = null
                    await user.save()
                    return res.status(400).send({ text1: 'Login token expired.', text2: "Please login again." })
                }
                await sendToken(user)
            })

        } else {
            const user = await User.findOne({
                where: {
                    email: req.body.email
                }
            })
    
            if (!user) return res.sendStatus(401)
    
            const match = bcrypt.compareSync(req.body.password, user.password)
            if (match) {
                if(req.body.createLoginToken) {
                    const token = jwt.sign({ iat: Math.floor(Date.now() / 1000) }, tokenSecret, { expiresIn: '3d' })
                    user.loginToken = token
                    await user.save()
                }
                await sendToken(user)
            } else {
                res.sendStatus(401)
            }
        }
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

router.post('/logout', async (req, res, next) => {
    try {
        await RefreshToken.destroy({
            where: {
                token: req.body.token
            }
        })

        res.sendStatus(200)
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

router.post('/create', authenticateTokenAndAdmin, async (req, res, next) => {
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(req.body.password, salt)
    await User.create({ email: req.body.email, firstName: req.body.firstName, lastName: req.body.lastName, password: hash })
    res.sendStatus(200)
})

router.post('/reset', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        const locations = [
            'Alcohol Storage',
            'Black container',
            'Blue container',
            'Bottle shed',
            'Bottle storage', 
            'Cissus container',
            'Display room',
            'Evergreen container',
            'Evergreen storage (outside)',
            'Factory 1-Dry room 2',
            'Factory 1-Dry room 4',
            'Factory 1-Dry room 5',
            'Ingredients container',
            'Machine container',
            'Metaformula container',
            'NZ World container',
            'Product storage',
            'Propolis',
            'Shed',
            'Spare container',
            'Yellow container'
        ]

        for (const i in locations) {
            await Location.create({ name: locations[i] })
        }

        const ingredientCategories = [
            'Bee',
            'Bottle-Cap',
            'Boxes',
            'Capsules',
            'Dairy',
            'Evergreen',
            'Labels',
            'Nu-Wise',
            'Oil-Liquid',
            'Other',
            'Other-animal',
            'Tablets',
            'UB-Products'
        ]
        
        for (const i in ingredientCategories) {
            await IngredientCategory.create({ name: ingredientCategories[i] });
        }

        await Brand.create({ name: 'UBbio' })
        res.status(200).send('Database has been reset to default.')
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

router.post('/reset-password-request', async (req, res, next) => {
    try {
        const email = req.body.email

        const user = await User.findOne({
            where: {
                email: email
            }
        })

        if(!user) {
            return res.status(404).send({ text1: 'User not found.' })
        }
        const random = crypto.randomUUID()
        const payload = {
            id: random,
            iat: Math.floor(Date.now() / 1000)
        }
        const token = jwt.sign(payload, tokenSecret, { expiresIn: '10m' })
        user.resetPasswordToken = token
        await user.save()

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { 
                user: process.env.EMAIL,
                pass: process.env.PASS
            }
        })

        const mailOptions = {
            to: email,
            from: 'passwordreset@uventory.com',
            subject: 'Password Reset',
            text: `Please click on the following link to reset your password:\nhttps://${req.headers.host}/reset-password/${token}\n\n`
        }

        transporter.sendMail(mailOptions, (err) => {
            if (err) {
                console.error(err)
                next(err)
            } else {
                return res.sendStatus(200)
            }
        })
    } catch(err) {
        console.error(err)
        next(err)
    }
})

router.post('/reset-password/:token', async (req, res, next) => {
    try {
        const token = req.params.token
        const password = req.body.password

        jwt.verify(token, tokenSecret, async (err) => {
            if (err && err.name === 'TokenExpiredError') {
                return res.status(401).send('token expired')
            }
            if (err) return res.sendStatus(403)

            const user = await User.findOne({
                where: {
                    resetPasswordToken: token
                }
            })
    
            if(!user) {
                return res.sendStatus(404)
            }
    
            const salt = bcrypt.genSaltSync(10)
            const hash = bcrypt.hashSync(password, salt)
    
            await User.update({
                password: hash,
                resetPasswordToken: null
            }, {
                where: {
                    id: user.dataValues.id
                }
            })
    
            return res.sendStatus(200)
        })
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.get('/users', authenticateTokenAndAdmin, async (req, res, next) => {
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
    
router.get('/user/:id', authenticateToken, async (req, res, next) => {
    if (req.user.id != req.params.id) return res.sendStatus(403)
        else return res.status(200).send(req.user)
})
    
router.get('/check-reset-token/:token', async (req, res, next) => {
    try {
        const token = await User.findOne({
            where: {
                resetPasswordToken: req.params.token
            }
        })
        
        if(!token) {
            return res.sendStatus(401)
        }

        jwt.verify(req.params.token, tokenSecret, (err) => {
            if (err && err.name === 'TokenExpiredError') {
                return res.status(401).send('token expired')
            }
            if (err) return res.sendStatus(403)

            return res.sendStatus(200)
        })
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.put('/user/:id/reset-password', authenticateToken, async (req, res, next) => {
    try {
        const user = await User.findOne({
            where: {
                id: req.params.id
            }
        })

        if (!user) return res.sendStatus(404)

        const match = bcrypt.compareSync(req.body.prev, user.password)
        if (match) {
            const salt = bcrypt.genSaltSync(10)
            const hash = bcrypt.hashSync(req.body.new, salt)
            await User.update({
                password: hash
            },
            {
                where: {
                    id: req.params.id
                }
            })

            return res.sendStatus(200)
        } else {
            return res.status(400).send({ text1: 'Password does not match current password.' })
        }
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.put('/user/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        await User.update(req.body, {
            where: {
                id: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

router.delete('/user/:id', authenticateTokenAndAdmin, async (req, res, next) => {
    try {
        await User.destroy({
            where: {
                id: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        next(err)
    }
})

module.exports = router