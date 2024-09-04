module.exports = (sequelize, DataTypes) => {
    const Ingredient = sequelize.define('Ingredient', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        code: {
            type: DataTypes.STRING(255),
            unique: false
        },
        name: {
            type: DataTypes.STRING(255),
            isNull: false,
        },
        category: {
            type: DataTypes.STRING(255),
            isNull: false,
            references: {
                model: 'IngredientCategories',
                key: 'name'
            }
        },
        supplier: {
            type: DataTypes.INTEGER.UNSIGNED,
            isNull: false,
            references: {
                model: 'Suppliers',
                key: 'id'
            }
        },
        stockAlert: {
            type: DataTypes.FLOAT,
            isNull: false
        },
        unit: {
            type: DataTypes.ENUM('mg', 'g', 'kg', 'ml', 'l', 'ea'),
            isNull: false,
        },
        qty: {
            type: DataTypes.FLOAT,
            isNull: false,
            defaultValue: 0
        },
        ed: {
            type: DataTypes.ENUM('Yes', 'No')
        },
        reciever: {
            type: DataTypes.STRING(255)
        },
        alertDismissed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    })

    return Ingredient
}