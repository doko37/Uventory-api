const db = require('./db')
const { Op } = require('sequelize')
const Notification = db.models.Notification

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

module.exports = deleteNotificationArchive