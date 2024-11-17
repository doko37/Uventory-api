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
            unique: true
        },
        name: {
            type: DataTypes.STRING(255),
            unique: true,
            isNull: false,
        },
        category: {
            type: DataTypes.INTEGER.UNSIGNED,
            isNull: false,
            references: {
                model: 'IngredientCategories',
                key: 'id'
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
        ed: {
            type: DataTypes.STRING(255),
            allowNull: true,
            references: {
                model: 'Eds',
                key: 'id'
            }
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