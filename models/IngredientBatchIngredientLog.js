module.exports = (sequelize, DataTypes) => {
    const IngredientBatchIngredientLog = sequelize.define('IngredientBatchIngredientLog', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        batchId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'IngredientBatches',
                key: 'id'
            }
        },
        logId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'IngredientLogs',
                key: 'id'
            }
        },
        batchQtyUsed: {
            type: DataTypes.FLOAT
        }
    })

    return IngredientBatchIngredientLog
}