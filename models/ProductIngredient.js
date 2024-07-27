module.exports = (sequelize, DataTypes) => {
    const ProductIngredient = sequelize.define('ProductIngredient', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        ingredientId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Ingredients',
                key: 'id'
            }
        },
        productId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Products',
                key: 'id'
            }
        },
        ingredientQty: {
            type: DataTypes.FLOAT(3)
        }
    })

    return ProductIngredient
}