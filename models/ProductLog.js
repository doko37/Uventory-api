module.exports = (sequelize, DataTypes) => {
    const ProductLog = sequelize.define('ProductLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true,
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
        location: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Locations',
                key: 'id'
            }
        },
        user: {
            type: DataTypes.INTEGER.UNSIGNED,
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