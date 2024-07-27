module.exports = (sequelize, DataTypes) => {
    const IngredientBatchIngredientLog = sequelize.define('IngredientBatchIngredientLog', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        batchNo: {
            type: DataTypes.STRING(255),
            references: {
                model: 'IngredientBatches',
                key: 'batchNo'
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
            type: DataTypes.FLOAT(3)
        }
    })

    return IngredientBatchIngredientLog
}