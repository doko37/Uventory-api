module.exports = (sequelize, DataTypes) => {
    const IngredientLogGroup = sequelize.define('IngredientLogGroup', {
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
        inProduct: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Products',
                key: 'id'
            },
            allowNull: true
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
        }
    }, {
        paranoid: true,
        indexes: [
            {
                unique: false,
                fields: ['ingredientId']
            },
            {
                unique: false,
                fields: ['createdAt']
            }
        ]
    })

    return IngredientLogGroup
}
