module.exports = (sequelize, DataTypes) => {
    const IngredientBatch = sequelize.define('IngredientBatch', {
        batchNo: {
            type: DataTypes.STRING(255),
            primaryKey: true
        },
        ingredientId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Ingredients',
                key: 'id'
            }
        },
        expDate: {
            type: DataTypes.DATE
        },
        poDate: {
            type: DataTypes.DATE
        },
        qty: {
            type: DataTypes.FLOAT(3)
        },
        location: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Locations',
                key: 'id'
            }
        }
    })

    return IngredientBatch
}
