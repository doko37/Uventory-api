module.exports = (sequelize, DataTypes) => {
    const ProductBatch = sequelize.define('ProductBatch', {
        batchNo: {
            type: DataTypes.STRING(255),
            primaryKey: true
        },
        productId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Products',
                key: 'id'
            }
        },
        user: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Users',
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
        inout: {
            type: DataTypes.ENUM('in', 'out')
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