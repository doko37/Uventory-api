const db = require('./db')
const { DateTime } = require('luxon')
const IngredientBatch = db.models.IngredientBatch
const Ingredient = db.models.Ingredient
const Notification = db.models.Notification

const checkExpiryDates = async () => {
    try {
        const batches = await IngredientBatch.findAll({
            where: {
                alertDismissed: false
            },
            include: [
                {
                    model: Ingredient,
                    attributes: ['name']
                }
            ],
            order: [['expDate', 'ASC']]
        })

        for (let batch of batches) {
            const expDate = new Date(batch.expDate).toISOString()
            const dateDiff = Math.floor(DateTime.fromISO(expDate).diff(DateTime.now(), 'days').days)
            if (dateDiff <= 30) {
                await Notification.create({
                    batchId: batch.id,
                    type: 'expiryDate',
                    msg: `Batch ${batch.batchNo} for Ingredient "${batch.Ingredient.name}" has ${dateDiff} days until it expires!`
                })
            } else {
                break
            }
        }

    } catch (err) {
        console.error(err)
    }
}

module.exports = checkExpiryDates