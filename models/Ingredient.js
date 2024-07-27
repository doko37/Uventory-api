module.exports = (sequelize, DataTypes) => {
    const Ingredient = sequelize.define('Ingredient', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255)
        },
        category: {
            type: DataTypes.ENUM('ingredient', 'raw-material', 'package')
        },
        supplier: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Suppliers',
                key: 'id'
            }
        },
        stockAlert: {
            type: DataTypes.INTEGER
        },
        unit: {
            type: DataTypes.ENUM('mg', 'g', 'kg', 'ml', 'l', 'mol')
        }
    })

    return Ingredient
}