module.exports = (sequelize, DataTypes) => {
    const IngredientBatch = sequelize.define('IngredientBatch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true,
        },
        ingredientId: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Ingredients',
                key: 'id'
            }
        },
        logId: {
            type: DataTypes.UUID,
            references: {
                model: 'IngredientLogGroups',
                key: 'id'
            }
        },
        batchNo: {
            type: DataTypes.STRING(255)
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
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Locations',
                key: 'id'
            }
        },
        alertDismissed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    })

    return IngredientBatch
}
