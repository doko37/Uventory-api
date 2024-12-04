module.exports = (sequelize, DataTypes) => {
    const ProductBatch = sequelize.define('ProductBatch', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true
        },
        productId: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Products',
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
        },
        flagged: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    })

    return ProductBatch
}