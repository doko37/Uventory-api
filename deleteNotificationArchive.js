const db = require('./db')
const { Op } = require('sequelize')
const Notification = db.models.Notification
const RefreshToken = db.models.RefreshToken

const deleteNotificationArchive = async () => {
    try {
        await Notification.destroy({
            where: {
                updatedAt: {
                    [Op.lt]: new Date(new Date() - (24 * 7) * 60 * 60 * 1000)
                },
                dismissed: true
            }
        })
    } catch (err) {
        console.error('Error deleting archive notifications', err)
    }
}

const deleteRefreshTokens = async () => {
    try {
        const date = new Date()
        date.setDate(date.getDate() - 1)

        await RefreshToken.destroy({
            where: {
                createdAt: {
                    [Op.lt]: date
                }
            }
        })
    } catch (err) {
        console.error(err)
    }
}

module.exports = { deleteNotificationArchive, deleteRefreshTokens }