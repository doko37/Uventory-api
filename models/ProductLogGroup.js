module.exports = (sequelize, DataTypes) => {
    const ProductLogGroup = sequelize.define('ProductLogGroup', {
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
        ed: {
            type: DataTypes.STRING(255),
            references: {
                model: 'Eds',
                key: 'id'
            }
        },
        remark: {
            type: DataTypes.TEXT
        },
    }, {
        paranoid: true,
        indexes: [
            {
                unique: false,
                fields: ['productId']
            },
            {
                unique: false,
                fields: ['createdAt']
            }
        ]
    })

    return ProductLogGroup
}
