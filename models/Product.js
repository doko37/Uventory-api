module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('Product', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            isNull: false
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
        }
    })

    return Product
}

