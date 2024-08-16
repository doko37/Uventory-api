module.exports = (sequelize, DataTypes) => {
    const IngredientLog = sequelize.define('IngredientLog', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        ingredientId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Ingredients',
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
            type: DataTypes.FLOAT
        },
        inProduct: {
            type: DataTypes.INTEGER,
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