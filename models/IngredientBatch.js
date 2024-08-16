module.exports = (sequelize, DataTypes) => {
    const IngredientBatch = sequelize.define('IngredientBatch', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        batchNo: {
            type: DataTypes.STRING(255)
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
            type: DataTypes.FLOAT
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
