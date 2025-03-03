module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define('Notification', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true,
        },
        user: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            references: {
                model: 'Users',
                key: 'id'
            }
        },
        type: {
            type: DataTypes.ENUM('lowStock', 'expiryDate')
        },
        dismissed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        msg: {
            type: DataTypes.TEXT,
        }
    })

    return Notification
}
