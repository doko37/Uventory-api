module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('Product', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        category: {
            type: DataTypes.INTEGER.UNSIGNED,
            isNull: false,
            references: {
                model: 'ProductCategories',
                key: 'id'
            }
        },
        code: {
            type: DataTypes.STRING(255),
            unique: true
        },
        name: {
            type: DataTypes.STRING(255),
            isNull: false,
            unique: true
        },
        brand: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Brands',
                key: 'id'
            }
        },
        memo: {
            type: DataTypes.TEXT
        },
        expirationTime: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 60
        }
    }, {
        paranoid: true
    })

    return Product
}

