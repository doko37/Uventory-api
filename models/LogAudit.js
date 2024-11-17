module.exports = (sequelize, DataTypes) => {
    const LogAudit = sequelize.define('LogAudit', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true
        },
        ingredientId: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Ingredients',
                key: 'id'
            },
            allowNull: true
        },
        productId: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Products',
                key: 'id'
            },
            allowNull: true
        },
        ingredientLogId: {
            type: DataTypes.UUID,
            references: {
                model: 'IngredientLogs',
                key: 'id'
            },
            allowNull: true
        },
        productLogId: {
            type: DataTypes.UUID,
            references: {
                model: 'ProductLogs',
                key: 'id'
            },
            allowNull: true
        },
        logAction: {
            type: DataTypes.ENUM('create', 'update', 'delete')
        },
        inOut: {
            type: DataTypes.ENUM('in', 'out'),
            allowNull: true
        },
        batchNo: {
            type: DataTypes.STRING(255)
        },
        qty: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        prevQty: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        user: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Users',
                key: 'id'
            }
        },
    })

    return LogAudit
}