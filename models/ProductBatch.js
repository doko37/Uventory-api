module.exports = (sequelize, DataTypes) => {
    const ProductBatch = sequelize.define('ProductBatch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true
        },
        batchNo: {
            type: DataTypes.STRING(255)
        },
        productId: {
            type: DataTypes.INTEGER.UNSIGNED,
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

    return ProductBatch
}