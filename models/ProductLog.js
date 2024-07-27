module.exports = (sequelize, DataTypes) => {
    const ProductLog = sequelize.define('ProductLog', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        productId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Products',
                key: 'id'
            }
        },
        productBatchNo: {
            type: DataTypes.STRING(255),
            references: {
                model: 'ProductBatches',
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
            type: DataTypes.INTEGER
        }
    })

    return ProductLog
}