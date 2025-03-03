require('dotenv').config()
const cron = require('node-cron')
const express = require('express')
const app = express()
const http = require('http')
const { Server } = require('socket.io')
const ingredients = require('./routes/ingredients')
const products = require('./routes/products')
const locations = require('./routes/locations')
const suppliers = require('./routes/suppliers')
const notifications = require('./routes/notifications')
const auth = require('./routes/auth')
const audit = require('./routes/audit')
const data = require('./routes/data')
const db = require('./db')
const User = db.models.User
const cors = require('cors')
const checkExpiryDates = require('./checkExpiryDates')
const { deleteNotificationArchive, deleteRefreshTokens } = require('./deleteNotificationArchive')
const jwt = require('jsonwebtoken')
const { Op, Sequelize } = require('sequelize')
const retry = require('retry')
const tokenSecret = process.env.TOKEN_SECRET

const retryConnection = async () => {
    const operation = retry.operation({
        retries: 10,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 60000
    })

    return new Promise((resolve, reject) => {
        operation.attempt(async (currentAttempt) => {
            try {
                await db.authenticate()
                console.log('Connected to database')
                resolve()
            } catch (err) {
                if(err instanceof Sequelize.ConnectionError) {
                    console.error(`Connection attempt ${currentAttempt} failed:`, err)
                    if(operation.retry(err)) {
                        return
                    }
                }
                reject(err)
            }
        })
    })
}

app.use(cors())
app.use(express.json())
app.use(async (req, res, next) => {
    try {
        await retryConnection()
        next()
    } catch (err) {
        if (err instanceof Sequelize.ConnectionError) {
            return res.status(500).send({ text1: 'Database connection error.' })
        } else {
            console.error('Unexpected error:', err)
            res.status(500).send({ text1: 'Unexpected error.' })
        }
    }
})
const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
})

const tokenMiddleware = (socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) {
        console.error('invalid token')
        socket.disconnect()
        return next(new Error('Invalid token'))
    }
    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') {
            socket.emit('token_expired', 'Token expired')
            socket.disconnect()
            return next(new Error('Token expired'))
        }
        if (err) {
            console.error(err, token)
            socket.emit('token_error', 'Token error')
            socket.disconnect()
            return next(new Error('Token error'))
        }
        socket.user = user
        next()
    })
}
io.use(tokenMiddleware)
app.use((req, res, next) => {
    req.io = io
    next()
})
app.use('/api/auth', auth)
app.use('/api/ingredients', ingredients.router)
app.use('/api/products', products)
app.use('/api/suppliers', suppliers)
app.use('/api/locations', locations)
app.use('/api/notifications', notifications)
app.use('/api/audits', audit)
app.use('/api/data', data)
app.use(async (err, req, res, next) => {
    if (err instanceof Sequelize.ConnectionError || err instanceof Sequelize.ConnectionAcquireTimeoutError) {
        await retryConnection()
        next()
        return res.status(500).send({ text1: 'Database connection error.', text2: 'Please try again later.' })
    } else {
        console.error("err middleware: ",err)
        res.status(500).send({ text1: 'Internal server error' })
    }
})

db.authenticate().then((req) => {
    server.listen(5000, () => {
        console.log("Listening on port 5000")
    })
})

io.on("connection", (socket) => {
    console.log(`User ${socket.user.firstName} has connected.`)

    socket.on('join_logIngredient', async () => {
        if (socket.user.access === 'associate-member') {
            console.log(socket.user.firstName + 'is not authorized')
            socket.emit('error', { message: 'Not authorized' })
            return
        }
        console.log(`user ${socket.user.firstName} is logging an ingredient`)
        socket.join('logIngredient')
        const users = await User.findAll({
            where: {
                reservedIngredient: {
                    [Op.ne]: null
                }
            },
            attributes: ['id', 'reservedIngredient']
        })
        socket.emit("reserve_updated", users)
    })

    socket.on('leave_logIngredient', async () => {
        socket.leave('logIngredient')
    })

    socket.on("reserve", async (data) => {
        console.log(`user ${socket.user.firstName} is reserving`)
        const user = await User.findOne({
            where: {
                reservedIngredient: data.ingredient
            },
            attributes: ['id'],
            raw: true
        })

        if(user) {
            socket.emit('reserveError')
            return
        }

        await User.update({
            reservedIngredient: data.ingredient
        }, {
            where: {
                id: socket.user.id
            }
        })
        const users = await User.findAll({
            where: {
                reservedIngredient: {
                    [Op.ne]: null
                },
            },
            attributes: ['id', 'reservedIngredient']
        })
        io.to('logIngredient').emit("reserve_updated", users)
    })

    socket.on("unreserve", async () => {
        console.log(`user ${socket.user.firstName} is unreserving`)
        const user = await User.update({
            reservedIngredient: null
        }, {
            where: {
                id: socket.user.id
            }
        })
        console.log(user)
        const users = await User.findAll({
            where: {
                reservedIngredient: {
                    [Op.ne]: null
                }
            },
            attributes: ['id', 'reservedIngredient']
        })
        io.to('logIngredient').emit("reserve_updated", users)
    })

    socket.on('join_logProduct', async () => {
        if (socket.user.access === 'associate-member') {
            console.log(socket.user.firstName + 'is not authorized')
            socket.emit('error', { message: 'Not authorized' })
            return
        }
        console.log(`user ${socket.user.firstName} is logging a product`)
        socket.join('logProduct')
        const users = await User.findAll({
            where: {
                reservedProduct: {
                    [Op.ne]: null
                }
            },
            attributes: ['id', 'reservedProduct']
        })
        socket.emit("reserve_updated", users)
    })

    socket.on('leave_logProduct', async () => {
        socket.leave('logProduct')
    })

    socket.on("reserve_product", async (data) => {
        console.log(`user ${socket.user.firstName} is reserving`)
        const user = await User.findOne({
            where: {
                reservedProduct: data.product
            },
            attributes: ['id'],
            raw: true
        })

        if(user) {
            socket.emit('reserveError')
            return
        }

        await User.update({
            reservedProduct: data.product
        }, {
            where: {
                id: socket.user.id
            }
        })
        const users = await User.findAll({
            where: {
                reservedProduct: {
                    [Op.ne]: null
                },
            },
            attributes: ['id', 'reservedProduct']
        })
        io.to('logProduct').emit("reserve_updated", users)
    })

    socket.on("unreserve_product", async () => {
        console.log(`user ${socket.user.firstName} is unreserving`)
        await User.update({
            reservedProduct: null
        }, {
            where: {
                id: socket.user.id
            }
        })
        const users = await User.findAll({
            where: {
                reservedProduct: {
                    [Op.ne]: null
                }
            },
            attributes: ['id', 'reservedProduct']
        })
        io.to('logProduct').emit("reserve_updated", users)
    })

    socket.on("log_ingredient", async () => {
        socket.broadcast.emit('log_ingredient', socket.user.id)
    })

    socket.on("log_product", async () => {
        socket.broadcast.emit('log_product', socket.user.id)
    })

    socket.on("dissmissNotification", async (id) => {

    })

    socket.on('disconnect', async (reason) => {
        const user = await User.findOne({
            where: {
                id: socket.user.id
            }
        })

        if(!user) return
        console.log(`user ${socket.user.firstName} has disconnected.\nReason: ${reason}`)
        socket.disconnect(true)

        if(user.reservedIngredient !== null) {
            user.reservedIngredient = null
            await user.save()
            const users = await User.findAll({
                where: {
                    reservedProduct: {
                        [Op.ne]: null
                    }
                },
                attributes: ['id', 'reservedIngredient']
            })
            io.to('logIngredient').emit("reserve_updated", users)
        }

        if(user.reservedProduct !== null) {
            user.reservedProduct = null
            await user.save()
            const users = await User.findAll({
                where: {
                    reservedProduct: {
                        [Op.ne]: null
                    }
                },
                attributes: ['id', 'reservedProduct']
            })
            io.to('logProduct').emit("reserve_updated", users)
        }
    })
})

cron.schedule('0 0 * * *', checkExpiryDates)
cron.schedule('0 0 * * *', deleteNotificationArchive)
cron.schedule('0 0 * * *', deleteRefreshTokens)