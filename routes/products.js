const router = require('express').Router()
const db = require('../db')
const Product = db.models.Product
const ProductIngredient = db.models.ProductIngredient

router.post('/', async (req, res) => {
    Product.create({ name: req.body.product.name, desc: req.body.product.desc }).then(data => {
        const productId = data.toJSON().id
        const newArr = req.body.ingredients.map(i => {
            return { ...i, productId: productId }
        })
        console.log(newArr)

        ProductIngredient.bulkCreate(newArr)
        res.status(200).send(data.toJSON())
    }).catch(err => {
        console.error(err)
        res.status(500).send("it broke")
    })
})

module.exports = router
