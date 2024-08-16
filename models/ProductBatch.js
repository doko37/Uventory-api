module.exports = (sequelize, DataTypes) => {
    const ProductBatch = sequelize.define('ProductBatch', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        batchNo: {
            type: DataTypes.STRING(255)
        },
        productId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Products',
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
            type: DataTypes.INTEGER
        },
        location: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Locations',
                key: 'id'
            }
        }
    })

    return ProductBatch
}