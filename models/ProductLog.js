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
        batchNo: {
            type: DataTypes.STRING(255)
        },
        location: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Locations',
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
        inout: {
            type: DataTypes.ENUM('in', 'out')
        },
        qty: {
            type: DataTypes.INTEGER
        },
        remark: {
            type: DataTypes.TEXT
        }
    })

    return ProductLog
}