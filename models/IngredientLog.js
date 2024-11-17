module.exports = (sequelize, DataTypes) => {
    const IngredientLog = sequelize.define('IngredientLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true,
        },
        logGroup: {
            type: DataTypes.UUID,
            references: {
                model: 'IngredientLogGroups',
                key: 'id'
            }
        },
        batchNo: {
            type: DataTypes.STRING(255)
        },
        expDate: {
            type: DataTypes.DATE
        },
        poDate: {
            type: DataTypes.DATE
        },
        qty: {
            type: DataTypes.FLOAT
        },
        batchQty: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: null
        },
        unit: {
            type: DataTypes.ENUM('mg', 'g', 'kg', 'ml', 'l', 'ea'),
            isNull: false,
        },
        location: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Locations',
                key: 'id'
            }
        },
        batchDeleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        flagged: {
            type: DataTypes.BOOLEAN,
            default: false
        }
    }, {
        paranoid: true,
        indexes: [
            {
                unique: false,
                fields: ['createdAt']
            }
        ]
    })

    return IngredientLog
}