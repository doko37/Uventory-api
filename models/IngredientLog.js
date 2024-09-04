module.exports = (sequelize, DataTypes) => {
    const IngredientLog = sequelize.define('IngredientLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true,
        },
        ingredientId: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Ingredients',
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
            type: DataTypes.FLOAT
        },
        inProduct: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Products',
                key: 'id'
            }
        },
        remark: {
            type: DataTypes.TEXT
        }
    })

    return IngredientLog
}