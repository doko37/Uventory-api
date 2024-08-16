module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('Product', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            isNull: false
        },
        desc: {
            type: DataTypes.TEXT,
            isNull: false
        },
        brand: {
            type: DataTypes.STRING(255),
            references: {
                model: 'Brands',
                key: 'name'
            }
        },
        qty: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        memo: {
            type: DataTypes.TEXT
        }
    })

    return Product
}

