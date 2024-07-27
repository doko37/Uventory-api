module.exports = (sequelize, DataTypes) => {
    const IngredientLog = sequelize.define('IngredientLog', {
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
        ingredientBatchNo: {
            type: DataTypes.STRING(255),
            references: {
                model: 'IngredientBatches',
                key: 'batchNo'
            }
        },
        user: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Users',
                key: 'id'
            }
        },
        inout: {
            type: DataTypes.ENUM('in', 'out')
        },
        qty: {
            type: DataTypes.FLOAT(3)
        }
    })

    return IngredientLog
}