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
const db = require('./db')
const User = db.models.User
const cors = require('cors')
const checkExpiryDates = require('./checkExpiryDates')
const { deleteNotificationArchive, deleteRefreshTokens } = require('./deleteNotificationArchive')
const jwt = require('jsonwebtoken')
const { Op } = require('sequelize')
const tokenSecret = process.env.TOKEN_SECRET

app.use(cors())
app.use(express.json())
const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
})

const checkToken = (socket) => {
    const token = socket.handshake.auth.token
    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') {
            socket.emit('token_expired', 'Token expired')
            console.error('checkToken, token expired')
            return next(new Error('Token expired'))
        }
        if (err) {
            socket.emit('token_error', 'Token error')
            return next(new Error('Token error'))
        }
    })
}

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
app.use('/api/ingredients', ingredients)
app.use('/api/products', products)
app.use('/api/suppliers', suppliers)
app.use('/api/locations', locations)
app.use('/api/notifications', notifications)

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

    socket.on("dissmissNotification", async (id) => {

    })

    socket.on('disconnect', async (reason) => {
        console.log(`user ${socket.user.firstName} has disconnected.\nReason: ${reason}`)
        const users = await User.update({
            reservedIngredient: null
        }, {
            where: {
                id: socket.user.id
            },
            attributes: ['id', 'reservedIngredient']
        })
        io.to('logIngredient').emit("reserve_updated", users)
    })
})

cron.schedule('0 0 * * *', checkExpiryDates)
cron.schedule('0 0 * * *', deleteNotificationArchive)
cron.schedule('0 0 * * *', deleteRefreshTokens)
// cron.schedule('* * * * *', () => {
//     io.sockets.sockets.forEach((socket) => {
//         console.log(`Checking token for user: ${socket.user.firstName}`)
//         checkToken(socket)
//     })
// })