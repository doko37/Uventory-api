const db = require('./db')
const { DateTime } = require('luxon')
const { Op } = require('sequelize')
const IngredientBatch = db.models.IngredientBatch
const Ingredient = db.models.Ingredient
const Product = db.models.Product
const ProductBatch = db.models.ProductBatch
const Notification = db.models.Notification

const checkExpiryDates = async () => {
    try {
        const batches = await IngredientBatch.findAll({
            where: {
                alertDismissed: false,
                expDate: { [Op.ne]: null }
            },
            include: [
                {
                    model: Ingredient,
                    attributes: ['name', 'expirationTime']
                }
            ],
            order: [['expDate', 'ASC']],
            raw: true
        })

        for (let batch of batches) {
            const expDate = new Date(batch.expDate)
            const dateDiff = DateTime.fromJSDate(expDate).diff(DateTime.now(), 'days').days
            if(dateDiff < batch['Ingredient.expirationTime']) {
                await Notification.create({
                    type: 'expiryDate',
                    msg: `Batch ${batch.batchNo} for Ingredient "${batch['Ingredient.name']}" has ${dateDiff.toFixed(0)} days until it expires!`
                })
                await IngredientBatch.update({
                    alertDismissed: true
                }, {
                    where: {
                        id: batch.id
                    }
                })
            }
        }

        const productBatches = await ProductBatch.findAll({
            where: {
                alertDismissed: false,
                expDate: { [Op.ne]: null }
            },
            include: [
                {
                    model: Product,
                    attributes: ['name', 'expirationTime']
                }
            ],
            order: [['expDate', 'ASC']],
            raw: true
        })

        for (let batch of productBatches) {
            const expDate = new Date(batch.expDate)
            const dateDiff = DateTime.fromJSDate(expDate).diff(DateTime.now(), 'days').days
            if(dateDiff < batch['Product.expirationTime']) {
                await Notification.create({
                    type: 'expiryDate',
                    msg: `Batch ${batch.batchNo} for Product "${batch['Product.name']}" has ${dateDiff.toFixed(0)} days until it expires!`
                })
                await ProductBatch.update({
                    alertDismissed: true
                }, {
                    where: {
                        id: batch.id
                    }
                })
            }
        }
    } catch (err) {
        console.error(err)
    }
}

module.exports = checkExpiryDates