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
            type: DataTypes.ENUM('admin', 'member', 'associate-member'),
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
        lastLogId: {
            type: DataTypes.UUID,
            references: {
                model: 'IngredientLogGroups',
                key: 'id'
            }
        }
    })

    return User
}