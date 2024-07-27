module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        email: {
            type: DataTypes.STRING(255)
        },
        firstName: {
            type: DataTypes.STRING(255)
        },
        lastName: {
            type: DataTypes.STRING(255)
        },
        isAdmin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    })

    return User
}