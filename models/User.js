module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        email: {
            type: DataTypes.STRING(255),
            isNull: false
        },
        password: {
            type: DataTypes.STRING(255),
            isNull: false
        },
        firstName: {
            type: DataTypes.STRING(255),
            isNull: false
        },
        lastName: {
            type: DataTypes.STRING(255),
            isNull: false
        },
        access: {
            type: DataTypes.ENUM('root', 'admin', 'member', 'associate-member'),
            defaultValue: 'associate-member',
            isNull: false
        },
        reservedIngredient: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: 'Ingredients',
                key: 'id'
            }
        },
        reservedProduct: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: 'Products',
                key: 'id'
            }
        },
        lastIngredientLogId: {
            type: DataTypes.UUID,
            references: {
                model: 'IngredientLogGroups',
                key: 'id'
            }
        },
        lastProductLogId: {
            type: DataTypes.UUID,
            references: {
                model: 'ProductLogGroups',
                key: 'id'
            }
        },
        loginToken: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        }
    }, {
        paranoid: true
    })

    return User
}