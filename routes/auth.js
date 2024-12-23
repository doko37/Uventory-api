const router = require('express').Router()
const db = require('../db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { authenticateTokenAndAdmin } = require('./authToken')
const { authenticateTokenAndMember } = require('./authToken')
const { authenticateToken } = require('./authToken')
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
    return jwt.sign(payload, tokenSecret, { expiresIn: '10m' })
}

router.post('/token', async (req, res) => {
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

// router.post('/checkToken', authenticateToken, async (req, res) => {
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

router.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                email: req.body.email
            }
        })

        if (!user) return res.sendStatus(401)

        const match = bcrypt.compareSync(req.body.password, user.password)
        if (match) {
            const { password, lastIngredientLogId, lastProductLogId, ...rest } = user.dataValues
            const token = generateToken(rest)
            const refreshToken = jwt.sign(rest, refreshSecret, { expiresIn: '1h' })
            await RefreshToken.create({ token: refreshToken })
            res.status(200).send({
                accessToken: token,
                refreshToken: refreshToken,
                access: rest.access,
                id: rest.id,
                firstName: rest.firstName,
                lastName: rest.lastName
            })
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
        console.error(err)
        res.sendStatus(500)
    }
})

router.post('/create', async (req, res) => {
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(req.body.password, salt)
    const user = await User.create({ email: req.body.email, firstName: req.body.firstName, lastName: req.body.lastName, password: hash })
    res.sendStatus(200)
})

router.post('/reset', authenticateTokenAndAdmin, async (req, res) => {
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

        locations.forEach(async (location) => {
            await Location.create({ name: location });
        });

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
        
        ingredientCategories.forEach(async (category) => {
            await IngredientCategory.create({ name: category });
        });

        await Brand.create({ name: 'UBbio' })
        await Supplier.bulkCreate([
            {
                region: 'NZ',
                name: 'HN Lanyue',
                email: 'contact@lanyue.com',
                phone: '041234567',
                person: 'John Doe',
                address: '123 Street'
            },
            {
                region: 'Overseas',
                name: 'Geltech',
                email: 'contact@geltech.co.kr',
                phone: '8201923842',
                person: 'John Park',
                address: '123 Street'
            },
            {
                region: 'NZ',
                name: 'NZ Beeswax',
                email: 'contact@beeswax.co.nz',
                phone: '0401923842',
                person: 'John Doe',
                address: '123 Street'
            }
        ])

        await Ingredient.bulkCreate([
            {
                code: 'GP',
                name: 'Gelatin Powder',
                category: 11,
                supplier: 2,
                stockAlert: 500000,
                unit: 'g',
                qty: 0,
            },
            {
                code: 'IMP',
                name: 'Soyabean Oil',
                category: 9,
                supplier: 1,
                stockAlert: 300000,
                unit: 'l',
                qty: 0,
            },
            {
                code: 'BW',
                name: 'Beeswax',
                category: 1,
                supplier: 3,
                stockAlert: 700000,
                unit: 'g',
                qty: 0,
            }
        ])
        res.status(200).send('Database has been reset to default.')
    } catch (err) {
        console.error(err)
        res.sendStatus(500)
    }
})

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

router.put('/user/:id', authenticateTokenAndAdmin, async (req, res) => {
    try {
        await User.update(req.body, {
            where: {
                id: req.params.id
            }
        })

        return res.sendStatus(200)
    } catch (err) {
        console.error(err)
        return res.sendStatus(500)
    }
})

module.exports = router