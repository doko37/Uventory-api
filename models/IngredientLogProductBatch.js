module.exports = (sequelize, DataTypes) => {
    const IngredientLogProductBatch = sequelize.define('IngredientLogProductBatch', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        ingredientLogId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'IngredientLogs',
                key: 'id'
            }
        },
        productBatchNo: {
            type: DataTypes.STRING(255),
            references: {
                model: 'ProductBatches',
                key: 'batchNo'
            }
        }
    })

    return IngredientLogProductBatch
}