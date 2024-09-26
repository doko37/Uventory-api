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
const deleteNotificationArchive = require('./deleteNotificationArchive')
const jwt = require('jsonwebtoken')
const { Op } = require('sequelize')
const tokenSecret = process.env.TOKEN_SECRET

app.use(cors())
app.use(express.json())
app.use('/api/auth', auth)
app.use('/api/ingredients', ingredients)
app.use('/api/products', products)
app.use('/api/suppliers', suppliers)
app.use('/api/locations', locations)
app.use('/api/notifications', notifications)
const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
})

db.sync({ alter: true }).then((req) => {
    server.listen(5000, () => {
        console.log("Listening on port 5000")
    })
})

const tokenMiddleware = (socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) console.error('invalid token')
    if (!token) return next(new Error('Invalid token'))
    jwt.verify(token, tokenSecret, (err, user) => {
        if (err && err.name === 'TokenExpiredError') {
            console.error('token expired')
            return next(new Error('Token expired'))
        }
        if (err) return next(new Error('Token error'))
        socket.user = user
        next()
    })
}

io.use(tokenMiddleware)

io.on("connection", (socket) => {
    console.log(`User ${socket.user.firstName} has connected.`)

    socket.on('logIngredient', async () => {
        if(socket.user.access !== 'admin') {
            console.log(socket.user.firstName + 'is not authorized')
            throw new Error('Not authorized')
        }
        console.log(`user ${socket.user.firstName} is logging an ingredient`)
        socket.join('logIngredient')
        const users = await User.findAll({
            where: {
                reservedIngredient: {
                    [Op.ne]: null
                }
            }
        })
        socket.emit("reserve_updated", users)
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
            }
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
            }
        })
        io.to('logIngredient').emit("reserve_updated", users)
        socket.leave('logIngredient')
    })

    socket.on("dissmissNotification", async (id) => {

    })
})

cron.schedule('0 0 * * *', checkExpiryDates)
cron.schedule('0 0 * * *', deleteNotificationArchive)